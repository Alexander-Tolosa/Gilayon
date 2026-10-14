import { eq, inArray, isNull, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { matchScore } from '../../features/clinic/lib/helpers'
import { normalizeRow, type HrImportResult, type HrRow, type RawHrRow } from '../../features/clinic/lib/hrlist'
import { audit, HttpError, nowMs, uuid, type Actor } from '../core'
import type { Q } from '../db'

const MAX_ROWS = 5000

type Plan = {
  result: Omit<HrImportResult, 'applied'>
  create: HrRow[]
  update: { employee_id: string; person_id: string; patch: { office?: string; position?: string; full_name?: string } }[]
  /** Existing patient records to mark so the front desk sees the disagreement with the HR list. */
  flag: { person_id: string; note: string }[]
}

/** Works out what an import would do. Reads only; the same plan drives both the preview and the real import. */
async function plan(q: Q, input: RawHrRow[]): Promise<Plan> {
  if (input.length > MAX_ROWS) throw new HttpError(413, `A list can have at most ${MAX_ROWS} rows. Split the file.`)
  const result: Plan['result'] = { created: 0, updated: 0, unchanged: 0, conflicts: [], rejected: [], possibleDuplicates: [], notInList: 0, total: input.length }
  const out: Plan = { result, create: [], update: [], flag: [] }

  const seen = new Set<string>()
  const valid: { line: number | null; row: HrRow }[] = []
  input.forEach((raw, i) => {
    const line = typeof raw.line === 'number' ? raw.line : i + 2
    const r = normalizeRow(raw)
    if (!r.ok) return void result.rejected.push({ line, employee_no: String(raw.employee_no ?? '').trim() || undefined, reason: r.reason })
    if (seen.has(r.row.employee_no)) return void result.rejected.push({ line, employee_no: r.row.employee_no, reason: 'The same employee ID appears earlier in this file. Only the first is used.' })
    seen.add(r.row.employee_no)
    valid.push({ line, row: r.row })
  })

  const nos = valid.map((v) => v.row.employee_no)
  const existing = nos.length
    ? await q
        .select({ employee_id: t.employee.employee_id, person_id: t.employee.person_id, employee_no: t.employee.employee_no, office: t.employee.office, position: t.employee.position, full_name: t.person.full_name, birthdate: t.person.birthdate, sex: t.person.sex })
        .from(t.employee)
        .innerJoin(t.person, eq(t.person.person_id, t.employee.person_id))
        .where(inArray(t.employee.employee_no, nos))
    : []
  const byNo = new Map(existing.map((e) => [e.employee_no, e]))

  for (const { row } of valid) {
    const e = byNo.get(row.employee_no)
    if (!e) {
      out.create.push(row)
      continue
    }
    // Identity fields are never changed by an import: a different birthdate is a question for HR, not an edit.
    let conflicted = false
    for (const f of ['birthdate', 'sex'] as const) {
      if (row[f] !== e[f]) {
        conflicted = true
        result.conflicts.push({ employee_no: row.employee_no, name: e.full_name, field: f, listed: row[f], stored: e[f] })
        out.flag.push({ person_id: e.person_id, note: `HR list import: ${f} on the list (${row[f]}) differs from this record (${e[f]})` })
      }
    }
    const patch: Plan['update'][number]['patch'] = {}
    if (row.office !== e.office && row.office !== 'Not stated') patch.office = row.office
    if (row.position !== e.position && row.position !== 'Not stated') patch.position = row.position
    if (row.full_name !== e.full_name && !conflicted) patch.full_name = row.full_name
    if (Object.keys(patch).length) out.update.push({ employee_id: e.employee_id, person_id: e.person_id, patch })
    else if (!conflicted) result.unchanged++
  }
  result.updated = out.update.length
  result.created = out.create.length

  // New employees that look like someone already registered without an employee number.
  if (out.create.length) {
    const births = [...new Set(out.create.map((r) => r.birthdate))]
    const people = await q
      .select({ person_id: t.person.person_id, full_name: t.person.full_name, birthdate: t.person.birthdate, sex: t.person.sex, patient_no: t.patient.patient_no, emp: t.employee.employee_id })
      .from(t.person)
      .innerJoin(t.patient, eq(t.patient.person_id, t.person.person_id))
      .leftJoin(t.employee, eq(t.employee.person_id, t.person.person_id))
      .where(inArray(t.person.birthdate, births))
    for (const row of out.create) {
      const hit = people.find((p) => !p.emp && p.birthdate === row.birthdate && p.sex === row.sex && matchScore(row.full_name, p.full_name, []) >= 0.75)
      if (hit) result.possibleDuplicates.push({ employee_no: row.employee_no, name: row.full_name, existing_patient_no: hit.patient_no })
    }
  }

  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(t.employee)
  result.notInList = Math.max(0, n - existing.length)
  return out
}

export async function previewHrImport(q: Q, rows: RawHrRow[]): Promise<HrImportResult> {
  return { ...(await plan(q, rows)).result, applied: false }
}

/** Applies the same plan. Re-running a list changes nothing the second time. */
export async function applyHrImport(q: Q, actor: Actor, rows: RawHrRow[], source: string): Promise<HrImportResult> {
  const p = await plan(q, rows)
  const now = nowMs()

  if (p.create.length) {
    const [{ max }] = await q.select({ max: sql<number>`coalesce(max(substring(${t.patient.patient_no} from 5)::int), 0)` }).from(t.patient)
    let n = max
    const people = p.create.map((r) => ({ person_id: uuid(), r }))
    for (let i = 0; i < people.length; i += 500) {
      const part = people.slice(i, i + 500)
      await q.insert(t.person).values(part.map(({ person_id, r }) => ({ person_id, full_name: r.full_name, birthdate: r.birthdate, sex: r.sex, contact: r.contact ?? '' })))
      await q.insert(t.employee).values(part.map(({ person_id, r }) => ({ employee_id: uuid(), person_id, employee_no: r.employee_no, office: r.office, position: r.position })))
      await q.insert(t.patient).values(part.map(({ person_id }) => ({ patient_id: uuid(), person_id, patient_no: `HMO-${String(++n).padStart(5, '0')}`, civil_status: 'Single' as const, created_at: now, created_by: 'import' })))
    }
    await q.insert(t.counter).values({ key: 'patient', value: n }).onConflictDoUpdate({ target: t.counter.key, set: { value: sql`GREATEST(${t.counter.value}, ${n})` } })
  }

  for (const u of p.update) {
    const { full_name, ...emp } = u.patch
    if (Object.keys(emp).length) await q.update(t.employee).set(emp).where(eq(t.employee.employee_id, u.employee_id))
    if (full_name) await q.update(t.person).set({ full_name }).where(eq(t.person.person_id, u.person_id))
  }

  // A flag is only added where there is none yet, so an HR note already on a record is not overwritten.
  for (const f of p.flag) {
    await q.update(t.patient).set({ hr_flag: f.note }).where(sql`${t.patient.person_id} = ${f.person_id} and ${isNull(t.patient.hr_flag)}`)
  }

  const r = p.result
  const value = { at: now, count: r.total - r.rejected.length, source }
  await q.insert(t.meta).values({ key: 'last_import', value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
  await audit(q, actor.staff_id, {
    action: 'import',
    table: 'employee',
    record: 'hr-list',
    summary: `Imported HR employee list (${source}): ${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged`,
    detail: `${r.conflicts.length} with a different birthdate or sex (not applied), ${r.rejected.length} rows rejected, ${r.possibleDuplicates.length} possible duplicates of existing records.`,
  })
  return { ...r, applied: true }
}
