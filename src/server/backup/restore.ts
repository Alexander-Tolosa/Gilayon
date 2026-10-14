import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { getTableName, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { session } from '../../../db/schema'
import { audit } from '../core'
import type { Db } from '../db'
import { readArchive } from './archive'
import { BACKUP_TABLES } from './backup'

const BATCH = 500
const SCAN_NAME = /^[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$/

export type RestoreResult = { tables: Record<string, number>; scans: number; created_at: number }

/**
 * Replaces everything in the database (and the scanned pages) with the contents of a backup.
 * The archive is fully verified first; the database part runs in one transaction, so a failure
 * leaves the current records untouched. Stop the server before restoring.
 */
export async function restoreBackup(db: Db, file: string, passphrase: string | undefined, uploadsDir: string): Promise<RestoreResult> {
  const check = await readArchive(file, passphrase)
  if (check.problems.length) throw new Error(`This backup is damaged: ${check.problems.join('; ')}`)
  const byName = new Map(BACKUP_TABLES.map((tb) => [getTableName(tb), tb as PgTable]))
  const expected = check.manifest.tables
  for (const name of Object.keys(expected)) if (!byName.has(name)) throw new Error(`This backup has a table this version does not know: ${name}`)

  const scansDir = path.join(uploadsDir, 'scans')
  await fsp.mkdir(scansDir, { recursive: true })
  const restored: Record<string, number> = {}
  let scans = 0

  await db.transaction(async (tx) => {
    const all = [...BACKUP_TABLES.map((tb) => `"${getTableName(tb)}"`), `"${getTableName(session)}"`]
    await tx.execute(sql.raw(`TRUNCATE TABLE ${all.join(', ')} CASCADE`))

    let table = ''
    let rows: Record<string, unknown>[] = []
    let rest = ''
    const flush = async () => {
      if (table && rows.length) {
        await tx.insert(byName.get(table)!).values(rows as never)
        restored[table] = (restored[table] ?? 0) + rows.length
      }
      rows = []
    }
    const line = async (text: string) => {
      if (!text) return
      const { t: name, r } = JSON.parse(text) as { t: string; r: Record<string, unknown> }
      if (name !== table) {
        await flush()
        table = name
      }
      if (!byName.has(name)) throw new Error(`Unknown table in backup: ${name}`)
      rows.push(r)
      if (rows.length >= BATCH) await flush()
    }

    let scanFile: { handle: fsp.FileHandle } | null = null
    await readArchive(file, passphrase, {
      start: async (name) => {
        if (name.startsWith('uploads/scans/')) {
          const base = name.slice('uploads/scans/'.length)
          if (!SCAN_NAME.test(base)) throw new Error(`Unsafe file name in backup: ${base}`)
          scanFile = { handle: await fsp.open(path.join(scansDir, base), 'w', 0o600) }
        }
      },
      chunk: async (name, data) => {
        if (name === 'database.ndjson') {
          rest += data.toString()
          const parts = rest.split('\n')
          rest = parts.pop() ?? ''
          for (const p of parts) await line(p)
        } else if (scanFile) await scanFile.handle.write(data)
      },
      end: async (name) => {
        if (name === 'database.ndjson') {
          await line(rest)
          await flush()
        } else if (scanFile) {
          await scanFile.handle.close()
          scanFile = null
          scans++
        }
      },
    })

    for (const [name, n] of Object.entries(expected)) {
      if ((restored[name] ?? 0) !== n) throw new Error(`Restore check failed for ${name}: expected ${n} rows, restored ${restored[name] ?? 0}`)
    }
    await audit(tx, 'system', { action: 'backup', table: 'backup', record: path.basename(file), summary: `Restored from backup ${path.basename(file)} made ${new Date(check.manifest.created_at).toISOString()}` })
  })
  return { tables: restored, scans, created_at: check.manifest.created_at }
}
