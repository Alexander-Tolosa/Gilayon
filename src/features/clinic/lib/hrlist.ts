import type { Sex } from '../types'

/*
  The HR employee list: what a row must look like, shared by the import screen (to show problems
  before anything is sent) and the server (which never trusts the client and checks again).
*/

export type HrRow = { employee_no: string; full_name: string; birthdate: string; sex: Sex; office: string; position: string; contact?: string }

/** One row as typed in a spreadsheet: every value is text, and `line` is its line in the file. */
export type RawHrRow = { line?: number; employee_no?: unknown; full_name?: unknown; birthdate?: unknown; sex?: unknown; office?: unknown; position?: unknown; contact?: unknown }

export type HrField = 'employee_no' | 'full_name' | 'birthdate' | 'sex' | 'office' | 'position' | 'contact'

export const HR_FIELDS: { key: HrField; label: string; required: boolean; hint: string; synonyms: string[] }[] = [
  { key: 'employee_no', label: 'Employee ID', required: true, hint: 'The number on the ID, for example IPG-2004-0318', synonyms: ['employee_no', 'employee no', 'employee number', 'employee id', 'emp no', 'emp id', 'id no', 'id number', 'idno', 'empno'] },
  { key: 'full_name', label: 'Full name', required: true, hint: 'Given name and surname', synonyms: ['full_name', 'full name', 'fullname', 'name', 'employee name', 'name of employee'] },
  { key: 'birthdate', label: 'Birthdate', required: true, hint: 'Used to check identity at check-in', synonyms: ['birthdate', 'birth date', 'date of birth', 'dob', 'birthday', 'bdate'] },
  { key: 'sex', label: 'Sex', required: true, hint: 'F or M (Female / Male)', synonyms: ['sex', 'gender'] },
  { key: 'office', label: 'Office', required: false, hint: 'Department or office', synonyms: ['office', 'department', 'dept', 'unit', 'division', 'assignment'] },
  { key: 'position', label: 'Position', required: false, hint: 'Job title', synonyms: ['position', 'designation', 'job title', 'title', 'plantilla'] },
  { key: 'contact', label: 'Contact number', required: false, hint: 'Optional', synonyms: ['contact', 'contact no', 'contact number', 'mobile', 'phone', 'cellphone', 'cp no'] },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Matches spreadsheet headers to fields by name. Returns the column index per field, when found. */
export function autoMap(headers: string[]): Partial<Record<HrField, number>> {
  const out: Partial<Record<HrField, number>> = {}
  const used = new Set<number>()
  for (const f of HR_FIELDS) {
    const syn = new Set([f.key, ...f.synonyms].map(norm))
    const idx = headers.findIndex((h, i) => !used.has(i) && syn.has(norm(h)))
    if (idx >= 0) {
      out[f.key] = idx
      used.add(idx)
    }
  }
  return out
}

export type DateOrder = 'iso' | 'mdy' | 'dmy'

/** Guesses how dates are written from the values themselves; null when they cannot tell (every day and month <= 12). */
export function detectDateOrder(values: string[]): DateOrder | null {
  let iso = 0
  let mdyOnly = 0
  let dmyOnly = 0
  for (const v of values) {
    const t = v.trim()
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) iso++
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t)
    if (!m) continue
    if (Number(m[1]) > 12) dmyOnly++
    else if (Number(m[2]) > 12) mdyOnly++
  }
  if (iso && !mdyOnly && !dmyOnly) return 'iso'
  if (dmyOnly && !mdyOnly) return 'dmy'
  if (mdyOnly && !dmyOnly) return 'mdy'
  return null
}

/** A date as YYYY-MM-DD, or null when it is not a real calendar date. */
export function toIsoDate(value: unknown, order: DateOrder = 'iso'): string | null {
  const t = String(value ?? '').trim()
  let y: number, m: number, d: number
  let x: RegExpExecArray | null
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])]
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) {
    const [a, b] = [Number(x[1]), Number(x[2])]
    ;[m, d] = order === 'dmy' ? [b, a] : [a, b]
    y = Number(x[3])
  } else return null
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function toSex(value: unknown): Sex | null {
  const t = String(value ?? '').trim().toLowerCase()
  if (['f', 'female', 'babae', 'woman'].includes(t)) return 'Female'
  if (['m', 'male', 'lalaki', 'man'].includes(t)) return 'Male'
  return null
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

export type RowResult = { ok: true; row: HrRow } | { ok: false; reason: string }

/** Validates one row. `today` is injectable for tests. */
export function normalizeRow(raw: RawHrRow, today = new Date()): RowResult {
  const employee_no = clean(raw.employee_no).toUpperCase()
  if (!employee_no) return { ok: false, reason: 'Employee ID is empty.' }
  if (!/^[A-Z0-9][A-Z0-9 ./_-]{1,39}$/.test(employee_no)) return { ok: false, reason: `Employee ID "${employee_no}" has characters or a length that is not allowed.` }
  const full_name = clean(raw.full_name)
  if (full_name.length < 2) return { ok: false, reason: 'Name is empty.' }
  if (full_name.length > 120) return { ok: false, reason: 'Name is too long.' }
  const birthdate = toIsoDate(raw.birthdate, 'iso')
  if (!birthdate) return { ok: false, reason: `Birthdate "${clean(raw.birthdate)}" is not a valid date.` }
  const age = today.getFullYear() - Number(birthdate.slice(0, 4))
  if (birthdate > `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) return { ok: false, reason: 'Birthdate is in the future.' }
  if (age < 15 || age > 100) return { ok: false, reason: `Birthdate gives an age of ${age}, which is unlikely for an employee.` }
  const sex = toSex(raw.sex)
  if (!sex) return { ok: false, reason: `Sex "${clean(raw.sex)}" is not F or M.` }
  const contact = clean(raw.contact)
  return {
    ok: true,
    row: { employee_no, full_name, birthdate, sex, office: clean(raw.office) || 'Not stated', position: clean(raw.position) || 'Not stated', ...(contact ? { contact } : {}) },
  }
}

export type HrImportResult = {
  applied: boolean
  created: number
  updated: number
  unchanged: number
  /** Listed on the HR list with a different birthdate or sex than the stored record: not applied. */
  conflicts: { employee_no: string; name: string; field: 'birthdate' | 'sex'; listed: string; stored: string }[]
  rejected: { line: number | null; employee_no?: string; reason: string }[]
  /** New employees who look like an existing record that has no employee number. They will show in Possible duplicates. */
  possibleDuplicates: { employee_no: string; name: string; existing_patient_no: string }[]
  /** Employees already in the system that this list does not mention. Nothing happens to them. */
  notInList: number
  total: number
}
