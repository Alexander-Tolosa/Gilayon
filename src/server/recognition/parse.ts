import type { OcrLine } from './ocr'

/*
  Turns OCR lines of the "Old patient folder intake form" into named fields.

  Two readers work on the same text. The rule reader follows the form's own labels and is exact and
  instant. A small local language model (Ollama, e.g. Llama 3.2 3B) is an optional second opinion: it
  fills fields the rules could not read and normalises odd formats, but it never overrides a value the
  rules read cleanly, and it never invents clinical data. Everything stays on this PC.
*/

export type ParsedField = {
  key: string
  label: string
  group: 'identity' | 'allergy' | 'family' | 'medicines' | 'visit'
  /** The line as the OCR engine read it. */
  raw: string
  /** The value the system proposes. The nurse confirms or corrects it. */
  value: string
  /** 0 to 100. Line confidence from the OCR, lowered when the value fails its format check. */
  confidence: number
  /** True when the value fails its format check or needed the language model. */
  review: boolean
  /** 'llm' is no longer produced: it marks events saved before the text model was dropped (see docs/ACCURACY.md). */
  source: 'rules' | 'llm' | 'vision' | 'registry'
  /** Set when the value was changed after reading, and why, so the person verifying can see it. */
  note?: string
}

const clean = (s: string) => s.replace(/[_|~]+/g, ' ').replace(/\s+/g, ' ').trim()
const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, '')
const isEmpty = (s: string) => alnum(s).length < 3

const digitsFix = (s: string) => s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1')
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

const validDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) && d.getFullYear() > 1900 && d.getTime() <= Date.now()
}
/*
  Form v2 writes every number one character per box, and marks a choice with an X in a box. Separated
  characters are far easier to read than joined handwriting, so when the label's own rule fails, the
  digits on that line are collected and laid back into the field's shape.
*/
type Boxes = { label: RegExp; digits: number; format: (d: string) => string }
const BOXES: Record<string, Boxes> = {
  folder: { label: /F\w{1,3}LDER\s*N[o0]/i, digits: 8, format: (d) => `F-${d.slice(0, 4)}-${d.slice(4)}` },
  birthdate: { label: /BIRTHDATE/i, digits: 8, format: (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` },
  contact: { label: /CONTACT\s*N[o0]/i, digits: 11, format: (d) => `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` },
  philhealth_pin: { label: /PHILHEALTH\s*PIN/i, digits: 12, format: (d) => `${d.slice(0, 2)}-${d.slice(2, 11)}-${d.slice(11)}` },
}

/** Digits on a line after its label, with the slips a boxed digit invites ("l" for 1, "O" for 0) put right. */
function boxedDigits(line: string, label: RegExp): string {
  const after = line.replace(new RegExp(`^.*?${label.source}\\s*[:;.]?`, 'i'), '')
  return after
    .replace(/[OoDQ]/g, '0')
    .replace(/[lI|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Zz]/g, '2')
    .replace(/[AaÄ]/g, '4')
    .replace(/[%]/g, '8')
    .replace(/[^0-9]/g, '')
}

/** The option whose box holds a mark. The mark sits just before its own word. */
function tickedOption(line: string, options: string[]): string | null {
  for (const o of options) {
    // "X Female", "x| Female", "(x) Female": a mark, perhaps a leftover box edge, then the word
    if (new RegExp(String.raw`[x✓*+]\s*[|\])]?\s*${o}\b`, 'i').test(line)) return o
  }
  return null
}

const SEX = ['Female', 'Male']
const CIVIL = ['Single', 'Married', 'Widowed', 'Separated']

type Spec = { key: string; label: string; re: RegExp; alt?: RegExp; boxes?: Boxes; ticks?: string[]; fix?: (v: string) => string; ok: (v: string) => boolean }
const IDENTITY: Spec[] = [
  {
    key: 'folder',
    label: 'Folder no.',
    re: /F\w{1,3}LDER\s*N[o0]\.?\s*:?\s*([A-Z0-9][A-Z0-9~—–-]*)/i,
    fix: (v) => v.toUpperCase().replace(/[~—–]/g, '-').replace(/^F-?([\dOIL]{4})-?([\dOIL]{3,4})$/, (_m, a: string, b: string) => `F-${digitsFix(a)}-${digitsFix(b)}`),
    ok: (v) => /^F-\d{4}-\d{3,4}$/.test(v),
    boxes: BOXES.folder,
  },
  { key: 'full_name', label: 'Full name', re: /FULL\s*NAME\s*:?\s*(.+?)$/i, fix: (v) => titleCase(clean(v)), ok: (v) => /^[A-Za-z][A-Za-z .'-]{3,}$/.test(v) && v.includes(' ') },
  {
    key: 'birthdate',
    label: 'Birthdate',
    re: /BIRTHDATE[^:]*:\s*([0-9OIl]{4}\s*[-/.]\s*[0-9OIl]{2}\s*[-/.]\s*[0-9OIl]{2})/i,
    fix: (v) => digitsFix(v).replace(/\s+/g, '').replace(/[/.]/g, '-'),
    ok: validDate,
    boxes: BOXES.birthdate,
  },
  { key: 'sex', label: 'Sex', re: /SEX\s*[:;.]?\s*(FEMALE|MALE|F|M)\b/i, fix: (v) => (/^f/i.test(v) ? 'Female' : 'Male'), ok: (v) => SEX.includes(v), ticks: SEX },
  { key: 'civil_status', label: 'Civil status', re: /CIVIL\s*STATUS\s*:?\s*([A-Za-z]+)/i, fix: (v) => titleCase(v), ok: (v) => CIVIL.includes(v), ticks: CIVIL },
  {
    key: 'contact',
    label: 'Contact no.',
    re: /CONTACT\s*N[o0]\.?\s*:?\s*([0-9OIl +-]{7,})/i,
    fix: (v) => digitsFix(v).replace(/\s+/g, ' ').trim(),
    ok: (v) => /^(\+?63|0)\d[\d ]{8,12}$/.test(v),
    boxes: BOXES.contact,
  },
  {
    key: 'philhealth_pin',
    label: 'PhilHealth PIN',
    re: /PHILHEALTH\s*PIN\s*:?\s*([0-9OIl~—–-]{10,})/i,
    alt: /(\d{2}\s*[-~—–]\s*\d{9}\s*[-~—–]\s*\d)/,
    fix: (v) => digitsFix(v).replace(/[~—–\s]/g, (c) => (c === ' ' ? '' : '-')),
    ok: (v) => /^\d{2}-\d{9}-\d$/.test(v),
    boxes: BOXES.philhealth_pin,
  },
]

const SECTIONS = { allergy: /^ALLERGIES\b/i, family: /^FAMILY\s*HISTORY\b/i, medicines: /REGULAR\s*MEDICINES/i, visit: /^LAST\s*VISITS?\b/i } as const
const numbered = /^\s*[1-9lI]?\s*[.)]/
// The OCR often loses the full stop after a row number ("1 MOTHER") or reads it as a comma.
const stripNum = (s: string) => clean(s.replace(/^\s*[1-9lI,;]?\s*[.)]\s*/, '').replace(/^\s*[1-9lI,;]\s*[,.;]?\s+(?=\S)/, '').replace(/^[,.;]\s*/, ''))

export function parseWithRules(lines: OcrLine[]): ParsedField[] {
  const out: ParsedField[] = []
  const add = (f: Omit<ParsedField, 'review' | 'source'> & { ok: boolean }) => {
    const { ok, ...rest } = f
    out.push({ ...rest, confidence: ok ? f.confidence : Math.min(f.confidence, 35), review: !ok, source: 'rules' })
  }

  for (const spec of IDENTITY) {
    let best: { value: string; raw: string; confidence: number } | null = null
    for (const l of lines) {
      // A marked box beats the words beside it: on a tick row every choice is printed, only one is marked.
      if (spec.ticks && new RegExp(spec.key === 'sex' ? String.raw`\bSEX\b` : String.raw`CIVIL\s*STATUS`, 'i').test(l.text)) {
        const t = tickedOption(l.text, spec.ticks)
        if (t) {
          best = { value: t, raw: l.text, confidence: l.confidence }
          break
        }
      }
      // Boxed characters: the count has to come out exactly right, so a wrong guess is simply dropped.
      if (spec.boxes && spec.boxes.label.test(l.text)) {
        const d = boxedDigits(l.text, spec.boxes.label)
        if (d.length === spec.boxes.digits) {
          const value = spec.boxes.format(d)
          if (spec.ok(value)) {
            best = { value, raw: l.text, confidence: l.confidence }
            break
          }
        }
      }
      const m = spec.re.exec(l.text) ?? spec.alt?.exec(l.text)
      if (m) {
        const value = spec.fix ? spec.fix(m[1].trim()) : m[1].trim()
        if (!best || (!spec.ok(best.value) && spec.ok(value))) best = { value, raw: l.text, confidence: l.confidence }
        if (spec.ok(value)) break
      }
    }
    add({ key: spec.key, label: spec.label, group: 'identity', raw: best?.raw ?? '', value: best?.value ?? '', confidence: best?.confidence ?? 0, ok: best ? spec.ok(best.value) : false })
  }

  const at = (re: RegExp) => lines.findIndex((l) => re.test(l.text))
  const idx = { allergy: at(SECTIONS.allergy), family: at(SECTIONS.family), visit: at(SECTIONS.visit), medicines: at(SECTIONS.medicines) }
  const list = (name: 'allergy' | 'family' | 'visit', label: string, end: number, ok: (v: string) => boolean) => {
    const start = idx[name]
    if (start < 0) return
    let n = 0
    for (const l of lines.slice(start + 1, end < 0 ? undefined : end)) {
      if (!numbered.test(l.text) && !/ [-~—–] /.test(l.text)) continue
      const v = stripNum(l.text)
      if (isEmpty(v) || SECTIONS.medicines.test(v) || /^copied from/i.test(v)) continue
      n++
      add({ key: `${name}_${n}`, label: `${label} ${n}`, group: name, raw: l.text, value: v, confidence: l.confidence, ok: ok(v) })
    }
  }
  const after = (i: number) =>
    [idx.family, idx.medicines, idx.visit]
      .filter((x) => x > i)
      .sort((a, b) => a - b)[0] ?? -1
  list('allergy', 'Allergy', after(idx.allergy), (v) => v.split(/\s+-\s+/).length >= 2)
  list('family', 'Family history', after(idx.family), (v) => v.split(/\s+-\s+/).length >= 2)
  list('visit', 'Visit', -1, (v) => /^\d{4}-\d{2}-\d{2}\s+-\s+\S/.test(v))

  // Regular medicines: the label line and the wrapped text before or after it, up to the visits heading.
  if (idx.medicines >= 0) {
    const stop = idx.visit > idx.medicines ? idx.visit : lines.length
    const from = Math.max(idx.family >= 0 ? idx.family + 1 : 0, idx.medicines - 1)
    const parts: OcrLine[] = []
    for (let i = from; i < stop; i++) {
      const l = lines[i]
      if (SECTIONS.family.test(l.text) || numbered.test(l.text) || / [-~—–] /.test(l.text)) continue
      const t = clean(l.text.replace(SECTIONS.medicines, '').replace(/^\s*:\s*/, ''))
      if (!isEmpty(t)) parts.push({ text: t, confidence: l.confidence })
    }
    if (parts.length) {
      add({
        key: 'medicines',
        label: 'Regular medicines',
        group: 'medicines',
        raw: parts.map((p) => p.text).join(' / '),
        value: parts.map((p) => p.text).join(' '),
        confidence: Math.min(...parts.map((p) => p.confidence)),
        ok: true,
      })
    }
  }
  return out
}

/**
 * Reads the page both ways and keeps, field by field, the value that passes its format check, or else the
 * one the OCR was more sure of. A field only one reading found is kept.
 */
export function parseReading(r: { lines: OcrLine[]; alt: OcrLine[] }): ParsedField[] {
  const a = parseWithRules(r.lines)
  const b = parseWithRules(r.alt)
  const byKey = new Map(b.map((f) => [f.key, f]))
  const out: ParsedField[] = []
  const seen = new Set<string>()
  for (const f of a) {
    seen.add(f.key)
    const g = byKey.get(f.key)
    if (!g || !g.value) out.push(f)
    else if (!f.value) out.push(g)
    else if (f.review !== g.review) out.push(f.review ? g : f)
    else out.push(g.confidence > f.confidence + 5 ? g : f)
  }
  for (const g of b) if (!seen.has(g.key) && g.value) out.push(g)
  return out
}

/* ---------------------------------------------------------------- the local image reader's settings */

const base = () => (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
/** Where Ollama listens; the image reader (vision.ts) talks to it. */
export const ollamaUrl = base

const schema = {
  type: 'object',
  properties: {
    folder: { type: 'string' },
    full_name: { type: 'string' },
    birthdate: { type: 'string' },
    sex: { type: 'string' },
    civil_status: { type: 'string' },
    contact: { type: 'string' },
    philhealth_pin: { type: 'string' },
    allergies: { type: 'array', items: { type: 'string' } },
    family_history: { type: 'array', items: { type: 'string' } },
    medicines: { type: 'string' },
    visits: { type: 'array', items: { type: 'string' } },
    /** Lines the form's own fields have no room for. Shown to the person scanning, never filed automatically. */
    other_text: { type: 'array', items: { type: 'string' } },
  },
  required: ['folder', 'full_name', 'birthdate', 'sex', 'civil_status', 'contact', 'philhealth_pin', 'allergies', 'family_history', 'medicines', 'visits'],
}

/** The fields the image reader is asked for, as JSON. */
export const formSchema = schema

/* ---------------------------------------------------------------- optional image reader (vision model) */

/** Rule values the OCR was this sure of, and that pass their format check, are not replaced by the image reader. */
const TRUSTED_CONFIDENCE = 85
const VISION_CONFIDENCE = 70
/** Any CJK or Hangul character is a slip: the form is English and Filipino only. */
const FOREIGN = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/
/**
 * The prompt tells the model the shape of each line ("substance - reaction - severity"). On a page with no
 * such section the model sometimes returns that example instead of an empty list, so it is dropped: it is
 * the prompt talking back, not anything written on the paper.
 */
const PLACEHOLDER = /^(substance\s*-\s*reaction(\s*-\s*severity)?|relative\s*-\s*condition|date\s*-\s*complaint|full\s*name|folder\s*no\.?|civil\s*status|contact\s*no\.?|philhealth\s*pin|birthdate|regular\s*medicines|last\s*visits|allergies|family\s*history)$/i

/** Same dash and spacing habits as the rule reader, so values compare and display alike. */
const tidy = (v: string) => clean(v).replace(/\s+[\u2013\u2014~]\s+/g, ' - ')

/**
 * Folds in what a local vision model read straight from the picture. It reads handwriting far better than
 * the OCR does, and it can also be wrong, so it never silently wins: where it disagrees with a value the
 * rules read cleanly, the rule value stays and is flagged; where the rules were unsure or found nothing, the
 * image reader's value is proposed, always marked for checking, with what the rules saw in the note.
 * A value that fails its format check, or contains characters that are not on the form, is ignored.
 */
/**
 * The printed headings of the intake form. Tesseract reads printed text well even where the handwriting
 * defeats it, so a page with none of them is not this form.
 */
const FORM_HEADINGS = /ALLERGIES|FAMILY HISTORY|LAST VISITS|REGULAR MEDICINES|FOLDER NO/i

/**
 * Drops what the image reader offered for sections the page does not have. Asked for allergies on a form
 * with no allergy section, the model infers rather than reads: on another clinic's animal-bite record it
 * turned "Biting Animal: CAT" into an allergy to cats. Identity values stay, flagged for checking, and the
 * lines themselves are still shown to the person scanning.
 */
export function withoutInferredSections(fields: ParsedField[], ocrText: string): ParsedField[] {
  if (FORM_HEADINGS.test(ocrText)) return fields
  const SECTIONS = ['allergy', 'family', 'visit', 'medicines']
  return fields.filter((f) => !(f.source === 'vision' && SECTIONS.includes(f.group)))
}

export function mergeVision(fields: ParsedField[], data: Record<string, unknown>, model: string): ParsedField[] {
  const str = (v: unknown) => (typeof v === 'string' ? tidy(v) : '')
  const same = (a: string, b: string) => alnum(a).toLowerCase() === alnum(b).toLowerCase()
  // When the rules cannot find the "LAST VISITS" heading they file the visit lines under family history or
  // allergies. A line the image reader saw as a visit does not belong in those lists, so the misfiled copy goes.
  const visits = (Array.isArray(data.visits) ? (data.visits as unknown[]) : []).map(str).filter((v) => !isEmpty(v))
  const out = fields.filter((f) => !((f.group === 'family' || f.group === 'allergy') && visits.some((v) => same(v, f.value)))).map((f) => ({ ...f }))
  const propose = (key: string, label: string, group: ParsedField['group'], value: string, ok: (v: string) => boolean) => {
    if (!value || isEmpty(value) || PLACEHOLDER.test(value.trim())) return
    const f = out.find((x) => x.key === key)
    if (f?.value && same(f.value, value)) return
    if (FOREIGN.test(value)) {
      if (f?.value) f.note = `The image reader (${model}) returned characters that are not on the form, so it was ignored.`
      return
    }
    // Medicines are free text with no format check, so the rules cannot vouch for them however sure the OCR was
    // ("5MG" read as "sMG" scores high): there the image reader's value is proposed and flagged instead.
    if (f?.value && !f.review && f.confidence >= TRUSTED_CONFIDENCE && group !== 'medicines') {
      f.review = true
      f.note = `The image reader (${model}) read "${value}". Check which one matches the paper.`
      return
    }
    if (!ok(value)) return
    const next: ParsedField = { key, label, group, raw: f?.raw ?? '', value, confidence: VISION_CONFIDENCE, review: true, source: 'vision', ...(f?.value ? { note: `The rule reader read "${f.value}".` } : {}) }
    if (f) Object.assign(f, next)
    else out.push(next)
  }
  for (const spec of IDENTITY) {
    const raw = str(data[spec.key])
    if (raw) propose(spec.key, spec.label, 'identity', spec.fix ? spec.fix(raw) : raw, spec.ok)
  }
  // "substance - reaction" and "relative - condition" lines; a line that starts with a date is a visit that landed in the wrong list.
  const dashed = (v: string) => v.split(/\s+-\s+/).length >= 2 && !/^\d{4}-\d{2}-\d{2}/.test(v)
  const lists: ['allergy' | 'family' | 'visit', string, string, (v: string) => boolean][] = [
    ['allergy', 'Allergy', 'allergies', dashed],
    ['family', 'Family history', 'family_history', dashed],
    ['visit', 'Visit', 'visits', (v) => /^\d{4}-\d{2}-\d{2}\s+-\s+\S/.test(v)],
  ]
  for (const [name, label, dataKey, ok] of lists) {
    const items = Array.isArray(data[dataKey]) ? (data[dataKey] as unknown[]).map(str).filter((x) => !isEmpty(x)) : []
    items.forEach((v, i) => propose(`${name}_${i + 1}`, `${label} ${i + 1}`, name, v, ok))
  }
  // "NONE" is not added to a form that had no medicines field, but it does correct a garbled "NC NE".
  const med = str(data.medicines)
  if (med && (!/^none$/i.test(med) || out.some((f) => f.key === 'medicines' && f.value))) propose('medicines', 'Regular medicines', 'medicines', med, () => true)
  return out
}
