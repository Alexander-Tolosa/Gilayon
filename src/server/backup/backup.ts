import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { asc, eq, getTableColumns, getTableName } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import * as t from '../../../db/schema'
import { audit, nowMs } from '../core'
import type { Db } from '../db'
import type { BackupFile, BackupStatus } from '../../features/clinic/api-types'
import { ArchiveWriter, readArchive, type Manifest } from './archive'

/*
  Backups: one verified, encrypted file per run, written to BACKUP_DIR (the USB stick), then copied to
  BACKUP_OFFSITE_DIR when it is reachable (a synced or network folder). The newest BACKUP_KEEP are kept.
  A backup is only counted once it has been read back and every checksum matched.
*/

/** Every table that holds clinic data, parents first so a restore never breaks a foreign key. */
export const BACKUP_TABLES: PgTable[] = [
  t.person,
  t.employee,
  t.staff,
  t.priorityCategory,
  t.patient,
  t.patientRelationship,
  t.familyHistory,
  t.allergy,
  t.queueTicket,
  t.consultation,
  t.diagnosis,
  t.labOrder,
  t.prescription,
  t.prescriptionItem,
  t.document,
  t.scannedPage,
  t.recognitionEvent,
  t.auditLog,
  t.counter,
  t.meta,
  t.clientOp,
]
// Not backed up: `session` (everyone signs in again after a restore).

export type BackupConfig = {
  dir: string
  offsiteDir?: string
  passphrase?: string
  keep: number
  allowPlain: boolean
  uploadsDir: string
}

export function backupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  return {
    dir: path.resolve(/*turbopackIgnore: true*/ env.BACKUP_DIR ?? './backups'),
    offsiteDir: env.BACKUP_OFFSITE_DIR ? path.resolve(/*turbopackIgnore: true*/ env.BACKUP_OFFSITE_DIR) : undefined,
    passphrase: env.BACKUP_PASSPHRASE || undefined,
    keep: Math.max(3, Number(env.BACKUP_KEEP ?? 14) || 14),
    allowPlain: env.BACKUP_ALLOW_UNENCRYPTED === '1',
    uploadsDir: path.resolve(/*turbopackIgnore: true*/ env.UPLOADS_DIR ?? './uploads'),
  }
}

/** A message when backups cannot run as configured, otherwise null. */
export function configProblem(c: BackupConfig): string | null {
  if (!c.passphrase && !c.allowPlain) return 'Set BACKUP_PASSPHRASE: backups hold patient records and must be encrypted.'
  if (c.passphrase && c.passphrase.length < 12) return 'BACKUP_PASSPHRASE must be at least 12 characters.'
  return null
}

// New backups are named gilayon-*; archives made before the rename (himsog-*) are still listed, verified,
// restored and counted for retention, so a running install keeps its history.
const NAME = /^(?:gilayon|himsog)-(\d{8}-\d{6})\.hbk$/
const stamp = (d = new Date()) => {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function listBackups(dir: string): Promise<BackupFile[]> {
  try {
    const names = (await fsp.readdir(dir)).filter((n) => NAME.test(n))
    const out = await Promise.all(names.map(async (name) => ({ name, bytes: (await fsp.stat(path.join(dir, name))).size, modified: (await fsp.stat(path.join(dir, name))).mtimeMs })))
    // Newest first by timestamp, whichever prefix a file has.
    const when = (n: string) => NAME.exec(n)?.[1] ?? ''
    return out.sort((a, b) => when(b.name).localeCompare(when(a.name)) || b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

async function prune(dir: string, keep: number) {
  const files = await listBackups(dir)
  for (const f of files.slice(keep)) await fsp.unlink(path.join(dir, f.name)).catch(() => undefined)
  return Math.max(0, files.length - keep)
}

const PAGE = 1000

export type BackupResult = { ok: true; file: string; bytes: number; tables: Record<string, number>; scans: number; offsite: { ok: boolean; error?: string } | null; pruned: number; at: number }

/** Reads every table inside one repeatable-read transaction, so the export is a single consistent moment. */
async function writeDatabase(db: Db, w: ArchiveWriter) {
  const counts: Record<string, number> = {}
  await w.begin('database.ndjson')
  await db.transaction(
    async (tx) => {
      for (const table of BACKUP_TABLES) {
        const name = getTableName(table)
        const pk = Object.values(getTableColumns(table))[0]
        let n = 0
        for (let offset = 0; ; offset += PAGE) {
          const rows = await tx.select().from(table).orderBy(asc(pk)).limit(PAGE).offset(offset)
          if (!rows.length) break
          await w.write(rows.map((r) => JSON.stringify({ t: name, r })).join('\n') + '\n')
          n += rows.length
          if (rows.length < PAGE) break
        }
        counts[name] = n
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
  await w.end()
  return counts
}

export async function createBackup(db: Db, cfg: BackupConfig = backupConfig(), opts: { date?: Date } = {}): Promise<BackupResult> {
  const problem = configProblem(cfg)
  if (problem) throw new Error(problem)
  const at = opts.date?.getTime() ?? nowMs()
  const name = `gilayon-${stamp(opts.date)}.hbk`
  const partial = path.join(cfg.dir, `${name}.partial`)
  const final = path.join(cfg.dir, name)
  let w: ArchiveWriter | undefined
  try {
    // mkdir is not recursive on purpose: if the USB drive is not plugged in, the parent is missing and this fails.
    await fsp.mkdir(cfg.dir).catch(async (e: NodeJS.ErrnoException) => {
      if (e.code !== 'EEXIST') throw new Error(`The backup folder is not available (${cfg.dir}). Is the USB drive plugged in?`)
    })
    w = await ArchiveWriter.create(partial, cfg.passphrase)
    const tables = await writeDatabase(db, w)
    const scansDir = path.join(cfg.uploadsDir, 'scans')
    const scanFiles = await fsp.readdir(scansDir).catch(() => [] as string[])
    for (const f of scanFiles.sort()) await w.addFile(`uploads/scans/${f}`, path.join(scansDir, f))
    await w.finish({ created_at: at, encrypted: !!cfg.passphrase, app: 'gilayon', tables })
    // Read it back before trusting it.
    const check = await readArchive(partial, cfg.passphrase)
    if (check.problems.length) throw new Error(`The new backup did not verify: ${check.problems.join('; ')}`)
    await fsp.rename(partial, final)
    const bytes = (await fsp.stat(final)).size

    let offsite: BackupResult['offsite'] = null
    if (cfg.offsiteDir) {
      try {
        await fsp.mkdir(cfg.offsiteDir, { recursive: true })
        const target = path.join(cfg.offsiteDir, name)
        await fsp.copyFile(final, `${target}.partial`)
        if ((await fsp.stat(`${target}.partial`)).size !== bytes) throw new Error('The off-site copy is incomplete.')
        await fsp.rename(`${target}.partial`, target)
        await prune(cfg.offsiteDir, cfg.keep)
        offsite = { ok: true }
      } catch (e) {
        offsite = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
    const pruned = await prune(cfg.dir, cfg.keep)
    const result: BackupResult = { ok: true, file: name, bytes, tables, scans: scanFiles.length, offsite, pruned, at }
    await recordBackup(db, result, cfg)
    return result
  } catch (e) {
    await w?.abort().catch(() => undefined)
    await fsp.unlink(partial).catch(() => undefined)
    const error = e instanceof Error ? e.message : String(e)
    await recordFailure(db, error, at)
    throw new Error(error)
  }
}

async function setMeta(db: Db, key: string, value: unknown) {
  await db.insert(t.meta).values({ key, value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
}

async function recordBackup(db: Db, r: BackupResult, cfg: BackupConfig) {
  await setMeta(db, 'last_backup', { ok: true, at: r.at, file: r.file, bytes: r.bytes, scans: r.scans, offsite: r.offsite, offsite_configured: !!cfg.offsiteDir })
  // The "off-site pending" counter on every screen counts changes made since the last safe copy.
  if (!cfg.offsiteDir || r.offsite?.ok) await setMeta(db, 'last_backup_at', r.at)
  const rows = Object.values(r.tables).reduce((a, b) => a + b, 0)
  await audit(db, 'system', {
    action: 'backup',
    table: 'backup',
    record: r.file,
    summary: `Backup ${r.file} saved (${rows} records, ${r.scans} scans${r.offsite ? (r.offsite.ok ? ', copied off-site' : ', off-site copy FAILED') : ''})`,
  })
}

async function recordFailure(db: Db, error: string, at: number) {
  try {
    const [prev] = await db.select().from(t.meta).where(eq(t.meta.key, 'last_backup'))
    await setMeta(db, 'last_backup', { ...(prev?.value as object | undefined), ok: false, failed_at: at, error })
    await audit(db, 'system', { action: 'flag', table: 'backup', record: 'backup', summary: `Backup FAILED: ${error}` })
  } catch {
    /* the database itself may be what is down */
  }
}

export async function backupStatus(db: Db, cfg: BackupConfig = backupConfig()): Promise<BackupStatus> {
  const [row] = await db.select().from(t.meta).where(eq(t.meta.key, 'last_backup'))
  const problem = configProblem(cfg)
  return {
    configured: !problem,
    problem,
    encrypted: !!cfg.passphrase,
    offsiteConfigured: !!cfg.offsiteDir,
    last: (row?.value as BackupStatus['last']) ?? null,
    files: await listBackups(cfg.dir),
    keep: cfg.keep,
  }
}

export async function verifyBackup(file: string, passphrase?: string): Promise<{ manifest: Manifest; problems: string[] }> {
  return readArchive(file, passphrase)
}
