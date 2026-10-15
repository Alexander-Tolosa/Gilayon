process.env.PGLITE_DIR = 'memory://'
import { beforeAll, describe, expect, it } from 'vitest'

const { getDb } = await import('../src/server/db')
const { seed } = await import('../db/seed')
const { recordPaperCheck, registerUnlisted, setEmployeeInfo, verifyIdentity } = await import('../src/server/services/records')
const { issueTicket } = await import('../src/server/services/queue')
const { loadSnapshot } = await import('../src/server/state')
const { POST } = await import('../app/api/patients/[id]/paper/route')
const { login } = await import('../src/server/auth')

const desk = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' as const }

let db: Awaited<ReturnType<typeof getDb>>

beforeAll(async () => {
  db = await getDb()
  await seed(db)
})

const unchecked = async () => (await loadSnapshot(db, desk)).patients.find((p) => !p.paper_status)!

describe('paper folder check', () => {
  it('seeds some patients unchecked so the step shows in a demo', async () => {
    expect(await unchecked()).toBeTruthy()
  })

  it('records a folder on file with its number and audits it', async () => {
    const pt = await unchecked()
    const out = await db.transaction((tx) => recordPaperCheck(tx, desk, pt.patient_id, 'on_file', ' F-1999-0007 '))
    expect(out).toEqual({ status: 'on_file', folder_no: 'F-1999-0007' })
    const snap = await loadSnapshot(db, desk)
    const after = snap.patients.find((p) => p.patient_id === pt.patient_id)!
    expect(after).toMatchObject({ paper_status: 'on_file', legacy_folder_no: 'F-1999-0007', paper_checked_by: 'st-f1' })
    expect(after.paper_checked_at).toBeGreaterThan(0)
  })

  it('records "no folder" without touching the folder number', async () => {
    const pt = await unchecked()
    await db.transaction((tx) => recordPaperCheck(tx, desk, pt.patient_id, 'none', 'F-IGNORED'))
    const after = (await loadSnapshot(db, desk)).patients.find((p) => p.patient_id === pt.patient_id)!
    expect(after.paper_status).toBe('none')
    expect(after.legacy_folder_no).toBeUndefined()
  })

  it('rejects an unknown patient', async () => {
    await expect(db.transaction((tx) => recordPaperCheck(tx, desk, 'nope', 'none'))).rejects.toMatchObject({ status: 404 })
  })

  it('is open to the desk role through the route and validates the body', async () => {
    const { token } = await login(db, 'st-f1', 'demo-password')
    const pt = await unchecked()
    const call = (body: unknown) =>
      POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: pt.patient_id }) })
    expect((await call({ status: 'maybe' })).status).toBe(400)
    expect((await call({ status: 'none' })).status).toBe(200)
  })
})

describe('queue guard', () => {
  it('refuses a queue number until the paper cabinet has been checked', async () => {
    const pt = await unchecked()
    await expect(db.transaction((tx) => issueTicket(tx, desk, pt.patient_id, [], 'Medical', ''))).rejects.toMatchObject({ status: 409 })
    await db.transaction((tx) => recordPaperCheck(tx, desk, pt.patient_id, 'none'))
    const id = await db.transaction((tx) => issueTicket(tx, desk, pt.patient_id, [], 'Medical', ''))
    expect(id).toBeTruthy()
  })
})

describe('registering someone who is not on the HR list', () => {
  const input = { full_name: 'Zenaida Quirino-Abalos', birthdate: '1990-04-12', sex: 'Male' as const, contact: '0917 000 0000', civil_status: 'Single' as const }

  it('creates a person and patient with no employee row and no HR flag', async () => {
    const id = await db.transaction((tx) => registerUnlisted(tx, desk, { ...input, patient_id: 'unlisted-1' }))
    expect(id).toBe('unlisted-1')
    const snap = await loadSnapshot(db, desk)
    const pt = snap.patients.find((p) => p.patient_id === id)!
    expect(pt.hr_flag).toBeUndefined()
    expect(pt.paper_status).toBeUndefined()
    expect(snap.employees.some((e) => e.person_id === pt.person_id)).toBe(false)
    expect(pt.created_by).toBe('st-f1')
  })

  it('is idempotent for a retried request', async () => {
    const again = await db.transaction((tx) => registerUnlisted(tx, desk, { ...input, patient_id: 'unlisted-1' }))
    expect(again).toBe('unlisted-1')
    const snap = await loadSnapshot(db, desk)
    expect(snap.persons.filter((p) => p.full_name === 'Zenaida Quirino-Abalos')).toHaveLength(1)
  })

  it('refuses a likely duplicate until the desk confirms', async () => {
    await expect(db.transaction((tx) => registerUnlisted(tx, desk, { ...input, full_name: 'Zenaida  Quirino-Abalos' }))).rejects.toMatchObject({ status: 409 })
    const id = await db.transaction((tx) => registerUnlisted(tx, desk, { ...input, full_name: 'Zenaida Quirino-Abalos' }, true))
    expect(id).toBeTruthy()
  })

  it('needs a full name', async () => {
    await expect(db.transaction((tx) => registerUnlisted(tx, desk, { ...input, full_name: 'Zenaida' }))).rejects.toMatchObject({ status: 400 })
  })
})

describe('the HR list is a secondary check', () => {
  const base = { full_name: 'Teodora Caballero-Ruiz', birthdate: '1975-09-30', sex: 'Female' as const, contact: '', civil_status: 'Married' as const }

  it('verifies a person with no employee row by name and birthdate alone', async () => {
    const id = await db.transaction((tx) => registerUnlisted(tx, desk, { ...base, patient_id: 'tcr-1' }))
    const snap = await loadSnapshot(db, desk)
    const personId = snap.patients.find((p) => p.patient_id === id)!.person_id
    const ok = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: base.birthdate, id_checked: 'government_id', paper_match: true }))
    expect(ok).toMatchObject({ ok: true, mismatches: [] })
    const bad = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: '1999-01-01' }))
    expect(bad).toMatchObject({ ok: false, mismatches: ['Birthdate'] })
  })

  it('reports a paper folder mismatch and lets the desk continue after checking another ID', async () => {
    const snap = await loadSnapshot(db, desk)
    const personId = snap.patients.find((p) => p.patient_id === 'tcr-1')!.person_id
    const bad = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: base.birthdate, paper_match: false }))
    expect(bad).toMatchObject({ ok: false, mismatches: ['Paper folder'], overridden: false })
    const cont = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: base.birthdate, paper_match: false, override: true }))
    expect(cont).toMatchObject({ ok: true, overridden: true })
  })

  it('compares the employee ID only when the person has one on file', async () => {
    await db.transaction((tx) => setEmployeeInfo(tx, desk, 'tcr-1', { employee_no: 'ipg-2020-9001', office: 'PEO', position: 'Clerk' }, 'typed from the HR paper list'))
    const snap = await loadSnapshot(db, desk)
    const personId = snap.patients.find((p) => p.patient_id === 'tcr-1')!.person_id
    expect(snap.employees.find((e) => e.person_id === personId)).toMatchObject({ employee_no: 'IPG-2020-9001', office: 'PEO' })
    const wrong = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: base.birthdate, employee_no: 'IPG-1111-1111' }))
    expect(wrong.mismatches).toEqual(['Employee ID'])
    const blank = await db.transaction((tx) => verifyIdentity(tx, desk, personId, { full_name: base.full_name, birthdate: base.birthdate }))
    expect(blank.ok).toBe(true)
  })

  it('keeps an employee ID unique', async () => {
    await expect(db.transaction((tx) => registerUnlisted(tx, desk, { ...base, full_name: 'Ernesto Villaruz-Tan', birthdate: '1980-03-03', sex: 'Male', employee_no: 'IPG-2020-9001' }))).rejects.toMatchObject({ status: 409 })
    const other = await db.transaction((tx) => registerUnlisted(tx, desk, { ...base, full_name: 'Ernesto Villaruz-Tan', birthdate: '1980-03-03', sex: 'Male', employee_no: 'IPG-2020-9002', office: 'CTO' }))
    await expect(db.transaction((tx) => setEmployeeInfo(tx, desk, other, { employee_no: 'IPG-2020-9001', office: '', position: '' }))).rejects.toMatchObject({ status: 409 })
  })
})
