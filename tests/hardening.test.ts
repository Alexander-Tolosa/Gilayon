import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { labOrder, patient, queueTicket, staff } from '../db/schema'
import { seed } from '../db/seed'
import { actorFromToken, hashSecret, login } from '../src/server/auth'
import type { Actor } from '../src/server/core'
import { getDb, type Db } from '../src/server/db'
import { loadSnapshot } from '../src/server/state'
import type { ConsultInput } from '../src/features/clinic/api-types'
import { normName, todayKey } from '../src/features/clinic/lib/helpers'
import { Birthdate, IsoDate } from '../src/server/schemas'

process.env.PGLITE_DIR = 'memory://'

const { saveConsultation, signDocuments, voidDocument, reissueDocument, editDraft, addLabResult } = await import('../src/server/services/clinical')
const { issueTicket, setTicketStatus, callTicket, startConsult, closeStaleTickets } = await import('../src/server/services/queue')
const { registerUnlisted, recordPaperCheck, createDependent, linkRelative, verifyIdentity } = await import('../src/server/services/records')
const { createStaff, setSignatureImage } = await import('../src/server/services/admin')

let db: Db
const doctor: Actor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' }
const desk: Actor = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' }
let other: Actor

const tx = <T,>(fn: (q: Db) => Promise<T>) => db.transaction((q) => fn(q as unknown as Db))

const consult = (patient_id: string, n: string, extra: Partial<ConsultInput> = {}): ConsultInput => ({
  consultation_id: `hc-${n}`,
  patient_id,
  service_type: 'Medical',
  chief_complaint: 'Cough',
  treatment_notes: 'Rest and fluids for three days',
  diagnoses: [{ description: 'Acute bronchitis', icd10_code: 'J20.9' }],
  rx: [{ drug_name: 'Paracetamol', dose: '500 mg', frequency: 'Every 6 hours', quantity: 10 }],
  certificate: { purpose: 'Sick leave', findings: 'Fever', rest_days: 2 },
  labs: ['Urinalysis'],
  rx_id: `hrx-${n}`,
  doc_id: `hdoc-${n}`,
  lab_ids: [`hlab-${n}`],
  ...extra,
})

async function newPatient(name: string, birthdate = '1990-03-04') {
  const id = await tx((q) => registerUnlisted(q, desk, { full_name: name, birthdate, sex: 'Female', contact: '', civil_status: 'Single' }, true))
  await tx((q) => recordPaperCheck(q, desk, id, 'none'))
  return id
}

beforeAll(async () => {
  db = await getDb()
  await seed(db)
  const id = await tx((q) => createStaff(q, doctor, { name: 'Dr. Other Doctor', role: 'doctor', title: 'Physician', license_no: '7654321', password: 'Other-pass-1' }))
  await db.update(staff).set({ pin_hash: await hashSecret('2468'), must_change_password: false }).where(eq(staff.staff_id, id))
  other = { staff_id: id, name: 'Dr. Other Doctor', role: 'doctor' }
})

describe('field rules', () => {
  it('accepts only real calendar days and sensible birthdates', () => {
    expect(IsoDate.safeParse('2026-02-28').success).toBe(true)
    expect(IsoDate.safeParse('2026-02-30').success).toBe(false)
    expect(IsoDate.safeParse('28/02/2026').success).toBe(false)
    expect(Birthdate.safeParse('1899-12-31').success).toBe(false)
    expect(Birthdate.safeParse('2999-01-01').success).toBe(false)
    expect(Birthdate.safeParse('1985-07-14').success).toBe(true)
  })

  it('compares names with accents folded, not dropped', () => {
    expect(normName('Bañas')).toBe(normName('Banas'))
    expect(normName('Parreño, Joel')).toBe('parrenojoel')
  })

  it('verifies a person typed without the ñ', async () => {
    const id = await newPatient('Lorna Peñaflor')
    const [pt] = await db.select().from(patient).where(eq(patient.patient_id, id))
    const res = await tx((q) => verifyIdentity(q, desk, pt.person_id, { full_name: 'Lorna Penaflor', birthdate: '1990-03-04' }))
    expect(res.ok).toBe(true)
  })
})

describe('signing and documents', () => {
  it('signs only the doctor’s own drafts and refuses a colleague’s', async () => {
    const pid = await newPatient('Ana Sign Test')
    await tx((q) => saveConsultation(q, doctor, consult(pid, 'own')))
    await expect(tx((q) => signDocuments(q, other, [{ kind: 'rx', id: 'hrx-own' }], '2468'))).rejects.toMatchObject({ status: 403 })
    await expect(tx((q) => editDraft(q, other, 'doc', 'hdoc-own', { findings: 'changed' }))).rejects.toMatchObject({ status: 403 })
    await expect(tx((q) => editDraft(q, other, 'rx', 'hrx-own', { items: [] }))).rejects.toMatchObject({ status: 403 })
    expect(await tx((q) => signDocuments(q, doctor, [{ kind: 'rx', id: 'hrx-own' }], '1234'))).toBe('ok')
  })

  it('locks signing after five wrong PINs', async () => {
    const pid = await newPatient('Bea Lock Test')
    await tx((q) => saveConsultation(q, other, consult(pid, 'lock')))
    for (let i = 0; i < 5; i++) expect(await tx((q) => signDocuments(q, other, [{ kind: 'rx', id: 'hrx-lock' }], '0000'))).toBe('bad-pin')
    await expect(tx((q) => signDocuments(q, other, [{ kind: 'rx', id: 'hrx-lock' }], '2468'))).rejects.toMatchObject({ status: 429 })
  })

  it('reissues only a voided document, and only once', async () => {
    const pid = await newPatient('Cora Reissue Test')
    await tx((q) => saveConsultation(q, doctor, consult(pid, 're')))
    await tx((q) => signDocuments(q, doctor, [{ kind: 'doc', id: 'hdoc-re' }], '1234'))
    await expect(tx((q) => reissueDocument(q, doctor, 'doc', 'hdoc-re', 'hdoc-re2'))).rejects.toMatchObject({ status: 409 })
    await tx((q) => voidDocument(q, doctor, 'doc', 'hdoc-re', 'Wrong number of rest days'))
    await expect(tx((q) => voidDocument(q, doctor, 'doc', 'hdoc-re', 'again'))).rejects.toMatchObject({ status: 409 })
    expect(await tx((q) => reissueDocument(q, doctor, 'doc', 'hdoc-re', 'hdoc-re2'))).toBe('hdoc-re2')
    expect(await tx((q) => reissueDocument(q, doctor, 'doc', 'hdoc-re', 'hdoc-re2'))).toBe('hdoc-re2') // retry
    await expect(tx((q) => reissueDocument(q, doctor, 'doc', 'hdoc-re', 'hdoc-re3'))).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a correction that points at another patient’s consultation', async () => {
    const a = await newPatient('Dina Correction A')
    const b = await newPatient('Edna Correction B')
    await tx((q) => saveConsultation(q, doctor, consult(a, 'corr-a', { rx: [], certificate: undefined, labs: [], lab_ids: [] })))
    await expect(tx((q) => saveConsultation(q, doctor, consult(b, 'corr-b', { correction_of: 'hc-corr-a' })))).rejects.toMatchObject({ status: 400 })
  })

  it('keeps the old lab result when a doctor corrects it, and stops the desk overwriting it', async () => {
    const pid = await newPatient('Fe Lab Test')
    await tx((q) => saveConsultation(q, doctor, consult(pid, 'lab')))
    await tx((q) => addLabResult(q, desk, 'hlab-lab', 'Normal'))
    await expect(tx((q) => addLabResult(q, desk, 'hlab-lab', 'Abnormal'))).rejects.toMatchObject({ status: 409 })
    await tx((q) => addLabResult(q, doctor, 'hlab-lab', 'Trace protein'))
    const [row] = await db.select().from(labOrder).where(eq(labOrder.lab_id, 'hlab-lab'))
    expect(row.result).toBe('Trace protein')
    const snap = await loadSnapshot(db, doctor)
    expect(snap.audit.find((a) => a.record_id === 'hlab-lab' && a.summary.startsWith('Corrected'))?.detail).toContain('Normal')
  })

  it('accepts only raster signature images', async () => {
    await expect(tx((q) => setSignatureImage(q, doctor, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='))).rejects.toMatchObject({ status: 413 })
  })
})

describe('queue rules', () => {
  it('gives a person one place in today’s queue', async () => {
    const pid = await newPatient('Gina Queue Test')
    await tx((q) => issueTicket(q, desk, pid, [], 'Medical', ''))
    await expect(tx((q) => issueTicket(q, desk, pid, [], 'Medical', ''))).rejects.toMatchObject({ status: 409 })
  })

  it('allows only sensible status changes', async () => {
    const pid = await newPatient('Hilda Status Test')
    const id = await tx((q) => issueTicket(q, desk, pid, [], 'Medical', ''))
    await expect(tx((q) => setTicketStatus(q, desk, id, 'done'))).rejects.toMatchObject({ status: 409 })
    await expect(tx((q) => setTicketStatus(q, desk, id, 'in_consult'))).rejects.toMatchObject({ status: 409 })
    await tx((q) => callTicket(q, doctor, id))
    await expect(tx((q) => startConsult(q, other, id))).rejects.toMatchObject({ status: 409 })
    await tx((q) => startConsult(q, doctor, id))
    await expect(tx((q) => setTicketStatus(q, desk, id, 'waiting'))).rejects.toMatchObject({ status: 403 })
    await tx((q) => setTicketStatus(q, doctor, id, 'waiting'))
  })

  it('still saves the note when the ticket already has one', async () => {
    const pid = await newPatient('Ines Ticket Test')
    const id = await tx((q) => issueTicket(q, desk, pid, [], 'Medical', ''))
    await tx((q) => saveConsultation(q, doctor, consult(pid, 't1', { ticket_id: id, rx: [], certificate: undefined, labs: [], lab_ids: [] })))
    expect(await tx((q) => saveConsultation(q, doctor, consult(pid, 't2', { ticket_id: id, rx: [], certificate: undefined, labs: [], lab_ids: [] })))).toBe('saved')
  })

  it('closes tickets left waiting from an earlier day', async () => {
    const pid = await newPatient('Jane Stale Test')
    const id = await tx((q) => issueTicket(q, desk, pid, [], 'Medical', ''))
    await db.update(queueTicket).set({ day: '2020-01-01' }).where(eq(queueTicket.ticket_id, id))
    expect(await tx((q) => closeStaleTickets(q))).toBeGreaterThan(0)
    const [row] = await db.select().from(queueTicket).where(eq(queueTicket.ticket_id, id))
    expect(row.status).toBe('left')
    expect(todayKey() > row.day).toBe(true)
  })
})

describe('public waiting screen', () => {
  it('sends only today’s tickets', async () => {
    const { loadPublicQueue } = await import('../src/server/state')
    const pub = await loadPublicQueue(db)
    expect(pub.tickets.every((tk) => tk.day === todayKey())).toBe(true)
  })
})

describe('records', () => {
  it('creates a dependent once per id and refuses a likely duplicate unless confirmed', async () => {
    const principal = await newPatient('Karen Principal Test')
    const kid = { full_name: 'Liza Principal Test', birthdate: '2015-05-05', sex: 'Female' as const, contact: '', civil_status: 'Single' as const }
    const a = await tx((q) => createDependent(q, desk, principal, kid, 'Child', true, { patientId: 'dep-fixed-id-1' }))
    const b = await tx((q) => createDependent(q, desk, principal, kid, 'Child', true, { patientId: 'dep-fixed-id-1' }))
    expect(b).toBe(a)
    await expect(tx((q) => createDependent(q, desk, principal, kid, 'Child', true))).rejects.toMatchObject({ status: 409 })
    await expect(tx((q) => linkRelative(q, desk, principal, a, 'Child', true))).rejects.toMatchObject({ status: 409 })
  })
})

describe('temporary passwords', () => {
  it('shows only the person’s own account until they choose a password', async () => {
    const id = await tx((q) => createStaff(q, doctor, { name: 'Nurse Temp', role: 'nurse', title: 'Nurse', password: 'Temp-pass-1' }))
    const { token } = await login(db, id, 'Temp-pass-1')
    const actor = await actorFromToken(db, token)
    expect(actor?.must_change_password).toBe(true)
    const snap = await loadSnapshot(db, actor!)
    expect(snap.patients).toHaveLength(0)
    expect(snap.staff.map((s) => s.staff_id)).toEqual([id])
    // Through the HTTP layer: every other endpoint refuses, the snapshot and password change do not.
    const { POST: flag } = await import('../app/api/patients/flag/route')
    const { GET: state } = await import('../app/api/state/route')
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const refused = await flag(new Request('http://x/api/patients/flag', { method: 'POST', headers, body: JSON.stringify({ person_id: 'p', note: 'n' }) }))
    expect(refused.status).toBe(403)
    expect((await state(new Request('http://x/api/state', { headers }))).status).toBe(200)
  })
})

describe('resetting the demo data', () => {
  const reset = async (env: Record<string, string | undefined>) => {
    const prev = { ...process.env }
    Object.assign(process.env, env)
    const { POST } = await import('../app/api/dev/reset/route')
    const { token } = await login(db, 'st-d1', 'demo-password')
    const res = await POST(new Request('http://x/api/dev/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' }), { params: Promise.resolve({}) } as never)
    process.env = prev
    return res
  }

  it('refuses on a server that is not a demo, so a real clinic database is never wiped by a button', async () => {
    const res = await reset({ GILAYON_ALLOW_RESET: '0', HIMSOG_ALLOW_RESET: undefined, NEXT_PUBLIC_DEMO: '0' })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Reset is disabled') })
  })

  it('is allowed where it is switched on for a rehearsal', async () => {
    const res = await reset({ GILAYON_ALLOW_RESET: '1', NEXT_PUBLIC_DEMO: '0' })
    expect(res.status).toBe(200)
  })
})
