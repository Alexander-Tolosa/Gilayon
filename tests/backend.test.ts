import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { document, prescription, queueTicket, scannedPage } from '../db/schema'
import { seed } from '../db/seed'
import { login, actorFromToken } from '../src/server/auth'
import { HttpError, type Actor } from '../src/server/core'
import { getDb, type Db } from '../src/server/db'
import { loadPublicQueue, loadSnapshot } from '../src/server/state'
import { saveConsultation, signDocuments, voidDocument, reissueDocument, editDraft } from '../src/server/services/clinical'
import { issueTicket, callTicket } from '../src/server/services/queue'
import { uploadScan } from '../src/server/services/records'
import { moveScansToDisk } from '../src/server/files'
import { verifyIdentity } from '../src/server/services/records'
import { changeOwnPassword, changePin, createStaff, resetPassword, setStaffActive, updateStaffDetails } from '../src/server/services/admin'
import type { ConsultInput } from '../src/features/clinic/api-types'

process.env.PGLITE_DIR = 'memory://'
process.env.UPLOADS_DIR = mkdtempSync(path.join(tmpdir(), 'himsog-uploads-'))

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

  it('lets only a doctor who consulted the patient amend, void or reissue; others read only', async () => {
    const other: Actor = { staff_id: 'st-d2', name: 'Dr. Liza Magbanua', role: 'doctor' }
    // A patient the seed never gave a consultation, so neither doctor starts on the care team.
    const snap = await loadSnapshot(db, doctor)
    const seen = new Set(snap.consultations.map((c) => c.patient_id))
    const patient_id = snap.patients.find((p) => !seen.has(p.patient_id))!.patient_id
    await db.transaction((tx) => saveConsultation(tx, doctor, consult(patient_id, 'cb')))
    const correction = { ...consult(patient_id, 'cc'), correction_of: 'c-cb', rx: [], certificate: undefined, labs: [], lab_ids: [] }
    await expect(db.transaction((tx) => saveConsultation(tx, other, correction))).rejects.toMatchObject({ status: 403 })
    await expect(db.transaction((tx) => voidDocument(tx, other, 'doc', 'doc-cb', 'Not mine'))).rejects.toMatchObject({ status: 403 })
    await db.transaction((tx) => voidDocument(tx, doctor, 'doc', 'doc-cb', 'Test void'))
    await expect(db.transaction((tx) => reissueDocument(tx, other, 'doc', 'doc-cb', 'doc-cb2'))).rejects.toMatchObject({ status: 403 })
    // Seeing the patient themselves puts them on the care team.
    await db.transaction((tx) => saveConsultation(tx, other, consult(patient_id, 'cd')))
    expect(await db.transaction((tx) => saveConsultation(tx, other, correction))).toBe('saved')
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

describe('staff accounts', () => {
  let newId: string

  it('creates an account that must change its temporary password', async () => {
    newId = await db.transaction((tx) => createStaff(tx, doctor, { name: 'Nurse Test Account', role: 'nurse', title: 'Staff nurse', password: 'Temp-pass-1' }))
    const { token, must_change_password } = await login(db, newId, 'Temp-pass-1')
    expect(must_change_password).toBe(true)
    expect((await actorFromToken(db, token))?.role).toBe('nurse')
  })

  it('rejects weak passwords and a doctor without a licence number', async () => {
    await expect(db.transaction((tx) => createStaff(tx, doctor, { name: 'Weak Pass', role: 'desk', title: 'Desk', password: 'short' }))).rejects.toMatchObject({ status: 400 })
    await expect(db.transaction((tx) => createStaff(tx, doctor, { name: 'No Licence', role: 'doctor', title: 'Physician', password: 'Long-enough-1' }))).rejects.toMatchObject({ status: 400 })
  })

  it('lets the person choose their own password, which clears the flag', async () => {
    const me: Actor = { staff_id: newId, name: 'Nurse Test Account', role: 'nurse' }
    await expect(db.transaction((tx) => changeOwnPassword(tx, me, 'wrong-password-1', 'Brand-new-pass-2'))).rejects.toMatchObject({ status: 403 })
    await expect(db.transaction((tx) => changeOwnPassword(tx, me, 'Temp-pass-1', 'Temp-pass-1'))).rejects.toMatchObject({ status: 400 })
    await db.transaction((tx) => changeOwnPassword(tx, me, 'Temp-pass-1', 'Brand-new-pass-2'))
    const { must_change_password } = await login(db, newId, 'Brand-new-pass-2')
    expect(must_change_password).toBe(false)
    await expect(login(db, newId, 'Temp-pass-1')).rejects.toBeInstanceOf(HttpError)
  })

  it('deactivating signs the person out everywhere and blocks sign-in', async () => {
    const { token } = await login(db, newId, 'Brand-new-pass-2')
    await db.transaction((tx) => setStaffActive(tx, doctor, newId, false))
    expect(await actorFromToken(db, token)).toBeNull()
    await expect(login(db, newId, 'Brand-new-pass-2')).rejects.toBeInstanceOf(HttpError)
    const pub = await loadPublicQueue(db)
    expect(pub.staff.some((x) => x.staff_id === newId)).toBe(false)
    await db.transaction((tx) => setStaffActive(tx, doctor, newId, true))
    await expect(login(db, newId, 'Brand-new-pass-2')).resolves.toBeTruthy()
  })

  it('a password reset signs the person out and forces a new password', async () => {
    const { token } = await login(db, newId, 'Brand-new-pass-2')
    await db.transaction((tx) => resetPassword(tx, doctor, newId, 'Reset-temp-3'))
    expect(await actorFromToken(db, token)).toBeNull()
    expect((await login(db, newId, 'Reset-temp-3')).must_change_password).toBe(true)
  })

  it('protects the last doctor and your own account', async () => {
    await expect(db.transaction((tx) => setStaffActive(tx, doctor, 'st-d1', false))).rejects.toMatchObject({ status: 409 })
    // Deactivate the other two doctors one by one, then the last one must refuse.
    await db.transaction((tx) => setStaffActive(tx, doctor, 'st-d2', false))
    await db.transaction((tx) => setStaffActive(tx, doctor, 'st-d3', false))
    const d2: Actor = { staff_id: 'st-d2', name: 'x', role: 'doctor' }
    await expect(db.transaction((tx) => setStaffActive(tx, d2, 'st-d1', false))).rejects.toMatchObject({ status: 409 })
    await expect(db.transaction((tx) => updateStaffDetails(tx, doctor, 'st-d1', { role: 'desk' }))).rejects.toMatchObject({ status: 409 })
    await db.transaction((tx) => setStaffActive(tx, doctor, 'st-d2', true))
    await db.transaction((tx) => setStaffActive(tx, doctor, 'st-d3', true))
  })

  it('lets a new doctor set a first PIN without a current one', async () => {
    const id = await db.transaction((tx) => createStaff(tx, doctor, { name: 'Dr. New Doctor', role: 'doctor', title: 'Physician', license_no: '0123456', password: 'Doctor-pass-1' }))
    const me: Actor = { staff_id: id, name: 'Dr. New Doctor', role: 'doctor' }
    await expect(db.transaction((tx) => changePin(tx, me, '', '1234'))).rejects.toMatchObject({ status: 400 })
    expect(await db.transaction((tx) => changePin(tx, me, '', '7395'))).toBe(true)
    expect(await db.transaction((tx) => changePin(tx, me, '0000', '8462'))).toBe(false)
  })
})

describe('scanned pages on disk', () => {
  // A 1x1 PNG and a 1x1 JPEG, so the signature check sees real image bytes.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
  let patient_id: string

  beforeAll(async () => {
    patient_id = (await loadSnapshot(db, desk)).patients[11].patient_id
  })

  it('stores a real image as a file and serves it only to signed-in staff', async () => {
    const id = await db.transaction((tx) => uploadScan(tx, desk, patient_id, PNG, 'Chart', '2026-01-02'))
    const [row] = await db.select().from(scannedPage).where(eq(scannedPage.page_id, id))
    expect(row.file).toBe(`disk:${id}.png`)
    expect(row.file.startsWith('data:')).toBe(false)
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, 'scans', `${id}.png`))).toBe(true)

    const snap = await loadSnapshot(db, desk)
    expect(snap.scans.find((s) => s.page_id === id)?.file).toBe(`/api/scans/${id}/file`)

    const { GET } = await import('../app/api/scans/[id]/file/route')
    const ctx = { params: Promise.resolve({ id }) }
    expect((await GET(new Request('http://x'), ctx)).status).toBe(401)
    const { token } = await login(db, 'st-f1', 'demo-password')
    const ok = await GET(new Request('http://x', { headers: { Authorization: `Bearer ${token}` } }), ctx)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(ok.headers.get('cache-control')).toContain('no-store')
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(20)
  })

  it('refuses non-images, mislabelled files and oversized scans', async () => {
    const text = `data:image/png;base64,${Buffer.from('<html>not an image</html>').toString('base64')}`
    await expect(db.transaction((tx) => uploadScan(tx, desk, patient_id, text, 'Chart', '2026-01-02'))).rejects.toMatchObject({ status: 400 })
    const mislabelled = JPG.replace('image/jpeg', 'image/png')
    await expect(db.transaction((tx) => uploadScan(tx, desk, patient_id, mislabelled, 'Chart', '2026-01-02'))).rejects.toMatchObject({ status: 400 })
    const big = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2_600_000)]).toString('base64')}`
    await expect(db.transaction((tx) => uploadScan(tx, desk, patient_id, big, 'Chart', '2026-01-02'))).rejects.toMatchObject({ status: 413 })
    const before = readdirSync(path.join(process.env.UPLOADS_DIR!, 'scans')).length
    await expect(db.transaction((tx) => uploadScan(tx, desk, patient_id, 'data:image/svg+xml;base64,AAAA', 'Chart', '2026-01-02'))).rejects.toMatchObject({ status: 400 })
    expect(readdirSync(path.join(process.env.UPLOADS_DIR!, 'scans')).length).toBe(before)
  })

  it('a retried upload with the same page id stores one scan', async () => {
    const run = () => db.transaction((tx) => uploadScan(tx, desk, patient_id, JPG, 'Lab result', '2026-02-03', 'offline-page-0001'))
    expect(await run()).toBe('offline-page-0001')
    expect(await run()).toBe('offline-page-0001')
    const rows = await db.select().from(scannedPage).where(eq(scannedPage.page_id, 'offline-page-0001'))
    expect(rows).toHaveLength(1)
  })

  it('moves scans saved in the database by the first version onto disk', async () => {
    await db.insert(scannedPage).values({ page_id: 'legacy-page-0001', patient_id, file: PNG, kind: 'Chart', page_date: '2025-05-05', uploaded_by: 'st-f1', uploaded_at: Date.now() })
    await moveScansToDisk(db)
    const [row] = await db.select().from(scannedPage).where(eq(scannedPage.page_id, 'legacy-page-0001'))
    expect(row.file).toBe('disk:legacy-page-0001.png')
  })
})

describe('offline sync of notes, drafts and photos', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const sync = async (token: string, ops: unknown[]) => {
    const { POST } = await import('../app/api/sync/route')
    const res = await POST(new Request('http://x/api/sync', { method: 'POST', body: JSON.stringify({ ops }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }))
    return { status: res.status, body: (await res.json()) as { applied: string[]; rejected: { op_id: string; reason: string }[] } }
  }

  it('applies a consult, an edit of its draft, and a photo in order, once', async () => {
    const { token } = await login(db, 'st-d1', 'demo-password')
    const patient_id = (await loadSnapshot(db, doctor)).patients[20].patient_id
    const c = consult(patient_id, 'off1')
    const ops = [
      { op_id: 'o-1', kind: 'consult', input: c },
      { op_id: 'o-2', kind: 'edit_draft', input: { doc_kind: 'doc', id: c.doc_id, patch: { rest_days: 5, findings: 'Edited while offline' } } },
      { op_id: 'o-3', kind: 'scan', input: { page_id: 'offline-photo-001', patient_id, file: PNG, scan_kind: 'Lab result', page_date: '2026-03-03' } },
    ]
    const first = await sync(token, ops)
    expect(first.status).toBe(200)
    expect(first.body.applied).toEqual(['o-1', 'o-2', 'o-3'])
    const again = await sync(token, ops)
    expect(again.body.applied).toEqual(['o-1', 'o-2', 'o-3'])

    const s = await loadSnapshot(db, doctor)
    expect(s.consultations.filter((x) => x.consultation_id === 'c-off1')).toHaveLength(1)
    expect(s.documents.find((d) => d.document_id === 'doc-off1')).toMatchObject({ rest_days: 5, findings: 'Edited while offline', status: 'draft' })
    expect(s.scans.filter((x) => x.page_id === 'offline-photo-001')).toHaveLength(1)
  })

  it('one bad entry does not discard the rest of the queue', async () => {
    const { token } = await login(db, 'st-d1', 'demo-password')
    const patient_id = (await loadSnapshot(db, doctor)).patients[21].patient_id
    const res = await sync(token, [
      { op_id: 'b-1', kind: 'edit_draft', input: { doc_kind: 'doc', id: 'does-not-exist', patch: { findings: 'x' } } },
      { op_id: 'b-2', kind: 'consult', input: consult(patient_id, 'off2') },
    ])
    expect(res.body.rejected.map((r) => r.op_id)).toEqual(['b-1'])
    expect(res.body.applied).toEqual(['b-2'])
  })

  it('does not let a receptionist sync a consultation', async () => {
    const { token } = await login(db, 'st-f1', 'demo-password')
    const patient_id = (await loadSnapshot(db, doctor)).patients[22].patient_id
    const res = await sync(token, [{ op_id: 'f-1', kind: 'consult', input: consult(patient_id, 'off3') }])
    expect(res.body.rejected[0].op_id).toBe('f-1')
    expect(res.body.applied).toEqual([])
  })

  it('a signed document can no longer be edited by a late offline edit', async () => {
    const { token } = await login(db, 'st-d1', 'demo-password')
    // doc-a was signed, voided in an earlier test; edit must be rejected, not applied.
    const res = await sync(token, [{ op_id: 'l-1', kind: 'edit_draft', input: { doc_kind: 'doc', id: 'doc-a', patch: { findings: 'too late' } } }])
    expect(res.body.rejected[0].op_id).toBe('l-1')
  })
})

describe('audit activity the doctor has seen', () => {
  it('starts at "now" for a doctor, so history is not greeted as unread, and only moves forward', async () => {
    const { markAuditSeen } = await import('../src/server/services/admin')
    const first = await loadSnapshot(db, { staff_id: 'st-d2', name: 'Dr. Liza Magbanua', role: 'doctor' })
    expect(first.auditSeenAt).toBeGreaterThan(Date.now() - 60_000)
    const again = await loadSnapshot(db, { staff_id: 'st-d2', name: 'Dr. Liza Magbanua', role: 'doctor' })
    expect(again.auditSeenAt).toBe(first.auditSeenAt) // stable, not reset on every load

    const d2: Actor = { staff_id: 'st-d2', name: 'Dr. Liza Magbanua', role: 'doctor' }
    await db.transaction((tx) => markAuditSeen(tx, d2, first.auditSeenAt + 5000))
    const moved = await loadSnapshot(db, d2)
    expect(moved.auditSeenAt).toBeGreaterThanOrEqual(first.auditSeenAt)
    await db.transaction((tx) => markAuditSeen(tx, d2, 1)) // cannot go back
    expect((await loadSnapshot(db, d2)).auditSeenAt).toBe(moved.auditSeenAt)
    // Each doctor has their own mark: another doctor is unaffected.
    expect((await loadSnapshot(db, doctor)).auditSeenAt).not.toBe(0)
  })

  it('non-doctors get no mark and no audit log', async () => {
    const s = await loadSnapshot(db, desk)
    expect(s.auditSeenAt).toBe(0)
    expect(s.audit).toHaveLength(0)
  })
})
