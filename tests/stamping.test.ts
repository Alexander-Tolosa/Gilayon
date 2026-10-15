import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { document, documentRelease } from '../db/schema'
import { seed } from '../db/seed'
import type { Actor } from '../src/server/core'
import { getDb, type Db } from '../src/server/db'
import { releaseDocument, saveConsultation, signDocuments, voidDocument } from '../src/server/services/clinical'
import { loadSnapshot } from '../src/server/state'
import type { ConsultInput } from '../src/features/clinic/api-types'

process.env.PGLITE_DIR = 'memory://'

/*
  The end of a visit: the doctor signs a dental report, the front desk stamps it and hands it over.
  The release is a separate append-only record, so the signed document itself is never touched.
*/

let db: Db
let patient_id: string
const doctor: Actor = { staff_id: 'st-d3', name: 'Dr. Analyn Hechanova', role: 'doctor' }
const nurse: Actor = { staff_id: 'st-n1', name: 'Nurse Maricris Alinsug, RN', role: 'nurse' }
const desk: Actor = { staff_id: 'st-f1', name: 'Cristina Bañas', role: 'desk' }

const dentalVisit = (n: string): ConsultInput => ({
  consultation_id: `c-${n}`,
  patient_id,
  service_type: 'Dental',
  chief_complaint: 'Toothache',
  treatment_notes: 'Cleaning and filling',
  diagnoses: [{ description: 'Dental caries', icd10_code: 'K02.9' }],
  rx: [],
  certificate: { doc_type: 'Dental report', purpose: 'Tooth filling', findings: 'Caries on tooth 46, filled', remarks: 'Return in 6 months' },
  labs: [],
  rx_id: `rx-${n}`,
  doc_id: `doc-${n}`,
  lab_ids: [],
})

beforeAll(async () => {
  db = await getDb()
  await seed(db)
  patient_id = (await loadSnapshot(db, doctor)).patients[3].patient_id
})

describe('dental report', () => {
  it('is saved as a draft and signed with its own document number', async () => {
    expect(await db.transaction((tx) => saveConsultation(tx, doctor, dentalVisit('d1')))).toBe('saved')
    const [draft] = await db.select().from(document).where(eq(document.document_id, 'doc-d1'))
    expect(draft).toMatchObject({ doc_type: 'Dental report', status: 'draft', purpose: 'Tooth filling' })
    expect(await db.transaction((tx) => signDocuments(tx, doctor, [{ kind: 'doc', id: 'doc-d1' }], '1234'))).toBe('ok')
    const [signed] = await db.select().from(document).where(eq(document.document_id, 'doc-d1'))
    expect(signed.status).toBe('signed')
    expect(signed.document_no).toMatch(/^DR-\d{4}-\d{6}$/)
  })

  it('is immutable once signed', async () => {
    await expect(db.update(document).set({ findings: 'tampered' }).where(eq(document.document_id, 'doc-d1'))).rejects.toThrow()
  })
})

describe('stamping and handing over', () => {
  it('lets the desk and the nurse release a signed document, once', async () => {
    expect(await db.transaction((tx) => releaseDocument(tx, desk, 'doc', 'doc-d1'))).toBe('released')
    expect(await db.transaction((tx) => releaseDocument(tx, nurse, 'doc', 'doc-d1'))).toBe('already')
    const rows = await db.select().from(documentRelease).where(eq(documentRelease.document_id, 'doc-d1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'doc', released_by: 'st-f1', patient_id })
  })

  it('leaves the signed document untouched and puts the release in everyone\'s snapshot and the audit trail', async () => {
    const [signed] = await db.select().from(document).where(eq(document.document_id, 'doc-d1'))
    expect(signed.status).toBe('signed')
    for (const who of [desk, nurse, doctor]) expect((await loadSnapshot(db, who)).releases.map((r) => r.document_id)).toContain('doc-d1')
    expect((await loadSnapshot(db, doctor)).audit.some((a) => a.action === 'release')).toBe(true)
  })

  it('refuses a draft, a voided document and an unknown id', async () => {
    await db.transaction((tx) => saveConsultation(tx, doctor, dentalVisit('d2')))
    await expect(db.transaction((tx) => releaseDocument(tx, desk, 'doc', 'doc-d2'))).rejects.toMatchObject({ status: 409 })
    await db.transaction((tx) => signDocuments(tx, doctor, [{ kind: 'doc', id: 'doc-d2' }], '1234'))
    await db.transaction((tx) => voidDocument(tx, doctor, 'doc', 'doc-d2', 'Wrong tooth number'))
    await expect(db.transaction((tx) => releaseDocument(tx, desk, 'doc', 'doc-d2'))).rejects.toMatchObject({ status: 409 })
    await expect(db.transaction((tx) => releaseDocument(tx, desk, 'rx', 'nope'))).rejects.toMatchObject({ status: 404 })
  })

  it('keeps the release record append-only', async () => {
    await expect(db.update(documentRelease).set({ released_by: 'someone' }).where(eq(documentRelease.document_id, 'doc-d1'))).rejects.toThrow()
    await expect(db.delete(documentRelease).where(eq(documentRelease.document_id, 'doc-d1'))).rejects.toThrow()
  })
})

describe('vital signs taken at the front desk', () => {
  it('travel with the queue number and blank readings are dropped', async () => {
    const { issueTicket } = await import('../src/server/services/queue')
    const { queueTicket } = await import('../db/schema')
    const id = await db.transaction((tx) => issueTicket(tx, desk, patient_id, ['regular'], 'Medical', 'Checkup', undefined, { bp: '120/80', temperature: ' 36.8 ', pulse: '', respiration: '16', height: '165', weight: '62' }))
    const [row] = await db.select().from(queueTicket).where(eq(queueTicket.ticket_id, id))
    expect(row.vitals).toEqual({ bp: '120/80', temperature: '36.8', respiration: '16', height: '165', weight: '62' })
    const snap = await loadSnapshot(db, nurse)
    expect(snap.tickets.find((x) => x.ticket_id === id)?.vitals).toEqual({ bp: '120/80', temperature: '36.8', respiration: '16', height: '165', weight: '62' })
  })
})
