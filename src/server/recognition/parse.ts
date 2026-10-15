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
  source: 'rules' | 'llm'
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
const SEX = ['Female', 'Male']
const CIVIL = ['Single', 'Married', 'Widowed', 'Separated']

type Spec = { key: string; label: string; re: RegExp; alt?: RegExp; fix?: (v: string) => string; ok: (v: string) => boolean }
const IDENTITY: Spec[] = [
  {
    key: 'folder',
    label: 'Folder no.',
    re: /F\w{1,3}LDER\s*N[o0]\.?\s*:?\s*([A-Z0-9][A-Z0-9~—–-]*)/i,
    fix: (v) => v.toUpperCase().replace(/[~—–]/g, '-').replace(/^F-?([\dOIL]{4})-?([\dOIL]{3,4})$/, (_m, a: string, b: string) => `F-${digitsFix(a)}-${digitsFix(b)}`),
    ok: (v) => /^F-\d{4}-\d{3,4}$/.test(v),
  },
  { key: 'full_name', label: 'Full name', re: /FULL\s*NAME\s*:?\s*(.+?)$/i, fix: (v) => titleCase(clean(v)), ok: (v) => /^[A-Za-z][A-Za-z .'-]{3,}$/.test(v) && v.includes(' ') },
  {
    key: 'birthdate',
    label: 'Birthdate',
    re: /BIRTHDATE[^:]*:\s*([0-9OIl]{4}\s*[-/.]\s*[0-9OIl]{2}\s*[-/.]\s*[0-9OIl]{2})/i,
    fix: (v) => digitsFix(v).replace(/\s+/g, '').replace(/[/.]/g, '-'),
    ok: validDate,
  },
  { key: 'sex', label: 'Sex', re: /SEX\s*[:;.]?\s*(FEMALE|MALE|F|M)\b/i, fix: (v) => (/^f/i.test(v) ? 'Female' : 'Male'), ok: (v) => SEX.includes(v) },
  { key: 'civil_status', label: 'Civil status', re: /CIVIL\s*STATUS\s*:?\s*([A-Za-z]+)/i, fix: (v) => titleCase(v), ok: (v) => CIVIL.includes(v) },
  {
    key: 'contact',
    label: 'Contact no.',
    re: /CONTACT\s*N[o0]\.?\s*:?\s*([0-9OIl +-]{7,})/i,
    fix: (v) => digitsFix(v).replace(/\s+/g, ' ').trim(),
    ok: (v) => /^(\+?63|0)\d[\d ]{8,12}$/.test(v),
  },
  {
    key: 'philhealth_pin',
    label: 'PhilHealth PIN',
    re: /PHILHEALTH\s*PIN\s*:?\s*([0-9OIl~—–-]{10,})/i,
    alt: /(\d{2}\s*[-~—–]\s*\d{9}\s*[-~—–]\s*\d)/,
    fix: (v) => digitsFix(v).replace(/[~—–\s]/g, (c) => (c === ' ' ? '' : '-')),
    ok: (v) => /^\d{2}-\d{9}-\d$/.test(v) },
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
    let found = false
    for (const l of lines) {
      const m = spec.re.exec(l.text) ?? spec.alt?.exec(l.text)
      if (!m) continue
      const value = spec.fix ? spec.fix(m[1].trim()) : m[1].trim()
      add({ key: spec.key, label: spec.label, group: 'identity', raw: l.text, value, confidence: l.confidence, ok: spec.ok(value) })
      found = true
      break
    }
    if (!found) add({ key: spec.key, label: spec.label, group: 'identity', raw: '', value: '', confidence: 0, ok: false })
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

/* ---------------------------------------------------------------- optional local language model */

export type LlmStatus = { available: boolean; model: string; reason?: string }
const base = () => (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
const model = () => process.env.OLLAMA_MODEL ?? 'llama3.2:3b'

export async function llmStatus(): Promise<LlmStatus> {
  if (process.env.OLLAMA_DISABLED === '1') return { available: false, model: model(), reason: 'Turned off (OLLAMA_DISABLED=1).' }
  try {
    const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(800) })
    if (!res.ok) return { available: false, model: model(), reason: `Ollama answered ${res.status}.` }
    const data = (await res.json()) as { models?: { name: string }[] }
    const want = model()
    const has = (data.models ?? []).some((m) => m.name === want || m.name.split(':')[0] === want.split(':')[0])
    return has ? { available: true, model: want } : { available: false, model: want, reason: `Ollama is running but "${want}" is not pulled. Run: ollama pull ${want}` }
  } catch {
    return { available: false, model: model(), reason: 'Ollama is not running on this PC (port 11434). Rules-only mode is active.' }
  }
}

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
  },
  required: ['folder', 'full_name', 'birthdate', 'sex', 'civil_status', 'contact', 'philhealth_pin', 'allergies', 'family_history', 'medicines', 'visits'],
}

const SYSTEM =
  "You read OCR text from a clinic's old-patient folder form and return JSON. Copy values exactly as written; fix only obvious OCR slips in digits. " +
  'Dates are YYYY-MM-DD. Use an empty string or empty list for anything not on the form. Never invent or infer medical information. ' +
  'Allergies are "substance - reaction - severity"; family history is "relative - condition"; visits are "date - complaint".'

/** Asks the local model to read the OCR text. Returns null when it is not reachable or answers badly. */
export async function parseWithLlm(text: string): Promise<{ data: Record<string, unknown>; ms: number; model: string } | null> {
  const st = await llmStatus()
  if (!st.available) return null
  const t0 = Date.now()
  try {
    const res = await fetch(`${base()}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS ?? 45000)),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: st.model,
        stream: false,
        format: schema,
        options: { temperature: 0, num_ctx: 4096 },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { message?: { content?: string } }
    return { data: JSON.parse(body.message?.content ?? '{}') as Record<string, unknown>, ms: Date.now() - t0, model: st.model }
  } catch {
    return null
  }
}

/** Fills only what the rules could not read cleanly. A value the rules read and validated is never replaced. */
export function mergeLlm(fields: ParsedField[], data: Record<string, unknown>): ParsedField[] {
  const out = fields.map((f) => ({ ...f }))
  const str = (v: unknown) => (typeof v === 'string' ? clean(v) : '')
  for (const spec of IDENTITY) {
    const f = out.find((x) => x.key === spec.key)
    const raw = str(data[spec.key])
    if (!f || !raw) continue
    const v = spec.fix ? spec.fix(raw) : raw
    if (!f.review && f.value) continue
    if (spec.ok(v)) {
      f.value = v
      f.confidence = 60
      f.review = true
      f.source = 'llm'
    }
  }
  const med = str(data.medicines)
  if (med && !/^none$/i.test(med) && !out.some((f) => f.key === 'medicines')) {
    out.push({ key: 'medicines', label: 'Regular medicines', group: 'medicines', raw: '', value: med, confidence: 60, review: true, source: 'llm' })
  }
  return out
}
