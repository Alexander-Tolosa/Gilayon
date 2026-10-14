import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { employee, meta, patient, person } from '../db/schema'
import { seed } from '../db/seed'
import { findDuplicatePairs } from '../src/features/clinic/lib/duplicates'

process.env.PGLITE_DIR = 'memory://'

const { getDb } = await import('../src/server/db')
const { loadSnapshot } = await import('../src/server/state')
const { login } = await import('../src/server/auth')
const { previewHrImport, applyHrImport } = await import('../src/server/services/hrimport')
const { createDependent } = await import('../src/server/services/records')
const { mergePatients } = await import('../src/server/services/merge')

const doctor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' as const }
type Db = Awaited<ReturnType<typeof getDb>>
let db: Db

const row = (n: string, name: string, birthdate = '1990-05-05', sex = 'F', office = 'Budget Office', position = 'Clerk II') => ({ employee_no: n, full_name: name, birthdate, sex, office, position })
const imp = (rows: unknown[], source = 'test.csv') => db.transaction((tx) => applyHrImport(tx, doctor, rows as never, source))

beforeAll(async () => {
  db = await getDb()
  await seed(db)
})

describe('HR list import', () => {
  it('a preview shows the outcome and writes nothing', async () => {
    const before = await db.select().from(employee)
    const rows = [row('NEW-0001', 'Ana Lopez'), row('NEW-0002', 'Ben Santos', '1985-01-01', 'M')]
    const r = await db.transaction((tx) => previewHrImport(tx, rows as never))
    expect(r).toMatchObject({ applied: false, created: 2, updated: 0, rejected: [] })
    expect((await db.select().from(employee)).length).toBe(before.length)
  })

  it('creates employees and their patient records with the next record numbers', async () => {
    const snap = await loadSnapshot(db, doctor)
    const maxNo = Math.max(...snap.patients.map((p) => Number(p.patient_no.slice(4))))
    const r = await imp([row('NEW-0001', 'Ana Lopez'), row('NEW-0002', 'Ben Santos', '1985-01-01', 'M')])
    expect(r).toMatchObject({ applied: true, created: 2 })
    const [e] = await db.select().from(employee).where(eq(employee.employee_no, 'NEW-0001'))
    const [pt] = await db.select().from(patient).where(eq(patient.person_id, e.person_id))
    expect(pt.patient_no).toBe(`HMO-${String(maxNo + 1).padStart(5, '0')}`)
    const [s] = await db.select().from(person).where(eq(person.person_id, e.person_id))
    expect(s).toMatchObject({ full_name: 'Ana Lopez', birthdate: '1990-05-05', sex: 'Female' })
  })

  it('running the same list again changes nothing', async () => {
    const r = await imp([row('NEW-0001', 'Ana Lopez'), row('NEW-0002', 'Ben Santos', '1985-01-01', 'M')])
    expect(r).toMatchObject({ created: 0, updated: 0, unchanged: 2, conflicts: [] })
  })

  it('rejects bad rows with their line number and still imports the good ones', async () => {
    const r = await imp([
      { ...row('OK-0001', 'Carla Reyes'), line: 2 },
      { ...row('', 'No Id'), line: 3 },
      { ...row('BAD-0001', 'Wrong Date', '1990-02-31'), line: 4 },
      { ...row('BAD-0002', 'Wrong Sex', '1990-02-01', 'X'), line: 5 },
      { ...row('OK-0001', 'Carla Again'), line: 6 },
      { ...row('BAD-0003', 'Baby', '2024-01-01'), line: 7 },
    ])
    expect(r.created).toBe(1)
    expect(r.rejected.map((x) => x.line)).toEqual([3, 4, 5, 6, 7])
    expect(r.rejected.find((x) => x.line === 6)?.reason).toMatch(/earlier in this file/)
    const names = (await db.select().from(person).where(eq(person.full_name, 'Carla Reyes'))).length
    expect(names).toBe(1)
  })

  it('updates office, position and spelling, but never blanks an office with "Not stated"', async () => {
    await imp([row('UPD-0001', 'Dora Mendez', '1992-02-02', 'F', 'Old Office', 'Old Position')])
    const r = await imp([row('UPD-0001', 'Dora M. Mendez', '1992-02-02', 'F', 'New Office', 'New Position')])
    expect(r).toMatchObject({ created: 0, updated: 1 })
    const [e] = await db.select().from(employee).where(eq(employee.employee_no, 'UPD-0001'))
    expect(e).toMatchObject({ office: 'New Office', position: 'New Position' })
    const keep = await imp([{ ...row('UPD-0001', 'Dora M. Mendez', '1992-02-02', 'F'), office: '', position: '' }])
    expect(keep.updated).toBe(0)
    const [still] = await db.select().from(employee).where(eq(employee.employee_no, 'UPD-0001'))
    expect(still.office).toBe('New Office')
  })

  it('a different birthdate is a conflict for HR: reported, not applied, and flagged on the record', async () => {
    await imp([row('CON-0001', 'Edgar Tan', '1980-08-08', 'M')])
    const r = await imp([row('CON-0001', 'Edgar Tan', '1981-08-08', 'M')])
    expect(r.conflicts).toEqual([{ employee_no: 'CON-0001', name: 'Edgar Tan', field: 'birthdate', listed: '1981-08-08', stored: '1980-08-08' }])
    expect(r.updated + r.created).toBe(0)
    const [e] = await db.select().from(employee).where(eq(employee.employee_no, 'CON-0001'))
    const [p] = await db.select().from(person).where(eq(person.person_id, e.person_id))
    expect(p.birthdate).toBe('1980-08-08')
    const [pt] = await db.select().from(patient).where(eq(patient.person_id, e.person_id))
    expect(pt.hr_flag).toMatch(/birthdate on the list \(1981-08-08\) differs/)
  })

  it('warns when a new employee looks like someone already registered without an employee ID, and the merge tool can then fix it', async () => {
    const snap = await loadSnapshot(db, doctor)
    const principal = snap.patients[0]
    const walkIn = await db.transaction((tx) => createDependent(tx, doctor, principal.patient_id, { full_name: 'Grace Villar', birthdate: '1991-09-09', sex: 'Female', contact: '', civil_status: 'Single' }, 'Sibling', false))
    const r = await imp([row('DUP-0001', 'Grace  Villar', '1991-09-09', 'F')])
    expect(r.possibleDuplicates).toHaveLength(1)
    expect(r.possibleDuplicates[0]).toMatchObject({ employee_no: 'DUP-0001', name: 'Grace Villar' })

    const after = await loadSnapshot(db, doctor)
    const pair = findDuplicatePairs(after).find((p) => [p.a.patient_id, p.b.patient_id].includes(walkIn))
    expect(pair).toBeTruthy()
    expect(pair!.blocked).toBe(false)
    const emp = (await db.select().from(employee).where(eq(employee.employee_no, 'DUP-0001')))[0]
    const [keep] = await db.select().from(patient).where(eq(patient.person_id, emp.person_id))
    await db.transaction((tx) => mergePatients(tx, doctor, { keep: keep.patient_id, duplicate: walkIn, reason: 'HR list import found the employee ID' }))
  })

  it('counts employees the list does not mention, without touching them', async () => {
    const total = (await db.select().from(employee)).length
    const r = await db.transaction((tx) => previewHrImport(tx, [row('NEW-0001', 'Ana Lopez')] as never))
    expect(r.notInList).toBe(total - 1)
  })

  it('records the import in the audit trail and as the last import', async () => {
    await imp([row('LAST-0001', 'Lena Cruz')], 'hr-oct-2026.csv')
    const [m] = await db.select().from(meta).where(eq(meta.key, 'last_import'))
    expect(m.value).toMatchObject({ source: 'hr-oct-2026.csv', count: 1 })
    const snap = await loadSnapshot(db, doctor)
    expect(snap.audit.find((a) => a.action === 'import' && a.summary.includes('hr-oct-2026.csv'))).toBeTruthy()
  })

  it('handles a few thousand rows in one go', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => row(`BULK-${String(i).padStart(5, '0')}`, `Bulk Person ${i}`, `19${70 + (i % 25)}-0${1 + (i % 9)}-1${i % 9}`))
    const t0 = Date.now()
    const r = await imp(rows, 'bulk.csv')
    expect(r.created).toBe(1500)
    expect(Date.now() - t0).toBeLessThan(30_000)
    const again = await db.transaction((tx) => previewHrImport(tx, rows as never))
    expect(again).toMatchObject({ created: 0, unchanged: 1500 })
  })

  it('is doctor-only and refuses oversized lists', async () => {
    const { POST } = await import('../app/api/employees/import/route')
    const send = async (who: string, rows: unknown[]) => {
      const { token } = await login(db, who, 'demo-password')
      return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ rows, source: 't', dry_run: true }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }))
    }
    expect((await send('st-f1', [row('X-1', 'Desk Try')])).status).toBe(403)
    expect((await send('st-d1', [row('X-1', 'Doctor Try')])).status).toBe(200)
    expect((await send('st-d1', Array.from({ length: 5001 }, (_, i) => row(`T-${i}`, 'x')))).status).toBe(400)
  })
})
