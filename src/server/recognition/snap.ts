import type { ParsedField } from './parse'

/*
  Layer 2: check what the reader produced against what the clinic already knows.

  OCR slips by a letter or a digit ("Marta" for "Maria", "1423" for "1983"). The clinic's registry knows the
  real name, birthdate, folder number and PhilHealth PIN, so a value that is a few characters away from a
  known one is corrected to it, and the field says so ("OCR read ..."), so the person verifying can see what
  changed. A value far from anything known is left exactly as read: it may be a genuine update from the form.
  Nothing is ever snapped to a record unless the person is identified first, by folder number or by name.
*/

export type KnownPatient = { patient_id: string; full_name: string; birthdate: string; sex: string; contact: string; civil_status: string; philhealth_pin: string; folder: string }
export type Vocabulary = { severities: string[]; relatives: string[]; conditions: string[]; substances: string[] }

export const BASE_VOCABULARY: Vocabulary = {
  severities: ['MILD', 'MODERATE', 'SEVERE'],
  relatives: ['MOTHER', 'FATHER', 'SISTER', 'BROTHER', 'GRANDMOTHER', 'GRANDFATHER', 'SON', 'DAUGHTER', 'AUNT', 'UNCLE', 'SPOUSE'],
  conditions: ['HYPERTENSION', 'DIABETES', 'ASTHMA', 'HEART DISEASE', 'STROKE', 'CANCER', 'TUBERCULOSIS', 'KIDNEY DISEASE'],
  substances: ['PENICILLIN', 'SHRIMP', 'IBUPROFEN', 'SULFA', 'EGG', 'ASPIRIN', 'DUST', 'PEANUT', 'AMOXICILLIN'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Number of single-character edits between two strings. */
export function distance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

const set = (f: ParsedField, value: string, note: string) => {
  if (f.value === value) return
  f.note = `OCR read "${f.value || 'nothing'}". ${note}`
  f.value = value
  f.source = 'registry'
  f.review = false
  f.confidence = Math.max(f.confidence, 90)
}

/** Replaces a word that is one or two letters off a known word, keeping the words that are fine. */
function snapWord(text: string, words: string[], maxEdits = 1): string {
  const t = text.trim()
  if (!t || words.some((w) => norm(w) === norm(t))) return t
  let best = ''
  let bestD = maxEdits + 1
  for (const w of words) {
    const d = distance(norm(t), norm(w))
    if (d < bestD) {
      best = w
      bestD = d
    }
  }
  return bestD <= maxEdits && norm(t).length >= 4 ? best : t
}

function find(fields: ParsedField[], key: string) {
  return fields.find((f) => f.key === key)
}

/** Which known patient this form is for, or null when it cannot be told for certain. */
export function identify(fields: ParsedField[], known: KnownPatient[]): KnownPatient | null {
  const folder = norm(find(fields, 'folder')?.value ?? '')
  if (folder.length >= 8) {
    const hit = known.filter((k) => k.folder && norm(k.folder) === folder)
    if (hit.length === 1) return hit[0]
  }
  const name = norm(find(fields, 'full_name')?.value ?? '')
  if (name.length < 6) return null
  const birth = find(fields, 'birthdate')?.value ?? ''
  const scored = known
    .map((k) => ({ k, d: distance(norm(k.full_name), name), b: birth ? distance(k.birthdate, birth) : 9 }))
    .filter((x) => x.d <= Math.max(2, Math.round(name.length * 0.12)))
    // a close name needs a matching (or one-digit-off) birthdate, or an exact name, to count as the same person
    .filter((x) => x.d === 0 || x.b <= 1)
    .sort((a, b) => a.d + a.b - (b.d + b.b))
  if (!scored.length) return null
  if (scored.length > 1 && scored[1].d + scored[1].b === scored[0].d + scored[0].b) return null
  return scored[0].k
}

export type SnapResult = { fields: ParsedField[]; patient: KnownPatient | null }

export function snapToKnown(input: ParsedField[], known: KnownPatient[], vocab: Vocabulary = BASE_VOCABULARY): SnapResult {
  const fields = input.map((f) => ({ ...f }))
  const patient = identify(fields, known)

  if (patient) {
    const close = (key: string, truth: string, maxEdits: number, note: string) => {
      const f = find(fields, key)
      if (!f || !truth) return
      const read = norm(f.value)
      // an empty or invalid reading is filled from the record; a near miss is corrected; a far one is left alone
      if (!read || f.review || distance(read, norm(truth)) <= maxEdits) set(f, truth, note)
    }
    const note = 'Corrected to the clinic record.'
    close('full_name', patient.full_name, 3, note)
    close('birthdate', patient.birthdate, 2, note)
    close('sex', patient.sex, 0, note)
    close('folder', patient.folder, 3, note)
    close('contact', patient.contact, 3, note)
    close('civil_status', patient.civil_status, 2, note)
    close('philhealth_pin', patient.philhealth_pin, 3, note)
  }

  // Words from fixed lists: severity, relatives, conditions, substances.
  for (const f of fields) {
    if (!f.value) continue
    const parts = f.value.split(/\s+[-~—–]\s+/)
    let next: string[] | null = null
    if (f.group === 'allergy') next = parts.map((p, i) => (i === 0 ? snapWord(p, vocab.substances, 2) : i === 2 ? snapWord(p, vocab.severities, 2) : p))
    if (f.group === 'family') next = parts.map((p, i) => (i === 0 ? snapWord(p, vocab.relatives, 2) : snapWord(p, vocab.conditions, 2)))
    if (next) {
      const value = next.join(' - ')
      if (norm(value) !== norm(f.value)) set(f, value, 'Matched to a known word.')
    }
  }
  return { fields, patient }
}
