import { count, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { auditLog, staff } from '../db/schema'
import { seed, wipe } from '../db/seed'
import { DEFAULT_CLINIC } from '../src/features/clinic/api-types'
import { login } from '../src/server/auth'
import { HttpError, type Actor } from '../src/server/core'
import { getDb, type Db } from '../src/server/db'
import { isDemoServer, setting } from '../src/server/env'
import { createFirstDoctor, disableDemoAccounts } from '../src/server/services/admin'
import { exportAuditCsv, listAudit } from '../src/server/services/auditlog'
import { getClinicProfile, setClinicProfile } from '../src/server/services/clinic'
import { AUDIT_LIMIT, loadPublicQueue, loadSnapshot } from '../src/server/state'

process.env.PGLITE_DIR = 'memory://'

let db: Db
const doctor: Actor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' }
const desk: Actor = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

beforeAll(async () => {
  db = await getDb()
  await seed(db)
})

describe('clinic letterhead', () => {
  it('starts from the default letterhead and reaches every snapshot, including the public one', async () => {
    expect(await getClinicProfile(db)).toEqual(DEFAULT_CLINIC)
    expect((await loadSnapshot(db, desk)).clinic.name).toBe(DEFAULT_CLINIC.name)
    expect((await loadPublicQueue(db)).clinic.name).toBe(DEFAULT_CLINIC.name)
  })

  it('saves trimmed details and a logo, and logs the change', async () => {
    const saved = await db.transaction((tx) => setClinicProfile(tx, doctor, { ...DEFAULT_CLINIC, name: '  Capitol Clinic ', license_no: 'DOH-123', logo: PNG }))
    expect(saved.name).toBe('Capitol Clinic')
    const s = await loadSnapshot(db, doctor)
    expect(s.clinic).toMatchObject({ name: 'Capitol Clinic', license_no: 'DOH-123', logo: PNG })
    expect(s.audit.some((a) => a.summary.includes('clinic letterhead'))).toBe(true)
  })

  it('refuses an empty name, over-long fields and a logo that is not an image', async () => {
    const bad = [
      { ...DEFAULT_CLINIC, name: '   ' },
      { ...DEFAULT_CLINIC, address: 'x'.repeat(161) },
      { ...DEFAULT_CLINIC, logo: 'data:text/html;base64,PHNjcmlwdD4=' },
      { ...DEFAULT_CLINIC, logo: `data:image/png;base64,${'A'.repeat(300_001)}` },
    ]
    for (const p of bad) await expect(db.transaction((tx) => setClinicProfile(tx, doctor, p))).rejects.toBeInstanceOf(HttpError)
    expect((await getClinicProfile(db)).name).toBe('Capitol Clinic')
  })

  it('only a doctor may change it over HTTP', async () => {
    const { PUT } = await import('../app/api/settings/clinic/route')
    const { token } = await login(db, 'st-f1', 'demo-password')
    const res = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(DEFAULT_CLINIC), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }))
    expect(res.status).toBe(403)
  })
})

describe('audit trail paging and export', () => {
  it('walks the whole log page by page with no gaps or repeats, even within one millisecond', async () => {
    const at = 1_000
    await db.insert(auditLog).values(['a', 'b', 'c', 'd', 'e'].map((x) => ({ log_id: `tie-${x}`, staff_id: 'st-d1', action: 'edit', table_name: 't', record_id: 'r', summary: `tie ${x}`, logged_at: at })))
    const [{ n }] = await db.select({ n: count() }).from(auditLog)
    const ids: string[] = []
    let page = await listAudit(db, { limit: 7 })
    for (;;) {
      ids.push(...page.rows.map((r) => r.log_id))
      const last = page.rows.at(-1)
      if (!page.more || !last) break
      page = await listAudit(db, { before: last.logged_at, beforeId: last.log_id, limit: 7 })
    }
    expect(ids).toHaveLength(n)
    expect(new Set(ids).size).toBe(n)
    expect(ids.filter((i) => i.startsWith('tie-'))).toEqual(['tie-e', 'tie-d', 'tie-c', 'tie-b', 'tie-a'])
  })

  it('caps a page at 500 rows', async () => {
    expect((await listAudit(db, { limit: 10_000 })).rows.length).toBeLessThanOrEqual(500)
  })

  it('exports every entry as CSV, keeps formulas as text, and logs the export', async () => {
    await db.insert(auditLog).values({ log_id: 'formula', staff_id: 'st-d1', action: 'edit', table_name: 't', record_id: 'r', summary: '=HYPERLINK("x")', logged_at: 2_000 })
    const [{ n }] = await db.select({ n: count() }).from(auditLog)
    const { csv, rows } = await db.transaction((tx) => exportAuditCsv(tx, doctor))
    expect(rows).toBe(n)
    expect(csv.trim().split('\n')).toHaveLength(n + 1)
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    const [last] = (await listAudit(db, { limit: 1 })).rows
    expect(last.action).toBe('export')
  })

  it('serves older pages and the export to doctors only, the export as a file', async () => {
    const page = await import('../app/api/audit/route')
    const exp = await import('../app/api/audit/export/route')
    const deskToken = (await login(db, 'st-f1', 'demo-password')).token
    const docToken = (await login(db, 'st-d1', 'demo-password')).token
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
    expect((await page.GET(new Request('http://x/api/audit', { headers: auth(deskToken) }))).status).toBe(403)
    expect((await page.GET(new Request('http://x/api/audit?before=abc', { headers: auth(docToken) }))).status).toBe(400)
    const ok = await page.GET(new Request('http://x/api/audit?limit=3', { headers: auth(docToken) }))
    expect(((await ok.json()) as { rows: unknown[] }).rows).toHaveLength(3)
    const file = await exp.POST(new Request('http://x/api/audit/export', { method: 'POST', headers: auth(docToken) }))
    expect(file.status).toBe(200)
    expect(file.headers.get('Content-Type')).toContain('text/csv')
    expect(file.headers.get('Content-Disposition')).toMatch(/attachment; filename="gilayon-audit-trail-/)
  })

  it('the snapshot still carries only the newest entries', () => {
    expect(AUDIT_LIMIT).toBe(3000)
  })
})

describe('first doctor and demo accounts', () => {
  it('refuses a "first doctor" while an active doctor exists', async () => {
    await expect(db.transaction((tx) => createFirstDoctor(tx, { name: 'Dr. New', title: 'Physician', license_no: '1234567', password: 'TempPass123' }))).rejects.toBeInstanceOf(HttpError)
  })

  it('will not disable the demo accounts before a real doctor exists', async () => {
    await expect(db.transaction((tx) => disableDemoAccounts(tx))).rejects.toBeInstanceOf(HttpError)
    const active = await db.select().from(staff).where(eq(staff.active, true))
    expect(active.length).toBe(7)
  })

  it('on an empty database: creates the first doctor, who must change the temporary password', async () => {
    await wipe(db)
    await expect(db.transaction((tx) => createFirstDoctor(tx, { name: 'Dr. New', title: 'Physician', license_no: '', password: 'TempPass123' }))).rejects.toBeInstanceOf(HttpError)
    const id = await db.transaction((tx) => createFirstDoctor(tx, { name: 'Dr. New', title: 'Physician', license_no: '1234567', services: ['Medical'], password: 'TempPass123' }))
    const [row] = await db.select().from(staff).where(eq(staff.staff_id, id))
    expect(row).toMatchObject({ role: 'doctor', active: true, must_change_password: true })
    const { must_change_password } = await login(db, id, 'TempPass123')
    expect(must_change_password).toBe(true)
  })

  it('then deactivates the seeded demo accounts, never deleting them', async () => {
    await seed(db)
    await db.transaction((tx) => createStaff(tx))
    const names = await db.transaction((tx) => disableDemoAccounts(tx))
    expect(names).toHaveLength(7)
    const rows = await db.select().from(staff)
    expect(rows.filter((r) => r.active).map((r) => r.name)).toEqual(['Dr. Real'])
    expect(rows).toHaveLength(8)
    await expect(login(db, 'st-d1', 'demo-password')).rejects.toBeInstanceOf(HttpError)
    expect(await db.transaction((tx) => disableDemoAccounts(tx))).toEqual([])
  })
})

/** A real doctor next to the seeded demo staff, made the way Settings > Staff accounts does it. */
async function createStaff(tx: Parameters<Parameters<Db['transaction']>[0]>[0]) {
  const { createStaff: create } = await import('../src/server/services/admin')
  return create(tx, doctor, { name: 'Dr. Real', role: 'doctor', title: 'Physician', license_no: '7654321', password: 'RealPass123' })
}

describe('settings that kept the old product name', () => {
  it('reads GILAYON_ first and falls back to HIMSOG_', () => {
    expect(setting('AUTO_SEED', { HIMSOG_AUTO_SEED: '0' })).toBe('0')
    expect(setting('AUTO_SEED', { HIMSOG_AUTO_SEED: '0', GILAYON_AUTO_SEED: '1' })).toBe('1')
    expect(setting('HOSTNAMES', {})).toBeUndefined()
  })

  it('treats the embedded, auto-seeded database as the demo, and a real database as not', () => {
    expect(isDemoServer({})).toBe(true)
    expect(isDemoServer({ DATABASE_URL: 'postgres://clinic' })).toBe(false)
    expect(isDemoServer({ GILAYON_AUTO_SEED: '0' })).toBe(false)
    expect(isDemoServer({ HIMSOG_AUTO_SEED: '0' })).toBe(false)
    expect(isDemoServer({ DATABASE_URL: 'postgres://clinic', NEXT_PUBLIC_DEMO: '1' })).toBe(true)
    expect(isDemoServer({ NEXT_PUBLIC_DEMO: '0' })).toBe(false)
  })
})
