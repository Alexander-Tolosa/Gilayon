import { eq, inArray, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import type { CivilStatus, RelationshipType, ScanKind, Sex } from '../../features/clinic/types'
import { audit, HttpError, nextCounter, nowMs, uuid, type Actor } from '../core'
import type { Q } from '../db'

export const patientName = async (q: Q, patientId: string) => {
  const [r] = await q
    .select({ n: t.person.full_name })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
    .where(eq(t.patient.patient_id, patientId))
  return r?.n ?? 'patient'
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

/** Checks what the front desk typed against the HR list. The result, pass or fail, goes to the audit log. */
export async function verifyIdentity(q: Q, actor: Actor, personId: string, entered: { full_name: string; birthdate: string; employee_no?: string; principal_no?: string }) {
  const [p] = await q.select().from(t.person).where(eq(t.person.person_id, personId))
  if (!p) throw new HttpError(404, 'Person not found')
  const [emp] = await q.select().from(t.employee).where(eq(t.employee.person_id, personId))
  const mismatches: string[] = []
  if (normName(entered.full_name) !== normName(p.full_name)) mismatches.push('Full name')
  if (entered.birthdate !== p.birthdate) mismatches.push('Birthdate')
  if (emp && (entered.employee_no ?? '').trim().toUpperCase() !== emp.employee_no) mismatches.push('Employee ID')
  if (!emp && entered.principal_no !== undefined) {
    const [pt] = await q.select().from(t.patient).where(eq(t.patient.person_id, personId))
    const [rel] = pt ? await q.select().from(t.patientRelationship).where(eq(t.patientRelationship.related_patient_id, pt.patient_id)) : []
    const [principalEmp] = rel
      ? await q
          .select({ no: t.employee.employee_no })
          .from(t.patient)
          .innerJoin(t.employee, eq(t.employee.person_id, t.patient.person_id))
          .where(eq(t.patient.patient_id, rel.patient_id))
      : []
    if (!principalEmp || entered.principal_no.trim().toUpperCase() !== principalEmp.no) mismatches.push('Employee ID of the principal')
  }
  const ok = mismatches.length === 0
  await audit(q, actor.staff_id, {
    action: ok ? 'verify' : 'flag',
    table: 'person',
    record: personId,
    summary: ok ? `Verified identity of ${p.full_name} against the HR list` : `Verification failed for ${p.full_name}: ${mismatches.join(', ')} did not match`,
  })
  return { ok, mismatches }
}

export async function flagForHR(q: Q, actor: Actor, personId: string, note: string) {
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.person_id, personId))
  if (pt) await q.update(t.patient).set({ hr_flag: note }).where(eq(t.patient.patient_id, pt.patient_id))
  await audit(q, actor.staff_id, { action: 'flag', table: 'person', record: personId, summary: `Flagged for HR: ${note}` })
}

type Patch = Partial<{ full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; pwd_id: string; philhealth_pin: string; legacy_folder_no: string; hr_flag: string }>

/** Edits keep both versions in the audit log; the later edit wins. */
export async function completeRecord(q: Q, actor: Actor, patientId: string, patch: Patch, reason?: string) {
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

export async function createDependent(
  q: Q,
  actor: Actor,
  principalPatientId: string,
  input: { full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; philhealth_pin?: string; pwd_id?: string },
  type: RelationshipType,
  mdr: boolean,
) {
  const principalName = await patientName(q, principalPatientId)
  const [{ max }] = await q.select({ max: sql<number>`coalesce(max(substring(${t.patient.patient_no} from 5)::int), 0)` }).from(t.patient)
  const n = await nextCounter(q, 'patient', max)
  const person_id = uuid()
  const patient_id = uuid()
  await q.insert(t.person).values({ person_id, full_name: input.full_name.trim(), birthdate: input.birthdate, sex: input.sex, contact: input.contact })
  await q.insert(t.patient).values({
    patient_id,
    person_id,
    patient_no: `HMO-${String(n).padStart(5, '0')}`,
    civil_status: input.civil_status,
    philhealth_pin: input.philhealth_pin || null,
    pwd_id: input.pwd_id || null,
    created_at: nowMs(),
    created_by: actor.staff_id,
  })
  await q.insert(t.patientRelationship).values({ relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: patient_id, relationship_type: type, listed_in_mdr: mdr })
  await audit(q, actor.staff_id, { action: 'create', table: 'patient', record: patient_id, summary: `Created record for ${input.full_name.trim()} (${type.toLowerCase()} of ${principalName})` })
  return patient_id
}

export async function linkRelative(q: Q, actor: Actor, principalPatientId: string, relatedPatientId: string, type: RelationshipType, mdr: boolean) {
  const [a, b] = await Promise.all([patientName(q, principalPatientId), patientName(q, relatedPatientId)])
  await q.insert(t.patientRelationship).values({ relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: relatedPatientId, relationship_type: type, listed_in_mdr: mdr })
  await audit(q, actor.staff_id, { action: 'link', table: 'patient_relationship', record: principalPatientId, summary: `Linked ${b} as ${type.toLowerCase()} of ${a}` })
}

export async function addFamilyHistory(q: Q, actor: Actor, patientId: string, relative: string, condition: string, notes?: string) {
  await q.insert(t.familyHistory).values({ history_id: uuid(), patient_id: patientId, relative, condition, notes: notes ?? null })
  await audit(q, actor.staff_id, { action: 'create', table: 'family_history', record: patientId, summary: `Added family history (${relative}: ${condition}) for ${await patientName(q, patientId)}` })
}

export async function addAllergy(q: Q, actor: Actor, patientId: string, substance: string, reaction: string, severity: 'Mild' | 'Moderate' | 'Severe') {
  await q.insert(t.allergy).values({ allergy_id: uuid(), patient_id: patientId, substance, reaction, severity })
  await audit(q, actor.staff_id, { action: 'create', table: 'allergy', record: patientId, summary: `Recorded allergy to ${substance} for ${await patientName(q, patientId)}` })
}

const MAX_SCAN_BYTES = 2_500_000

export async function uploadScan(q: Q, actor: Actor, patientId: string, file: string, kind: ScanKind, page_date: string) {
  if (!file.startsWith('data:image/') || file.length > MAX_SCAN_BYTES) throw new HttpError(413, 'Scan must be an image under 2.5 MB.')
  await q.insert(t.scannedPage).values({ page_id: uuid(), patient_id: patientId, file, kind, page_date, uploaded_by: actor.staff_id, uploaded_at: nowMs() })
  await audit(q, actor.staff_id, { action: 'upload', table: 'scanned_page', record: patientId, summary: `Attached a scanned ${kind.toLowerCase()} page to ${await patientName(q, patientId)}'s record` })
}

type HrRow = { employee_no: string; full_name: string; birthdate: string; sex: Sex; office: string; position: string; contact?: string }

/** Importing the HR list creates employee and patient records; re-importing updates, never duplicates. */
export async function importEmployees(q: Q, actor: Actor, rows: HrRow[], source: string) {
  let created = 0
  let updated = 0
  let unchanged = 0
  const existing = await q.select().from(t.employee).where(inArray(t.employee.employee_no, rows.map((r) => r.employee_no)))
  const byNo = new Map(existing.map((e) => [e.employee_no, e]))
  const [{ max }] = await q.select({ max: sql<number>`coalesce(max(substring(${t.patient.patient_no} from 5)::int), 0)` }).from(t.patient)
  let counter = max
  for (const r of rows) {
    const emp = byNo.get(r.employee_no)
    if (emp) {
      const [per] = await q.select().from(t.person).where(eq(t.person.person_id, emp.person_id))
      if (emp.office !== r.office || emp.position !== r.position || per.full_name !== r.full_name) {
        updated++
        await q.update(t.employee).set({ office: r.office, position: r.position }).where(eq(t.employee.employee_id, emp.employee_id))
        await q.update(t.person).set({ full_name: r.full_name }).where(eq(t.person.person_id, emp.person_id))
      } else unchanged++
    } else {
      created++
      const person_id = uuid()
      await q.insert(t.person).values({ person_id, full_name: r.full_name, birthdate: r.birthdate, sex: r.sex, contact: r.contact ?? '' })
      await q.insert(t.employee).values({ employee_id: uuid(), person_id, employee_no: r.employee_no, office: r.office, position: r.position })
      counter++
      await q.insert(t.patient).values({ patient_id: uuid(), person_id, patient_no: `HMO-${String(counter).padStart(5, '0')}`, civil_status: 'Single', created_at: nowMs(), created_by: 'import' })
    }
  }
  if (counter > max) await q.insert(t.counter).values({ key: 'patient', value: counter }).onConflictDoUpdate({ target: t.counter.key, set: { value: sql`GREATEST(${t.counter.value}, ${counter})` } })
  await q.insert(t.meta).values({ key: 'last_import', value: { at: nowMs(), count: rows.length, source } }).onConflictDoUpdate({ target: t.meta.key, set: { value: { at: nowMs(), count: rows.length, source } } })
  await audit(q, actor.staff_id, { action: 'import', table: 'employee', record: 'hr-list', summary: `Imported HR employee list (${source}): ${created} new, ${updated} updated, ${unchanged} unchanged` })
  return { created, updated, unchanged }
}

export const isReturning = async (q: Q, patientId: string) => {
  const [pt] = await q.select().from(t.patient).where(eq(t.patient.patient_id, patientId))
  if (pt?.legacy_folder_no) return true
  const [c] = await q.select({ id: t.consultation.consultation_id }).from(t.consultation).where(eq(t.consultation.patient_id, patientId)).limit(1)
  return !!c
}


