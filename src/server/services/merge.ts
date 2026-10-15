import { and, eq, inArray } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { audit, HttpError, nowMs, type Actor } from '../core'
import type { Q } from '../db'
import { mergeMap } from '../state'

/**
 * Follows a merged record to the patient it now lives under. Anything written for an old id (a stale
 * browser tab, a printed slip) lands on the surviving record instead of recreating the duplicate.
 */
export async function canonicalPatientId(q: Q, patientId: string): Promise<string> {
  let cur = patientId
  for (let i = 0; i < 10; i++) {
    const [row] = await q.select({ m: t.patient.merged_into }).from(t.patient).where(eq(t.patient.patient_id, cur))
    if (!row?.m) return cur
    cur = row.m
  }
  return cur
}

const label = async (q: Q, patientId: string) => {
  const [r] = await q
    .select({ name: t.person.full_name, no: t.patient.patient_no })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
    .where(eq(t.patient.patient_id, patientId))
  return r ? `${r.name} (${r.no})` : patientId
}

/** Everything attached to a patient and, through earlier merges, to the records already folded into it. */
export async function groupIds(q: Q, patientId: string) {
  const all = await q.select({ patient_id: t.patient.patient_id, merged_into: t.patient.merged_into }).from(t.patient)
  const map = mergeMap(all)
  return [patientId, ...Object.entries(map).filter(([, root]) => root === patientId).map(([id]) => id)]
}

/**
 * Doctors who have a consultation on this patient (or on a record merged into it) may amend, void or
 * reissue; any other doctor can read but not change. Starting a consult from the queue is how one joins.
 */
export async function assertCareTeam(q: Q, actor: Actor, patientId: string) {
  const root = await canonicalPatientId(q, patientId)
  const ids = await groupIds(q, root)
  const [mine] = await q
    .select({ id: t.consultation.consultation_id })
    .from(t.consultation)
    .where(and(inArray(t.consultation.patient_id, ids), eq(t.consultation.doctor_id, actor.staff_id)))
    .limit(1)
  if (!mine) throw new HttpError(403, 'Only a doctor who has consulted this patient can change their record.')
}

async function counts(q: Q, ids: string[]) {
  const n = async (table: typeof t.consultation | typeof t.document | typeof t.prescription | typeof t.scannedPage) =>
    (await q.select({ id: table.patient_id }).from(table).where(inArray(table.patient_id, ids))).length
  return { consultations: await n(t.consultation), documents: await n(t.document), prescriptions: await n(t.prescription), scans: await n(t.scannedPage) }
}

export async function mergePatients(q: Q, actor: Actor, input: { keep: string; duplicate: string; reason: string }) {
  const reason = input.reason.trim()
  if (reason.length < 3) throw new HttpError(400, 'Say why these are the same person (for example "same birthdate and employee ID").')
  if (input.keep === input.duplicate) throw new HttpError(400, 'Choose two different records.')

  const rows = await q.select().from(t.patient).where(inArray(t.patient.patient_id, [input.keep, input.duplicate]))
  const keep = rows.find((r) => r.patient_id === input.keep)
  const dup = rows.find((r) => r.patient_id === input.duplicate)
  if (!keep || !dup) throw new HttpError(404, 'Patient record not found.')
  if (keep.merged_into || dup.merged_into) throw new HttpError(409, 'One of these records was already merged. Open the surviving record instead.')

  // Two people the HR list knows by different employee numbers are different people, whatever their names say.
  const emps = await q.select().from(t.employee).where(inArray(t.employee.person_id, [keep.person_id, dup.person_id]))
  const keepEmp = emps.find((e) => e.person_id === keep.person_id)
  const dupEmp = emps.find((e) => e.person_id === dup.person_id)
  if (keepEmp && dupEmp) throw new HttpError(409, `Both records are on the HR list with different employee numbers (${keepEmp.employee_no} and ${dupEmp.employee_no}). They are different people, or HR has a duplicate to fix.`)
  if (dupEmp && !keepEmp) throw new HttpError(409, 'The record that is on the HR list must be the one you keep. Swap the two and try again.')

  // Records already merged into the duplicate now belong to the survivor, so the chain stays one step deep.
  const before = await counts(q, await groupIds(q, dup.patient_id))
  await q.update(t.patient).set({ merged_into: keep.patient_id }).where(eq(t.patient.merged_into, dup.patient_id))
  await q.update(t.patient).set({ merged_into: keep.patient_id, merged_at: nowMs(), merged_by: actor.staff_id }).where(eq(t.patient.patient_id, dup.patient_id))

  await audit(q, actor.staff_id, {
    action: 'link',
    table: 'patient',
    record: keep.patient_id,
    summary: `Merged ${await label(q, dup.patient_id)} into ${await label(q, keep.patient_id)}`,
    detail: `Reason: ${reason}. Brought together: ${before.consultations} consultations, ${before.documents + before.prescriptions} documents, ${before.scans} scans. Merged record: ${dup.patient_id}.`,
  })
  return { keep: keep.patient_id, ...before }
}

/** Undoes one merge. Only the record that was merged away comes back; nothing was ever moved, so nothing is lost. */
export async function unmergePatient(q: Q, actor: Actor, duplicateId: string, reason: string) {
  if (reason.trim().length < 3) throw new HttpError(400, 'Say why this merge is being undone.')
  const [dup] = await q.select().from(t.patient).where(eq(t.patient.patient_id, duplicateId))
  if (!dup) throw new HttpError(404, 'Patient record not found.')
  if (!dup.merged_into) throw new HttpError(409, 'This record is not merged.')
  const survivor = dup.merged_into
  await q.update(t.patient).set({ merged_into: null, merged_at: null, merged_by: null }).where(eq(t.patient.patient_id, duplicateId))
  await audit(q, actor.staff_id, {
    action: 'link',
    table: 'patient',
    record: survivor,
    summary: `Undid the merge of ${await label(q, duplicateId)} from ${await label(q, survivor)}`,
    detail: `Reason: ${reason.trim()}`,
  })
}


const pairKey = (a: string, b: string) => [a, b].sort().join('|')

/** "These are two different people": stop suggesting the pair. */
export async function markNotDuplicate(q: Q, actor: Actor, a: string, b: string) {
  if (a === b) throw new HttpError(400, 'Choose two different records.')
  const [row] = await q.select().from(t.meta).where(eq(t.meta.key, 'not_duplicates'))
  const list = new Set((row?.value as string[] | undefined) ?? [])
  list.add(pairKey(a, b))
  const value = [...list]
  await q.insert(t.meta).values({ key: 'not_duplicates', value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
  await audit(q, actor.staff_id, { action: 'status', table: 'patient', record: a, summary: `Marked ${await label(q, a)} and ${await label(q, b)} as different people` })
}
