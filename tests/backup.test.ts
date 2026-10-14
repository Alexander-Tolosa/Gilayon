import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { document, meta, session } from '../db/schema'
import { seed } from '../db/seed'

const tmp = (p: string) => mkdtempSync(path.join(tmpdir(), `himsog-${p}-`))
const UP_A = tmp('up-a')
const UP_B = tmp('up-b')
const BK = tmp('backups')
const OFF = tmp('offsite')
process.env.PGLITE_DIR = 'memory://'
process.env.UPLOADS_DIR = UP_A

const PASS = 'correct horse battery staple'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const { getDb, resetDbHandle } = await import('../src/server/db')
const { loadSnapshot } = await import('../src/server/state')
const { createBackup, backupStatus, listBackups, backupConfig, configProblem } = await import('../src/server/backup/backup')
const { readArchive } = await import('../src/server/backup/archive')
const { restoreBackup } = await import('../src/server/backup/restore')
const { isDue, parseAt } = await import('../src/server/backup/scheduler')
const { uploadScan } = await import('../src/server/services/records')
const { login } = await import('../src/server/auth')

const doctor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' as const }
const cfg = (over: Partial<ReturnType<typeof backupConfig>> = {}) => ({ ...backupConfig({ BACKUP_DIR: BK, UPLOADS_DIR: UP_A, BACKUP_PASSPHRASE: PASS } as NodeJS.ProcessEnv), ...over })

let first: Awaited<ReturnType<typeof createBackup>>
let snapCounts: Record<string, number>

beforeAll(async () => {
  const db = await getDb()
  await seed(db)
  const snap = await loadSnapshot(db, doctor)
  await db.transaction((tx) => uploadScan(tx, doctor, snap.patients[0].patient_id, PNG, 'Chart', '2026-01-01'))
  snapCounts = { patients: snap.patients.length, documents: snap.documents.length, prescriptions: snap.prescriptions.length }
  first = await createBackup(db, cfg(), { date: new Date(Date.now() + 1000) })
})

describe('creating a backup', () => {
  it('writes one verified, encrypted file with every table and the scanned pages', async () => {
    expect(first.ok).toBe(true)
    expect(existsSync(path.join(BK, first.file))).toBe(true)
    expect(first.file).toMatch(/^himsog-\d{8}-\d{6}\.hbk$/)
    expect(first.tables.patient).toBe(snapCounts.patients)
    expect(first.tables.document).toBe(snapCounts.documents)
    expect(first.scans).toBe(1)
    expect(readdirSync(BK).some((f) => f.endsWith('.partial'))).toBe(false)
    // Patient data must not be readable in the file.
    const bytes = readFileSync(path.join(BK, first.file)).toString('latin1')
    expect(bytes.includes('Maria Lourdes')).toBe(false)
    expect(bytes.includes('"patient_no"')).toBe(false)
  })

  it('records the result and what the screens show as safely backed up', async () => {
    const db = await getDb()
    const status = await backupStatus(db, cfg())
    expect(status.last).toMatchObject({ ok: true, file: first.file })
    expect(status.files[0].name).toBe(first.file)
    const snap = await loadSnapshot(db, doctor)
    expect(snap.offsite.lastAt).toBe(first.at)
    expect(snap.offsite.pending).toBe(0)
  })
})

describe('trusting a backup', () => {
  const file = () => path.join(BK, first.file)

  it('verifies a good file', async () => {
    const r = await readArchive(file(), PASS)
    expect(r.problems).toEqual([])
    expect(r.manifest.encrypted).toBe(true)
  })

  it('refuses the wrong passphrase and a missing one', async () => {
    await expect(readArchive(file(), 'not the right passphrase')).rejects.toThrow(/passphrase|changed/i)
    await expect(readArchive(file(), undefined)).rejects.toThrow(/passphrase/i)
  })

  it('detects a changed byte and a truncated file', async () => {
    const buf = readFileSync(file())
    const flipped = Buffer.from(buf)
    flipped[Math.floor(buf.length / 2)] ^= 0xff
    const a = path.join(BK, 'tampered.bin')
    writeFileSync(a, flipped)
    await expect(readArchive(a, PASS)).rejects.toThrow()
    const b = path.join(BK, 'cut.bin')
    writeFileSync(b, buf.subarray(0, Math.floor(buf.length / 2)))
    await expect(readArchive(b, PASS)).rejects.toThrow()
  })

  it('will not run unencrypted unless allowed, and wants a long passphrase', () => {
    expect(configProblem(cfg({ passphrase: undefined, allowPlain: false }))).toMatch(/BACKUP_PASSPHRASE/)
    expect(configProblem(cfg({ passphrase: 'short' }))).toMatch(/12 characters/)
    expect(configProblem(cfg({ passphrase: undefined, allowPlain: true }))).toBeNull()
  })

  it('an unencrypted backup (development) still verifies and holds the same data', async () => {
    const db = await getDb()
    const dir = tmp('plain')
    const r = await createBackup(db, cfg({ dir, passphrase: undefined, allowPlain: true }), { date: new Date(2026, 0, 2, 2, 0, 0) })
    const v = await readArchive(path.join(dir, r.file), undefined)
    expect(v.problems).toEqual([])
    expect(v.manifest.encrypted).toBe(false)
  })
})

describe('keeping backups tidy', () => {
  it('keeps only the newest N in each folder', async () => {
    const db = await getDb()
    const dir = tmp('keep')
    for (let d = 1; d <= 5; d++) await createBackup(db, cfg({ dir, keep: 3 }), { date: new Date(2026, 1, d, 2, 0, 0) })
    const names = (await listBackups(dir)).map((f) => f.name)
    expect(names).toEqual(['himsog-20260205-020000.hbk', 'himsog-20260204-020000.hbk', 'himsog-20260203-020000.hbk'])
  })

  it('copies to the off-site folder, and says so when that copy fails', async () => {
    const db = await getDb()
    const good = await createBackup(db, cfg({ offsiteDir: OFF }), { date: new Date(2026, 2, 1, 2, 0, 0) })
    expect(good.offsite).toEqual({ ok: true })
    expect(existsSync(path.join(OFF, good.file))).toBe(true)

    // An off-site "folder" that is really a file cannot be written to.
    const blocker = path.join(tmp('blocker'), 'not-a-folder')
    writeFileSync(blocker, 'x')
    const [before] = await db.select().from(meta).where(eq(meta.key, 'last_backup_at'))
    const bad = await createBackup(db, cfg({ offsiteDir: blocker }), { date: new Date(2026, 2, 2, 2, 0, 0) })
    expect(bad.ok).toBe(true)
    expect(bad.offsite?.ok).toBe(false)
    const [after] = await db.select().from(meta).where(eq(meta.key, 'last_backup_at'))
    // Not safe off-site yet, so the "waiting for off-site backup" counter must not reset.
    expect(after.value).toBe(before.value)
  })

  it('fails loudly when the backup drive is missing and keeps the last good record', async () => {
    const db = await getDb()
    const missing = path.join(tmp('gone'), 'no-such-drive', 'backups')
    await expect(createBackup(db, cfg({ dir: missing }), { date: new Date(2026, 3, 1, 2, 0, 0) })).rejects.toThrow(/USB drive|not available/i)
    const st = await backupStatus(db, cfg())
    expect(st.last?.ok).toBe(false)
    expect(st.last?.error).toMatch(/not available/)
    expect(st.last?.file).toBeTruthy() // the previous good backup is still referenced
  })
})

describe('restoring', () => {
  it('rebuilds a fresh server from a backup: records, signed documents, scans, rules', async () => {
    const dbA = await getDb()
    const [signed] = await dbA.select().from(document).where(eq(document.status, 'signed')).limit(1)
    const { token } = await login(dbA, 'st-d1', 'demo-password')
    expect(token).toBeTruthy()

    resetDbHandle()
    const dbB = await getDb() // a second, empty in-memory database
    expect((await loadSnapshot(dbB, doctor)).patients).toHaveLength(0)

    const r = await restoreBackup(dbB, path.join(BK, first.file), PASS, UP_B)
    expect(r.tables.patient).toBe(snapCounts.patients)

    const snap = await loadSnapshot(dbB, doctor)
    expect(snap.patients).toHaveLength(snapCounts.patients)
    expect(snap.prescriptions).toHaveLength(snapCounts.prescriptions)
    expect(snap.documents.find((d) => d.document_id === signed.document_id)).toMatchObject({ status: 'signed', document_no: signed.document_no })
    expect(snap.scans.some((s) => s.file.startsWith('/api/scans/'))).toBe(true)
    expect(readdirSync(path.join(UP_B, 'scans'))).toHaveLength(1)

    // Everyone signs in again, and the safety rules still hold on the restored data.
    expect(await dbB.select().from(session)).toHaveLength(0)
    await expect(dbB.update(document).set({ findings: 'tampered' }).where(eq(document.document_id, signed.document_id))).rejects.toThrow()
    await expect(login(dbB, 'st-d1', 'demo-password')).resolves.toBeTruthy()
  })

  it('a damaged backup leaves the current records untouched', async () => {
    const db = await getDb()
    const before = (await loadSnapshot(db, doctor)).patients.length
    const buf = readFileSync(path.join(BK, first.file))
    buf[Math.floor(buf.length * 0.7)] ^= 0xff
    const bad = path.join(BK, 'bad-restore.hbk')
    writeFileSync(bad, buf)
    await expect(restoreBackup(db, bad, PASS, UP_B)).rejects.toThrow()
    expect((await loadSnapshot(db, doctor)).patients).toHaveLength(before)
    truncateSync(bad, 10)
  })
})

describe('the nightly schedule', () => {
  const at = parseAt('02:00')
  const d = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m)

  it('is not due before the slot, and due after it when nothing ran since', () => {
    const lastOk = d(2, 0, 14).getTime()
    expect(isDue(d(1, 0), lastOk, null, at)).toBe(false)
    expect(isDue(d(2, 5), lastOk, null, at)).toBe(true)
  })

  it('does not repeat once tonight\'s backup succeeded', () => {
    expect(isDue(d(9, 0), d(2, 1).getTime(), null, at)).toBe(false)
  })

  it('catches up when the PC was off for over a day, and waits 30 minutes after a failure', () => {
    expect(isDue(d(1, 0), d(2, 0, 13).getTime(), null, at)).toBe(true)
    expect(isDue(d(3, 0), d(2, 0, 13).getTime(), d(2, 50).getTime(), at)).toBe(false)
    expect(isDue(d(3, 30), d(2, 0, 13).getTime(), d(2, 50).getTime(), at)).toBe(true)
  })

  it('parses the configured time and falls back to 02:00', () => {
    expect(parseAt('23:30')).toBe(23 * 60 + 30)
    expect(parseAt('nonsense')).toBe(120)
    expect(parseAt(undefined)).toBe(120)
  })
})
