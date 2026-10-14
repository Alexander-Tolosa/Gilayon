import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { consultation, document, patient, queueTicket } from '../db/schema'
import { seed } from '../db/seed'

process.env.PGLITE_DIR = 'memory://'

const { getDb } = await import('../src/server/db')
const { loadSnapshot } = await import('../src/server/state')
const { login } = await import('../src/server/auth')
const { mergePatients, unmergePatient } = await import('../src/server/services/merge')
const { issueTicket } = await import('../src/server/services/queue')
const { saveConsultation } = await import('../src/server/services/clinical')
const { addAllergy } = await import('../src/server/services/records')

const doctor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' as const }
const desk = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' as const }

type Db = Awaited<ReturnType<typeof getDb>>
let db: Db
let snap: Awaited<ReturnType<typeof loadSnapshot>>

/** Three dependents (no HR entry) that have visits, and one employee. */
const pick = () => {
  const empPersons = new Set(snap.employees.map((e) => e.person_id))
  const deps = snap.patients.filter((p) => !empPersons.has(p.person_id) && snap.consultations.some((c) => c.patient_id === p.patient_id))
  const emps = snap.patients.filter((p) => empPersons.has(p.person_id))
  return { a: deps[0], b: deps[1], c: deps[2], emp: emps[0], emp2: emps[1] }
}

beforeAll(async () => {
  db = await getDb()
  await seed(db)
  snap = await loadSnapshot(db, doctor)
})

describe('merging two records of the same person', () => {
  it('shows both histories under the survivor without touching a single immutable row', async () => {
    const { a, b } = pick()
    const owned = (id: string) => snap.consultations.filter((c) => c.patient_id === id).length
    const docsOf = (id: string) => snap.documents.filter((d) => d.patient_id === id).length
    const expectConsults = owned(a.patient_id) + owned(b.patient_id)
    const expectDocs = docsOf(a.patient_id) + docsOf(b.patient_id)
    const [rawBefore] = await db.select().from(consultation).where(eq(consultation.patient_id, b.patient_id)).limit(1)

    const r = await db.transaction((tx) => mergePatients(tx, desk, { keep: a.patient_id, duplicate: b.patient_id, reason: 'Same birthdate and employee ID' }))
    expect(r.keep).toBe(a.patient_id)

    const after = await loadSnapshot(db, doctor)
    expect(after.merged[b.patient_id]).toBe(a.patient_id)
    expect(after.patients.some((p) => p.patient_id === b.patient_id)).toBe(false)
    expect(after.persons.some((p) => p.person_id === b.person_id)).toBe(false)
    expect(after.consultations.filter((c) => c.patient_id === a.patient_id)).toHaveLength(expectConsults)
    expect(after.documents.filter((d) => d.patient_id === a.patient_id)).toHaveLength(expectDocs)
    expect(after.consultations.some((c) => c.patient_id === b.patient_id)).toBe(false)

    // The stored rows are exactly as they were: history is never rewritten.
    const [rawAfter] = await db.select().from(consultation).where(eq(consultation.consultation_id, rawBefore.consultation_id))
    expect(rawAfter.patient_id).toBe(b.patient_id)
    expect(after.audit.some((x) => x.action === 'link' && x.summary.startsWith('Merged '))).toBe(true)
  })

  it('refuses a second merge of the same record, the same record twice, and a missing reason', async () => {
    const { a, b, c } = pick()
    await expect(db.transaction((tx) => mergePatients(tx, desk, { keep: c.patient_id, duplicate: b.patient_id, reason: 'again' }))).rejects.toMatchObject({ status: 409 })
    await expect(db.transaction((tx) => mergePatients(tx, desk, { keep: c.patient_id, duplicate: c.patient_id, reason: 'same one' }))).rejects.toMatchObject({ status: 400 })
    await expect(db.transaction((tx) => mergePatients(tx, desk, { keep: a.patient_id, duplicate: c.patient_id, reason: ' ' }))).rejects.toMatchObject({ status: 400 })
  })

  it('will not merge two people the HR list knows by different employee numbers', async () => {
    const { emp, emp2 } = pick()
    await expect(db.transaction((tx) => mergePatients(tx, desk, { keep: emp.patient_id, duplicate: emp2.patient_id, reason: 'looks the same' }))).rejects.toMatchObject({ status: 409 })
  })

  it('the record on the HR list must be the one kept', async () => {
    const { emp, c } = pick()
    await expect(db.transaction((tx) => mergePatients(tx, desk, { keep: c.patient_id, duplicate: emp.patient_id, reason: 'swap check' }))).rejects.toMatchObject({ status: 409 })
  })

  it('anything still sent to the old record lands on the survivor', async () => {
    const { a, b } = pick()
    const id = await db.transaction((tx) => issueTicket(tx, desk, b.patient_id, ['regular'], 'Medical', 'late slip'))
    const [t] = await db.select().from(queueTicket).where(eq(queueTicket.ticket_id, id))
    expect(t.patient_id).toBe(a.patient_id)

    await db.transaction((tx) => addAllergy(tx, desk, b.patient_id, 'Shellfish', 'Hives', 'Moderate'))
    await db.transaction((tx) =>
      saveConsultation(tx, doctor, {
        consultation_id: 'merge-c1',
        patient_id: b.patient_id,
        service_type: 'Medical',
        chief_complaint: 'Cough',
        treatment_notes: 'Rest',
        diagnoses: [],
        rx: [],
        labs: [],
        rx_id: 'merge-rx1',
        doc_id: 'merge-doc1',
        lab_ids: [],
      }),
    )
    const [c] = await db.select().from(consultation).where(eq(consultation.consultation_id, 'merge-c1'))
    expect(c.patient_id).toBe(a.patient_id)
    const s = await loadSnapshot(db, doctor)
    expect(s.allergies.some((x) => x.patient_id === a.patient_id && x.substance === 'Shellfish')).toBe(true)
  })

  it('chains: merging a survivor into another keeps everything one step deep', async () => {
    const { a, c } = pick()
    await db.transaction((tx) => mergePatients(tx, desk, { keep: c.patient_id, duplicate: a.patient_id, reason: 'found the older folder' }))
    const s = await loadSnapshot(db, doctor)
    const { b } = pick()
    expect(s.merged[a.patient_id]).toBe(c.patient_id)
    expect(s.merged[b.patient_id]).toBe(c.patient_id)
    const [rawB] = await db.select().from(patient).where(eq(patient.patient_id, b.patient_id))
    expect(rawB.merged_into).toBe(c.patient_id)
  })

  it('only a doctor can undo a merge, and undoing restores the record untouched', async () => {
    const { a, c } = pick()
    const { POST } = await import('../app/api/patients/[id]/unmerge/route')
    const send = async (who: string, id: string) => {
      const { token } = await login(db, who, 'demo-password')
      return POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ reason: 'Merged by mistake' }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id }) })
    }
    expect((await send('st-f1', a.patient_id)).status).toBe(403)
    expect((await send('st-d1', a.patient_id)).status).toBe(200)
    const s = await loadSnapshot(db, doctor)
    expect(s.patients.some((p) => p.patient_id === a.patient_id)).toBe(true)
    expect(s.merged[a.patient_id]).toBeUndefined()
    expect(s.patients.some((p) => p.patient_id === c.patient_id)).toBe(true)
    await expect(db.transaction((tx) => unmergePatient(tx, doctor, a.patient_id, 'again'))).rejects.toMatchObject({ status: 409 })
    // Signed documents never changed hands, merged or not.
    const [signed] = await db.select().from(document).where(eq(document.status, 'signed')).limit(1)
    expect(signed).toBeTruthy()
  })
})
