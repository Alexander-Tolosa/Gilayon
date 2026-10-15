/*
  Measures how well the scan reader does on the synthetic test set from make-accuracy-set.mjs.

    npx tsx scripts/run-accuracy.ts            rule reader only
    npx tsx scripts/run-accuracy.ts --llm      rule reader + the local model (needs Ollama running)

  Each field is compared with the known answer the same way the live system compares a field with what
  the nurse confirmed (letters and digits only, case ignored). A field the reader missed, or invented, counts as wrong.
  Results are printed per condition and per field, and written to .data/accuracy/result-<mode>.json.
*/
import { readFileSync, writeFileSync } from 'node:fs'
import { ocrImage } from '../src/server/recognition/ocr'
import { BASE_VOCABULARY, snapToKnown, type KnownPatient } from '../src/server/recognition/snap'
import { llmStatus, mergeLlm, parseReading, parseWithLlm } from '../src/server/recognition/parse'

type Truth = { id: string; condition: string; folder: string; name: string; birth: string; sex: string; civil: string; contact: string; pin: string; allergies: string[]; family: string[]; meds: string; visits: string[] }

const useLlm = process.argv.includes('--llm')
const useRegistry = process.argv.includes('--registry')
const report = process.argv.includes('--report')
const dir = process.argv.includes('--v2') ? '.data/accuracy-v2' : '.data/accuracy'
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0)
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

const truth = JSON.parse(readFileSync(`${dir}/truth.json`, 'utf8')) as Truth[]
const set = limit ? truth.filter((_, i) => i % Math.ceil(truth.length / limit) === 0) : truth

// With --registry the forms belong to patients the clinic already has on file (the real old-folder case).
// Every other person's record is in the registry too, so a wrong name must still be told apart from a right one.
const registry: KnownPatient[] = truth.map((t) => ({ patient_id: t.id, full_name: title(t.name), birthdate: t.birth, sex: title(t.sex), contact: t.contact, civil_status: title(t.civil), philhealth_pin: t.pin, folder: t.folder }))

if (useLlm) {
  const st = await llmStatus()
  if (!st.available) {
    console.error(`Ollama is not ready: ${st.reason}`)
    process.exit(1)
  }
  console.log(`Using ${st.model}`)
}

/** What the form should produce, field by field, in the same names the reader uses. */
function expected(t: Truth): Record<string, string> {
  const e: Record<string, string> = { folder: t.folder, full_name: title(t.name), birthdate: t.birth, sex: title(t.sex), civil_status: title(t.civil), contact: t.contact, philhealth_pin: t.pin, medicines: t.meds }
  t.allergies.forEach((v, i) => (e[`allergy_${i + 1}`] = v))
  t.family.forEach((v, i) => (e[`family_${i + 1}`] = v))
  t.visits.forEach((v, i) => (e[`visit_${i + 1}`] = v))
  return e
}
const family = (k: string) => (/_\d+$/.test(k) ? k.replace(/_\d+$/, '') : k)

type Tally = { right: number; total: number }
const byCond = new Map<string, Tally & { forms: number; perfect: number; ms: number }>()
const byField = new Map<string, Tally>()
const misses: { id: string; field: string; want: string; got: string }[] = []
const bump = (m: Map<string, Tally>, k: string, ok: boolean) => {
  const t = m.get(k) ?? { right: 0, total: 0 }
  t.total++
  if (ok) t.right++
  m.set(k, t)
}

let n = 0
for (const t of set) {
  const buf = readFileSync(`${dir}/${t.id}.png`)
  const t0 = Date.now()
  const ocr = await ocrImage(buf)
  let fields = parseReading(ocr)
  if (useLlm) {
    const llm = await parseWithLlm(ocr.text)
    if (llm) fields = mergeLlm(fields, llm.data)
  }
  if (useRegistry) fields = snapToKnown(fields, registry, BASE_VOCABULARY).fields
  const ms = Date.now() - t0
  const got = Object.fromEntries(fields.filter((f) => f.value).map((f) => [f.key, f.value]))
  const want = expected(t)
  // A field the reader returned that is not on the form (an invented line) is also a mistake.
  const keys = new Set([...Object.keys(want), ...Object.keys(got).filter((k) => !(k in want) && norm(got[k] ?? ''))])
  const c = byCond.get(t.condition) ?? { right: 0, total: 0, forms: 0, perfect: 0, ms: 0 }
  let wrong = 0
  for (const k of keys) {
    const w = want[k] ?? ''
    const g = got[k] ?? ''
    const ok = norm(w) === norm(g) && !!norm(w)
    c.total++
    if (ok) c.right++
    else {
      wrong++
      misses.push({ id: t.id, field: k, want: w, got: g })
    }
    bump(byField, family(k), ok)
  }
  c.forms++
  c.ms += ms
  if (!wrong) c.perfect++
  byCond.set(t.condition, c)
  n++
  process.stdout.write(`\r${n}/${set.length} ${t.id} `)
}
process.stdout.write('\n\n')

const pct = (r: number, t: number) => (t ? ((r / t) * 100).toFixed(1) : '0.0') + '%'
const total = [...byCond.values()].reduce((a, c) => ({ right: a.right + c.right, total: a.total + c.total, forms: a.forms + c.forms, perfect: a.perfect + c.perfect, ms: a.ms + c.ms }), { right: 0, total: 0, forms: 0, perfect: 0, ms: 0 })

console.log(`Mode: ${useLlm ? 'rules + local model' : 'rules only'}\n`)
console.log('Condition   Forms  Fields right   Perfect forms   Avg time/form')
for (const [k, c] of byCond) console.log(`${k.padEnd(10)}  ${String(c.forms).padStart(5)}  ${pct(c.right, c.total).padStart(12)}   ${`${c.perfect}/${c.forms}`.padStart(13)}   ${(c.ms / c.forms / 1000).toFixed(1).padStart(8)} s`)
console.log(`${'ALL'.padEnd(10)}  ${String(total.forms).padStart(5)}  ${pct(total.right, total.total).padStart(12)}   ${`${total.perfect}/${total.forms}`.padStart(13)}   ${(total.ms / total.forms / 1000).toFixed(1).padStart(8)} s\n`)
console.log('Field                Right')
for (const [k, t] of [...byField].sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total)) console.log(`${k.padEnd(18)}  ${pct(t.right, t.total).padStart(7)}  (${t.right}/${t.total})`)
console.log('\nSample mistakes:')
for (const m of misses.slice(0, 12)) console.log(`  ${m.id}  ${m.field}: wanted "${m.want}" got "${m.got}"`)

if (report) {
  const stamp = new Date().toISOString().slice(0, 10)
  const names: Record<string, string> = { clean: 'Clean scan or flatbed', photo: 'Phone photo, tilted', dim: 'Poor light, low contrast', hand: 'Handwriting (neat, simulated)', messy: 'Handwriting (hurried, simulated)' }
  const lines = [
    '# Scan reading accuracy',
    '',
    `Measured on ${stamp} over ${total.forms} synthetic forms, ${useLlm ? 'with the local language model' : 'rule reader only'}${useRegistry ? ', checked against the clinic records' : ''}.`,
    '',
    'Reproduce with:',
    '',
    '```bash',
    'node scripts/make-accuracy-set.mjs 12',
    `npx tsx scripts/run-accuracy.ts${useRegistry ? ' --registry' : ''}${useLlm ? ' --llm' : ''} --report`,
    '```',
    '',
    '## Result',
    '',
    '| Condition | Forms | Fields read correctly | Forms needing no correction | Time per form |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...[...byCond].map(([k, c]) => `| ${names[k] ?? k} | ${c.forms} | ${pct(c.right, c.total)} | ${c.perfect}/${c.forms} | ${(c.ms / c.forms / 1000).toFixed(1)} s |`),
    `| **All** | **${total.forms}** | **${pct(total.right, total.total)}** | **${total.perfect}/${total.forms}** | **${(total.ms / total.forms / 1000).toFixed(1)} s** |`,
    '',
    '## By field',
    '',
    '| Field | Read correctly |',
    '| --- | ---: |',
    ...[...byField].sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total).map(([k, t]) => `| ${k} | ${pct(t.right, t.total)} (${t.right}/${t.total}) |`),
    '',
    '## How this is measured',
    '',
    '- Each field is compared with the known answer the same way the live system compares it with what the nurse confirmed: letters and digits only, case ignored.',
    '- A field the reader missed, or invented, counts as wrong.',
    '- Everything runs on one PC with no internet.',
    '',
    '## What these numbers are not',
    '',
    '- **The forms are synthetic.** They carry no real patient data, and the handwriting rows are simulated with fonts, so they are tidier than a real hand. Treat the handwriting figures as optimistic until real forms are measured.',
    '- **This is not the accuracy of the saved records.** A nurse or doctor checks every field before anything is written, so the record is right regardless. What this measures is how much typing that check saves.',
    '',
  ]
  writeFileSync('docs/ACCURACY.md', lines.join('\n'))
  console.log('\nwrote docs/ACCURACY.md')
}

writeFileSync(
  `${dir}/result-${useLlm ? 'llm' : 'rules'}${useRegistry ? '-registry' : ''}.json`,
  JSON.stringify({ mode: useLlm ? 'rules + local model' : 'rules only', forms: total.forms, accuracy: total.right / total.total, perfect: total.perfect, avg_ms: total.ms / total.forms, by_condition: Object.fromEntries([...byCond].map(([k, c]) => [k, { forms: c.forms, accuracy: c.right / c.total, perfect: c.perfect, avg_ms: c.ms / c.forms }])), by_field: Object.fromEntries([...byField].map(([k, t]) => [k, t.right / t.total])), misses }, null, 2),
)
process.exit(0)
