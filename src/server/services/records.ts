import { and, eq, or, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import type { CivilStatus, PaperStatus, RelationshipType, ScanKind, Sex } from '../../features/clinic/types'
import { audit, HttpError, nextCounter, nowMs, uuid, type Actor } from '../core'
import { newScanId, removeScan, storeScan } from '../files'
import { canonicalPatientId } from './merge'
import { matchScore, normName } from '../../features/clinic/lib/helpers'
import type { Q } from '../db'

export const patientName = async (q: Q, patientId: string) => {
  const [r] = await q
    .select({ n: t.person.full_name })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
    .where(eq(t.patient.patient_id, patientId))
  return r?.n ?? 'patient'
}

export type IdChecked = 'company_id' | 'government_id' | 'other'
const ID_LABEL: Record<IdChecked, string> = { company_id: 'company ID', government_id: 'government ID', other: 'another ID' }

/**
 * Checks what the front desk typed against the record, and (when the person is on the HR list) their employee ID
 * as a secondary check. The paper folder and an ID card are the primary check, so a missing HR row is not a
 * mismatch. Pass or fail goes to the audit log; `override` lets the desk go ahead after checking another ID.
 */
export async function verifyIdentity(
  q: Q,
  actor: Actor,
  personId: string,
  entered: { full_name: string; birthdate: string; employee_no?: string; principal_no?: string; id_checked?: IdChecked; paper_match?: boolean; override?: boolean },
) {
  const [p] = await q.select().from(t.person).where(eq(t.person.person_id, personId))
  if (!p) throw new HttpError(404, 'Person not found')
  const [emp] = await q.select().from(t.employee).where(eq(t.employee.person_id, personId))
  const mismatches: string[] = []
  if (normName(entered.full_name) !== normName(p.full_name)) mismatches.push('Full name')
  if (entered.birthdate !== p.birthdate) mismatches.push('Birthdate')
  // Secondary checks run only when there is an HR row to compare with and the desk gave the number.
  const enteredEmp = (entered.employee_no ?? '').trim().toUpperCase()
  if (emp && enteredEmp && enteredEmp !== emp.employee_no) mismatches.push('Employee ID')
  const enteredPrincipal = (entered.principal_no ?? '').trim().toUpperCase()
  if (!emp && enteredPrincipal) {
    const [pt] = await q.select().from(t.patient).where(eq(t.patient.person_id, personId))
    const [rel] = pt ? await q.select().from(t.patientRelationship).where(eq(t.patientRelationship.related_patient_id, pt.patient_id)) : []
    const [principalEmp] = rel
      ? await q
          .select({ no: t.employee.employee_no })
          .from(t.patient)
          .innerJoin(t.employee, eq(t.employee.person_id, t.patient.person_id))
          .where(eq(t.patient.patient_id, rel.patient_id))
      : []
    if (principalEmp && enteredPrincipal !== principalEmp.no) mismatches.push('Employee ID of the principal')
  }
  if (entered.paper_match === false) mismatches.push('Paper folder')
  const ok = mismatches.length === 0
  const overridden = !ok && !!entered.override
  const how = [entered.id_checked ? `ID checked: ${ID_LABEL[entered.id_checked]}` : '', entered.paper_match === true ? 'matches the paper folder' : ''].filter(Boolean).join('; ')
  const summary = ok
    ? `Verified identity of ${p.full_name}${how ? ` (${how})` : ''}`
    : overridden
      ? `Verified ${p.full_name} by another ID although ${mismatches.join(', ')} did not match${how ? ` (${how})` : ''}`
      : `Verification failed for ${p.full_name}: ${mismatches.join(', ')} did not match`
  await audit(q, actor.staff_id, { action: ok || overridden ? 'verify' : 'flag', table: 'person', record: personId, summary })
  return { ok: ok || overridden, mismatches, overridden }
}

export async function flagForHR(q: Q, actor: Actor, personId: string, note: string) {
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.person_id, personId))
  if (pt) await q.update(t.patient).set({ hr_flag: note }).where(eq(t.patient.patient_id, pt.patient_id))
  await audit(q, actor.staff_id, { action: 'flag', table: 'person', record: personId, summary: `Flagged for HR: ${note}` })
}

type Patch = Partial<{ full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; pwd_id: string; philhealth_pin: string; legacy_folder_no: string; hr_flag: string }>

/** Edits keep both versions in the audit log; the later edit wins. */
export async function completeRecord(q: Q, actor: Actor, patientIdIn: string, patch: Patch, reason?: string) {
  const patientId = await canonicalPatientId(q, patientIdIn)
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.patient_id, patientId))
  if (!pt) throw new HttpError(404, 'Patient not found')
  const [per] = await q.select().from(t.person).where(eq(t.person.person_id, pt.person_id))
  const changed: string[] = []
  const personSet: Record<string, unknown> = {}
  const patientSet: Record<string, unknown> = {}
  const diff = (src: Record<string, unknown>, set: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      if (!(k in patch)) continue
      const v = (patch as Record<string, unknown>)[k] ?? null
      if (v === (src[k] ?? null)) continue
      set[k] = v === '' ? null : v
      changed.push(`${k}: "${String(src[k] ?? '')}" → "${String(v ?? '')}"`)
    }
  }
  diff(per, personSet, ['full_name', 'birthdate', 'sex', 'contact'])
  diff(pt, patientSet, ['civil_status', 'pwd_id', 'philhealth_pin', 'legacy_folder_no', 'hr_flag'])
  if (!changed.length) return
  if (Object.keys(personSet).length) await q.update(t.person).set(personSet).where(eq(t.person.person_id, per.person_id))
  if (Object.keys(patientSet).length) await q.update(t.patient).set(patientSet).where(eq(t.patient.patient_id, pt.patient_id))
  const name = (personSet.full_name as string | undefined) ?? per.full_name
  await audit(q, actor.staff_id, { action: 'edit', table: 'patient', record: patientId, summary: `Edited details of ${name}${reason ? ` (${reason})` : ''}`, detail: changed.join('; ') })
}

/** Records what the desk found in the paper cabinet. Folders are filed by name, so the number is optional. */
export async function recordPaperCheck(q: Q, actor: Actor, patientIdIn: string, status: PaperStatus, folderNo?: string) {
  const patientId = await canonicalPatientId(q, patientIdIn)
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.patient_id, patientId))
  if (!pt) throw new HttpError(404, 'Patient not found')
  const folder = folderNo?.trim()
  const set: Partial<typeof t.patient.$inferInsert> = { paper_status: status, paper_checked_at: nowMs(), paper_checked_by: actor.staff_id }
  if (status === 'on_file' && folder) set.legacy_folder_no = folder
  await q.update(t.patient).set(set).where(eq(t.patient.patient_id, patientId))
  const name = await patientName(q, patientId)
  const what = status === 'on_file' ? `paper folder on file${folder ? ` (no. ${folder})` : ''}` : 'no paper folder'
  await audit(q, actor.staff_id, { action: 'paper-check', table: 'patient', record: patientId, summary: `Checked the paper cabinet for ${name}: ${what}` })
  return { status, folder_no: status === 'on_file' ? (folder ?? pt.legacy_folder_no ?? undefined) : undefined }
}

async function nextPatientNo(q: Q) {
  const [{ max }] = await q.select({ max: sql<number>`coalesce(max(substring(${t.patient.patient_no} from 5)::int), 0)` }).from(t.patient)
  const n = await nextCounter(q, 'patient', max)
  return `HMO-${String(n).padStart(5, '0')}`
}

/** Same birthdate and sex and a similar name: refused until the desk confirms it checked an ID. */
async function refuseLikelyDuplicate(q: Q, full_name: string, birthdate: string, sex: Sex) {
  const same = await q.select().from(t.person).where(sql`${t.person.birthdate} = ${birthdate} and ${t.person.sex} = ${sex}`)
  const hit = same.find((p) => matchScore(full_name, p.full_name, []) >= 0.75)
  if (hit) throw new HttpError(409, `Possible duplicate: ${hit.full_name}, born ${hit.birthdate}, is already on file. Check an ID, then confirm this is a different person.`)
}

/** An employee ID belongs to one person. Returns the name of whoever already holds it, if anyone else does. */
async function employeeNoOwner(q: Q, employeeNo: string, exceptPersonId?: string) {
  const [row] = await q
    .select({ person_id: t.employee.person_id, name: t.person.full_name })
    .from(t.employee)
    .innerJoin(t.person, eq(t.person.person_id, t.employee.person_id))
    .where(eq(t.employee.employee_no, employeeNo))
  return row && row.person_id !== exceptPersonId ? row.name : null
}

/**
 * Registers someone who is not in the system yet (a past patient known only from the paper cabinet, or a
 * walk-in). The HR list is optional, so an employee ID, office and position can be typed in here. A likely
 * duplicate is refused unless the desk confirms it checked an ID.
 */
export async function registerUnlisted(
  q: Q,
  actor: Actor,
  input: { patient_id?: string; full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; philhealth_pin?: string; pwd_id?: string; employee_no?: string; office?: string; position?: string },
  confirmed = false,
) {
  if (input.patient_id) {
    const [dup] = await q.select({ id: t.patient.patient_id }).from(t.patient).where(eq(t.patient.patient_id, input.patient_id))
    if (dup) return dup.id // retried request
  }
  const full_name = input.full_name.trim().replace(/\s+/g, ' ')
  if (full_name.split(' ').length < 2) throw new HttpError(400, 'Enter the full name.')
  if (!confirmed) await refuseLikelyDuplicate(q, full_name, input.birthdate, input.sex)
  const employee_no = (input.employee_no ?? '').trim().toUpperCase()
  if (employee_no) {
    const owner = await employeeNoOwner(q, employee_no)
    if (owner) throw new HttpError(409, `Employee ID ${employee_no} already belongs to ${owner}.`)
  }
  const patient_no = await nextPatientNo(q)
  const person_id = uuid()
  const patient_id = input.patient_id ?? uuid()
  await q.insert(t.person).values({ person_id, full_name, birthdate: input.birthdate, sex: input.sex, contact: input.contact })
  if (employee_no) await q.insert(t.employee).values({ employee_id: uuid(), person_id, employee_no, office: (input.office ?? '').trim(), position: (input.position ?? '').trim() })
  await q.insert(t.patient).values({
    patient_id,
    person_id,
    patient_no,
    civil_status: input.civil_status,
    philhealth_pin: input.philhealth_pin || null,
    pwd_id: input.pwd_id || null,
    created_at: nowMs(),
    created_by: actor.staff_id,
  })
  await audit(q, actor.staff_id, { action: 'create', table: 'patient', record: patient_id, summary: `Registered ${full_name} at the front desk${employee_no ? ` (employee ${employee_no})` : ''}` })
  return patient_id
}

/** Adds or changes the employee ID, office and position by hand, for when HR has no list to import. */
export async function setEmployeeInfo(q: Q, actor: Actor, patientIdIn: string, info: { employee_no: string; office: string; position: string }, reason?: string) {
  const patientId = await canonicalPatientId(q, patientIdIn)
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.patient_id, patientId))
  if (!pt) throw new HttpError(404, 'Patient not found')
  const employee_no = info.employee_no.trim().toUpperCase()
  if (!employee_no) throw new HttpError(400, 'Enter the employee ID.')
  const owner = await employeeNoOwner(q, employee_no, pt.person_id)
  if (owner) throw new HttpError(409, `Employee ID ${employee_no} already belongs to ${owner}.`)
  const office = info.office.trim()
  const position = info.position.trim()
  const [existing] = await q.select().from(t.employee).where(eq(t.employee.person_id, pt.person_id))
  if (existing) await q.update(t.employee).set({ employee_no, office, position }).where(eq(t.employee.employee_id, existing.employee_id))
  else await q.insert(t.employee).values({ employee_id: uuid(), person_id: pt.person_id, employee_no, office, position })
  const name = await patientName(q, patientId)
  await audit(q, actor.staff_id, {
    action: 'edit',
    table: 'employee',
    record: patientId,
    summary: `${existing ? 'Changed' : 'Added'} employee details of ${name}${reason ? ` (${reason})` : ''}`,
    detail: existing ? `Employee ID ${existing.employee_no} → ${employee_no}; office ${existing.office} → ${office}; position ${existing.position} → ${position}` : `Employee ID ${employee_no}; office ${office}; position ${position}`,
  })
}

export async function createDependent(
  q: Q,
  actor: Actor,
  principalPatientIdIn: string,
  input: { full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; philhealth_pin?: string; pwd_id?: string },
  type: RelationshipType,
  mdr: boolean,
  opts: { patientId?: string; confirmed?: boolean } = {},
) {
  if (opts.patientId) {
    const [dup] = await q.select({ id: t.patient.patient_id }).from(t.patient).where(eq(t.patient.patient_id, opts.patientId))
    if (dup) return dup.id // retried request
  }
  const principalPatientId = await canonicalPatientId(q, principalPatientIdIn)
  const [principal] = await q.select({ id: t.patient.patient_id }).from(t.patient).where(eq(t.patient.patient_id, principalPatientId))
  if (!principal) throw new HttpError(404, 'Patient not found')
  const principalName = await patientName(q, principalPatientId)
  const full_name = input.full_name.trim().replace(/\s+/g, ' ')
  if (full_name.split(' ').length < 2) throw new HttpError(400, 'Enter the full name.')
  if (!opts.confirmed) await refuseLikelyDuplicate(q, full_name, input.birthdate, input.sex)
  const patient_no = await nextPatientNo(q)
  const person_id = uuid()
  const patient_id = opts.patientId ?? uuid()
  await q.insert(t.person).values({ person_id, full_name, birthdate: input.birthdate, sex: input.sex, contact: input.contact })
  await q.insert(t.patient).values({
    patient_id,
    person_id,
    patient_no,
    civil_status: input.civil_status,
    philhealth_pin: input.philhealth_pin || null,
    pwd_id: input.pwd_id || null,
    created_at: nowMs(),
    created_by: actor.staff_id,
  })
  await q.insert(t.patientRelationship).values({ relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: patient_id, relationship_type: type, listed_in_mdr: mdr })
  await audit(q, actor.staff_id, { action: 'create', table: 'patient', record: patient_id, summary: `Created record for ${full_name} (${type.toLowerCase()} of ${principalName})` })
  return patient_id
}

export async function linkRelative(q: Q, actor: Actor, principalIn: string, relatedIn: string, type: RelationshipType, mdr: boolean) {
  const [principalPatientId, relatedPatientId] = [await canonicalPatientId(q, principalIn), await canonicalPatientId(q, relatedIn)]
  if (principalPatientId === relatedPatientId) throw new HttpError(400, 'A person cannot be their own relative.')
  const [a, b] = await Promise.all([patientName(q, principalPatientId), patientName(q, relatedPatientId)])
  const [already] = await q
    .select({ type: t.patientRelationship.relationship_type })
    .from(t.patientRelationship)
    .where(
      or(
        and(eq(t.patientRelationship.patient_id, principalPatientId), eq(t.patientRelationship.related_patient_id, relatedPatientId)),
        and(eq(t.patientRelationship.patient_id, relatedPatientId), eq(t.patientRelationship.related_patient_id, principalPatientId)),
      ),
    )
  if (already) throw new HttpError(409, `${b} and ${a} are already linked (${already.type.toLowerCase()}).`)
  await q.insert(t.patientRelationship).values({ relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: relatedPatientId, relationship_type: type, listed_in_mdr: mdr })
  await audit(q, actor.staff_id, { action: 'link', table: 'patient_relationship', record: principalPatientId, summary: `Linked ${b} as ${type.toLowerCase()} of ${a}` })
}

export async function addFamilyHistory(q: Q, actor: Actor, patientIdIn: string, relative: string, condition: string, notes?: string) {
  const patientId = await canonicalPatientId(q, patientIdIn)
  await q.insert(t.familyHistory).values({ history_id: uuid(), patient_id: patientId, relative, condition, notes: notes ?? null })
  await audit(q, actor.staff_id, { action: 'create', table: 'family_history', record: patientId, summary: `Added family history (${relative}: ${condition}) for ${await patientName(q, patientId)}` })
}

export async function addAllergy(q: Q, actor: Actor, patientIdIn: string, substance: string, reaction: string, severity: 'Mild' | 'Moderate' | 'Severe') {
  const patientId = await canonicalPatientId(q, patientIdIn)
  await q.insert(t.allergy).values({ allergy_id: uuid(), patient_id: patientId, substance, reaction, severity })
  await audit(q, actor.staff_id, { action: 'create', table: 'allergy', record: patientId, summary: `Recorded allergy to ${substance} for ${await patientName(q, patientId)}` })
}

export type ScanExtra = { category?: 'Old folder' | 'Outside report'; source_clinic?: string; report_date?: string }

/** The scan is written to disk first; if anything after it fails, the file is removed again. */
export async function uploadScan(q: Q, actor: Actor, patientIdIn: string, file: string, kind: ScanKind, page_date: string, pageId?: string, extra?: ScanExtra) {
  const patientId = await canonicalPatientId(q, patientIdIn)
  const page_id = pageId ?? newScanId()
  const [dup] = await q.select({ id: t.scannedPage.page_id }).from(t.scannedPage).where(eq(t.scannedPage.page_id, page_id))
  if (dup) return page_id // retried upload (offline sync)
  const stored = await storeScan(file, page_id)
  try {
    await q.insert(t.scannedPage).values({ page_id, patient_id: patientId, file: stored, kind, page_date, uploaded_by: actor.staff_id, uploaded_at: nowMs(), category: extra?.category ?? null, source_clinic: extra?.source_clinic?.trim() || null, report_date: extra?.report_date || null })
    const from = extra?.category === 'Outside report' && extra.source_clinic?.trim() ? ` from ${extra.source_clinic.trim()}` : ''
    await audit(q, actor.staff_id, { action: 'upload', table: 'scanned_page', record: patientId, summary: `Attached a scanned ${kind.toLowerCase()} page${from} to ${await patientName(q, patientId)}'s record` })
  } catch (e) {
    await removeScan(stored)
    throw e
  }
  return page_id
}

export const isReturning = async (q: Q, patientId: string) => {
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.patient_id, patientId))
  if (pt?.legacy_folder_no) return true
  const [c] = await q.select({ id: t.consultation.consultation_id }).from(t.consultation).where(eq(t.consultation.patient_id, patientId)).limit(1)
  return !!c
}


