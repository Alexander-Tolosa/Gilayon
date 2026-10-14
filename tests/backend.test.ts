import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { document, prescription, queueTicket } from '../db/schema'
import { seed } from '../db/seed'
import { login, actorFromToken } from '../src/server/auth'
import { HttpError, type Actor } from '../src/server/core'
import { getDb, type Db } from '../src/server/db'
import { loadPublicQueue, loadSnapshot } from '../src/server/state'
import { saveConsultation, signDocuments, voidDocument, reissueDocument, editDraft } from '../src/server/services/clinical'
import { issueTicket, callTicket } from '../src/server/services/queue'
import { verifyIdentity } from '../src/server/services/records'
import type { ConsultInput } from '../src/features/clinic/api-types'

process.env.PGLITE_DIR = 'memory://'

let db: Db
const doctor: Actor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' }
const desk: Actor = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' }

const consult = (patient_id: string, n: string): ConsultInput => ({
  consultation_id: `c-${n}`,
  patient_id,
  service_type: 'Medical',
  chief_complaint: 'Cough',
  treatment_notes: 'Rest and fluids',
  diagnoses: [{ description: 'Acute bronchitis', icd10_code: 'J20.9' }],
  rx: [{ drug_name: 'Paracetamol', dose: '500 mg', frequency: 'Every 6 hours as needed', quantity: 10 }],
  certificate: { purpose: 'Sick leave', findings: 'Fever', rest_days: 2 },
  labs: ['Urinalysis'],
  rx_id: `rx-${n}`,
  doc_id: `doc-${n}`,
  lab_ids: [`lab-${n}`],
})

beforeAll(async () => {
  db = await getDb()
  await seed(db)
})

describe('seed and snapshot', () => {
  it('loads the demo clinic', async () => {
    const s = await loadSnapshot(db, doctor)
    expect(s.staff).toHaveLength(7)
    expect(s.patients.length).toBeGreaterThan(200)
    expect(s.staff.every((x) => !('password_hash' in x))).toBe(true)
  })

  it('hides the audit log from non-doctors and names from the public queue', async () => {
    const s = await loadSnapshot(db, desk)
    expect(s.audit).toHaveLength(0)
    const pub = await loadPublicQueue(db)
    expect(pub.tickets.every((t) => t.patient_id === '')).toBe(true)
    expect(pub.staff.every((x) => x.license_no === undefined && x.signature_image === undefined)).toBe(true)
  })
})

describe('authentication', () => {
  it('rejects a wrong password and accepts the demo one', async () => {
    await expect(login(db, 'st-d1', 'nope')).rejects.toBeInstanceOf(HttpError)
    const { token } = await login(db, 'st-d1', 'demo-password')
    const actor = await actorFromToken(db, token)
    expect(actor?.role).toBe('doctor')
    expect(await actorFromToken(db, 'forged-token')).toBeNull()
  })
})

describe('queue', () => {
  it('never issues the same queue number twice, even under concurrent check-ins', async () => {
    const s = await loadSnapshot(db, desk)
    const busy = new Set(s.tickets.filter((t) => t.status !== 'done').map((t) => t.patient_id))
    const patients = s.patients.filter((p) => !busy.has(p.patient_id)).slice(0, 12)
    const ids = await Promise.all(patients.map((p) => db.transaction((tx) => issueTicket(tx, desk, p.patient_id, ['regular'], 'Medical', 'checkup'))))
    const rows = await Promise.all(ids.map((id) => db.select().from(queueTicket).where(eq(queueTicket.ticket_id, id))))
    const nos = rows.map((r) => r[0].queue_no)
    expect(new Set(nos).size).toBe(nos.length)
  })

  it('does not let two doctors call the same patient', async () => {
    const s = await loadSnapshot(db, doctor)
    const waiting = s.tickets.find((t) => t.status === 'waiting')!
    await db.transaction((tx) => callTicket(tx, doctor, waiting.ticket_id))
    await expect(db.transaction((tx) => callTicket(tx, doctor, waiting.ticket_id))).rejects.toMatchObject({ status: 409 })
  })
})

describe('consultations and documents', () => {
  let patient_id: string

  beforeAll(async () => {
    patient_id = (await loadSnapshot(db, doctor)).patients[3].patient_id
  })

  it('saves once; a retried id is ignored', async () => {
    const input = consult(patient_id, 'a')
    expect(await db.transaction((tx) => saveConsultation(tx, doctor, input))).toBe('saved')
    expect(await db.transaction((tx) => saveConsultation(tx, doctor, input))).toBe('duplicate')
  })

  it('refuses a wrong PIN and issues a unique document number for the right one', async () => {
    expect(await db.transaction((tx) => signDocuments(tx, doctor, [{ kind: 'rx', id: 'rx-a' }], '0000'))).toBe('bad-pin')
    expect(await db.transaction((tx) => signDocuments(tx, doctor, [{ kind: 'rx', id: 'rx-a' }, { kind: 'doc', id: 'doc-a' }], '1234'))).toBe('ok')
    const [rx] = await db.select().from(prescription).where(eq(prescription.prescription_id, 'rx-a'))
    const [mc] = await db.select().from(document).where(eq(document.document_id, 'doc-a'))
    expect(rx.status).toBe('signed')
    expect(rx.document_no).toMatch(/^RX-\d{4}-\d{6}$/)
    expect(mc.document_no).toMatch(/^MC-\d{4}-\d{6}$/)
  })

  it('never lets a signed record be edited, in the service or directly in SQL', async () => {
    await expect(db.transaction((tx) => editDraft(tx, doctor, 'doc', 'doc-a', { findings: 'changed' }))).rejects.toMatchObject({ status: 409 })
    await expect(db.update(document).set({ findings: 'tampered' }).where(eq(document.document_id, 'doc-a'))).rejects.toThrow()
    await expect(db.delete(prescription).where(eq(prescription.prescription_id, 'rx-a'))).rejects.toThrow()
  })

  it('voids with a reason and reissues a new draft that points back', async () => {
    await db.transaction((tx) => voidDocument(tx, doctor, 'doc', 'doc-a', 'Wrong rest days'))
    const [voided] = await db.select().from(document).where(eq(document.document_id, 'doc-a'))
    expect(voided.status).toBe('voided')
    expect(voided.findings).toBe('Fever')
    await db.transaction((tx) => reissueDocument(tx, doctor, 'doc', 'doc-a', 'doc-a2'))
    await db.transaction((tx) => reissueDocument(tx, doctor, 'doc', 'doc-a', 'doc-a2')) // retry is safe
    const [fresh] = await db.select().from(document).where(eq(document.document_id, 'doc-a2'))
    expect(fresh).toMatchObject({ status: 'draft', replaces: 'doc-a' })
    await expect(db.transaction((tx) => voidDocument(tx, doctor, 'doc', 'doc-a', ' '))).rejects.toMatchObject({ status: 400 })
  })

  it('records the actions in the audit log', async () => {
    const s = await loadSnapshot(db, doctor)
    const actions = new Set(s.audit.map((a) => a.action))
    for (const a of ['create', 'sign', 'void', 'flag']) expect(actions.has(a)).toBe(true)
  })
})

describe('identity verification', () => {
  it('flags a wrong birthdate and passes a right one', async () => {
    const s = await loadSnapshot(db, desk)
    const emp = s.employees[5]
    const per = s.persons.find((p) => p.person_id === emp.person_id)!
    const bad = await db.transaction((tx) => verifyIdentity(tx, desk, per.person_id, { full_name: per.full_name, birthdate: '1900-01-01', employee_no: emp.employee_no }))
    expect(bad).toMatchObject({ ok: false, mismatches: ['Birthdate'] })
    const good = await db.transaction((tx) => verifyIdentity(tx, desk, per.person_id, { full_name: per.full_name, birthdate: per.birthdate, employee_no: emp.employee_no }))
    expect(good.ok).toBe(true)
  })
})

describe('HTTP layer', () => {
  it('requires sign-in and enforces roles', async () => {
    const { GET } = await import('../app/api/state/route')
    expect((await GET(new Request('http://x/api/state'))).status).toBe(401)
    const { POST: call } = await import('../app/api/queue/[id]/call/route')
    const { token } = await login(db, 'st-f1', 'demo-password')
    const res = await call(new Request('http://x', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id: 'whatever' }) })
    expect(res.status).toBe(403)
  })

  it('replaying a sync batch changes nothing the second time', async () => {
    const { POST } = await import('../app/api/sync/route')
    const { token } = await login(db, 'st-d1', 'demo-password')
    const patient_id = (await loadSnapshot(db, doctor)).patients[7].patient_id
    const body = JSON.stringify({ ops: [{ op_id: 'op-1', kind: 'consult', input: consult(patient_id, 'sync1') }] })
    const send = () => POST(new Request('http://x/api/sync', { method: 'POST', body, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }))
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(200)
    const s = await loadSnapshot(db, doctor)
    expect(s.consultations.filter((c) => c.consultation_id === 'c-sync1')).toHaveLength(1)
  })
})
