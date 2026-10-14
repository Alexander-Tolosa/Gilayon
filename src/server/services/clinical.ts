import { and, eq } from 'drizzle-orm'
import * as t from '../../../db/schema'
import type { ConsultInput } from '../../features/clinic/api-types'
import { todayKey } from '../../features/clinic/lib/helpers'
import { verifyPin } from '../auth'
import { audit, HttpError, nextCounter, nowMs, uuid, type Actor } from '../core'
import type { Q } from '../db'
import { patientName } from './records'

type Kind = 'rx' | 'doc'

/** Appends a consultation with its diagnoses, drafts and lab orders. A repeated id is a retry and changes nothing. */
export async function saveConsultation(q: Q, actor: Actor, input: ConsultInput, opts: { viaSync?: boolean } = {}) {
  const [dup] = await q.select({ id: t.consultation.consultation_id }).from(t.consultation).where(eq(t.consultation.consultation_id, input.consultation_id))
  if (dup) return 'duplicate' as const
  const created = nowMs()
  const cid = input.consultation_id
  await q.insert(t.consultation).values({
    consultation_id: cid,
    patient_id: input.patient_id,
    ticket_id: input.ticket_id ?? null,
    doctor_id: actor.staff_id,
    service_type: input.service_type,
    consult_date: todayKey(),
    created_at: created,
    chief_complaint: input.chief_complaint,
    treatment_notes: input.treatment_notes,
    vitals: input.vitals ?? null,
    correction_of: input.correction_of ?? null,
  })
  if (input.diagnoses.length) await q.insert(t.diagnosis).values(input.diagnoses.map((d) => ({ diagnosis_id: uuid(), consultation_id: cid, description: d.description, icd10_code: d.icd10_code })))
  if (input.rx.length) {
    await q.insert(t.prescription).values({ prescription_id: input.rx_id, consultation_id: cid, patient_id: input.patient_id, doctor_id: actor.staff_id, status: 'draft', created_at: created })
    await q.insert(t.prescriptionItem).values(input.rx.map((r) => ({ item_id: uuid(), prescription_id: input.rx_id, drug_name: r.drug_name, dose: r.dose, frequency: r.frequency, quantity: r.quantity })))
  }
  if (input.certificate) {
    const c = input.certificate
    await q.insert(t.document).values({
      document_id: input.doc_id,
      patient_id: input.patient_id,
      consultation_id: cid,
      doctor_id: actor.staff_id,
      doc_type: 'Medical certificate',
      purpose: c.purpose,
      findings: c.findings,
      rest_days: c.rest_days ?? null,
      remarks: c.remarks ?? null,
      status: 'draft',
      created_at: created,
    })
  }
  if (input.labs.length)
    await q.insert(t.labOrder).values(input.labs.map((test, i) => ({ lab_id: input.lab_ids[i] ?? uuid(), patient_id: input.patient_id, consultation_id: cid, requested_by: actor.staff_id, test_name: test, status: 'requested' as const, requested_at: created })))
  if (input.ticket_id) await q.update(t.queueTicket).set({ status: 'done', done_at: created }).where(eq(t.queueTicket.ticket_id, input.ticket_id))
  const name = await patientName(q, input.patient_id)
  await audit(q, actor.staff_id, { action: 'create', table: 'consultation', record: cid, summary: `${input.correction_of ? 'Added correction to consultation' : 'Added consultation'} for ${name}` })
  if (opts.viaSync) await audit(q, 'system', { action: 'sync', table: 'consultation', record: cid, summary: `Synced consultation for ${name} from the offline queue` })
  return 'saved' as const
}

/** Signing needs the doctor's PIN. Document numbers are issued here and nowhere else. */
export async function signDocuments(q: Q, actor: Actor, refs: { kind: Kind; id: string }[], pin: string) {
  const [me] = await q.select().from(t.staff).where(eq(t.staff.staff_id, actor.staff_id))
  if (!me || !(await verifyPin(pin, me.pin_hash))) {
    await audit(q, actor.staff_id, { action: 'flag', table: 'staff', record: actor.staff_id, summary: 'Signing failed: incorrect PIN' })
    return 'bad-pin' as const
  }
  const year = new Date().getFullYear()
  for (const ref of refs) {
    const issued_at = nowMs()
    const signature = `${me.name} · PRC ${me.license_no} · PIN verified · ${new Date(issued_at).toISOString()}`
    if (ref.kind === 'rx') {
      const [row] = await q.select().from(t.prescription).where(eq(t.prescription.prescription_id, ref.id))
      if (!row || row.status !== 'draft') continue
      const document_no = `RX-${year}-${String(await nextCounter(q, 'rx')).padStart(6, '0')}`
      await q.update(t.prescription).set({ status: 'signed', signed_by: actor.staff_id, issued_at, document_no, signature }).where(eq(t.prescription.prescription_id, ref.id))
      await audit(q, actor.staff_id, { action: 'sign', table: 'prescription', record: ref.id, summary: `Signed prescription ${document_no}` })
    } else {
      const [row] = await q.select().from(t.document).where(eq(t.document.document_id, ref.id))
      if (!row || row.status !== 'draft') continue
      const document_no = `MC-${year}-${String(await nextCounter(q, 'mc')).padStart(6, '0')}`
      await q.update(t.document).set({ status: 'signed', signed_by: actor.staff_id, issued_at, document_no, signature }).where(eq(t.document.document_id, ref.id))
      await audit(q, actor.staff_id, { action: 'sign', table: 'document', record: ref.id, summary: `Signed medical certificate ${document_no}` })
    }
  }
  return 'ok' as const
}

/** A signed document is never edited: it keeps its row, marked voided with a reason. */
export async function voidDocument(q: Q, actor: Actor, kind: Kind, id: string, reason: string) {
  if (!reason.trim()) throw new HttpError(400, 'A reason is required to void a document.')
  if (kind === 'rx') {
    const [r] = await q.select().from(t.prescription).where(eq(t.prescription.prescription_id, id))
    if (!r) throw new HttpError(404, 'Prescription not found')
    await q.update(t.prescription).set({ status: 'voided', void_reason: reason }).where(eq(t.prescription.prescription_id, id))
    await audit(q, actor.staff_id, { action: 'void', table: 'prescription', record: id, summary: `Voided ${r.document_no ?? 'draft prescription'}: ${reason}` })
  } else {
    const [d] = await q.select().from(t.document).where(eq(t.document.document_id, id))
    if (!d) throw new HttpError(404, 'Document not found')
    await q.update(t.document).set({ status: 'voided', void_reason: reason }).where(eq(t.document.document_id, id))
    await audit(q, actor.staff_id, { action: 'void', table: 'document', record: id, summary: `Voided ${d.document_no ?? 'draft certificate'}: ${reason}` })
  }
}

/** Reissue = a new draft that points back at the voided original. The client supplies the id so a retry is safe. */
export async function reissueDocument(q: Q, actor: Actor, kind: Kind, id: string, newId: string) {
  const now = nowMs()
  if (kind === 'rx') {
    const [dup] = await q.select().from(t.prescription).where(eq(t.prescription.prescription_id, newId))
    if (dup) return newId
    const [r] = await q.select().from(t.prescription).where(eq(t.prescription.prescription_id, id))
    if (!r) throw new HttpError(404, 'Prescription not found')
    const items = await q.select().from(t.prescriptionItem).where(eq(t.prescriptionItem.prescription_id, id))
    await q.insert(t.prescription).values({ prescription_id: newId, consultation_id: r.consultation_id, patient_id: r.patient_id, doctor_id: actor.staff_id, status: 'draft', created_at: now, replaces: id })
    if (items.length) await q.insert(t.prescriptionItem).values(items.map((i) => ({ item_id: uuid(), prescription_id: newId, drug_name: i.drug_name, dose: i.dose, frequency: i.frequency, quantity: i.quantity })))
    await audit(q, actor.staff_id, { action: 'create', table: 'prescription', record: newId, summary: `Drafted replacement for ${r.document_no}` })
  } else {
    const [dup] = await q.select().from(t.document).where(eq(t.document.document_id, newId))
    if (dup) return newId
    const [d] = await q.select().from(t.document).where(eq(t.document.document_id, id))
    if (!d) throw new HttpError(404, 'Document not found')
    await q.insert(t.document).values({
      document_id: newId,
      patient_id: d.patient_id,
      consultation_id: d.consultation_id,
      doctor_id: actor.staff_id,
      doc_type: d.doc_type,
      purpose: d.purpose,
      findings: d.findings,
      rest_days: d.rest_days,
      remarks: d.remarks,
      status: 'draft',
      created_at: now,
      replaces: id,
    })
    await audit(q, actor.staff_id, { action: 'create', table: 'document', record: newId, summary: `Drafted replacement for ${d.document_no}` })
  }
  return newId
}

type RxPatch = { items?: { drug_name: string; dose: string; frequency: string; quantity: number }[] }
type DocPatch = Partial<{ purpose: string; findings: string; rest_days: number | null; remarks: string | null }>

/** Only drafts can change; the database trigger enforces the same rule for signed rows. */
export async function editDraft(q: Q, actor: Actor, kind: Kind, id: string, patch: RxPatch & DocPatch) {
  if (kind === 'rx') {
    const [r] = await q.select().from(t.prescription).where(and(eq(t.prescription.prescription_id, id), eq(t.prescription.status, 'draft')))
    if (!r) throw new HttpError(409, 'Only drafts can be edited.')
    if (patch.items) {
      await q.delete(t.prescriptionItem).where(eq(t.prescriptionItem.prescription_id, id))
      if (patch.items.length) await q.insert(t.prescriptionItem).values(patch.items.map((i) => ({ item_id: uuid(), prescription_id: id, drug_name: i.drug_name, dose: i.dose, frequency: i.frequency, quantity: i.quantity })))
    }
  } else {
    const set: Record<string, unknown> = {}
    for (const k of ['purpose', 'findings', 'rest_days', 'remarks'] as const) if (k in patch) set[k] = patch[k] ?? null
    if (Object.keys(set).length) {
      const res = await q.update(t.document).set(set).where(and(eq(t.document.document_id, id), eq(t.document.status, 'draft'))).returning({ id: t.document.document_id })
      if (!res.length) throw new HttpError(409, 'Only drafts can be edited.')
    }
  }
  void actor
}

export async function addLabResult(q: Q, actor: Actor, labId: string, result: string) {
  const [l] = await q.select().from(t.labOrder).where(eq(t.labOrder.lab_id, labId))
  if (!l) throw new HttpError(404, 'Lab order not found')
  await q.update(t.labOrder).set({ status: 'resulted', result, result_date: todayKey() }).where(eq(t.labOrder.lab_id, labId))
  await audit(q, actor.staff_id, { action: 'edit', table: 'lab_order', record: labId, summary: `Entered result for ${l.test_name}` })
}


