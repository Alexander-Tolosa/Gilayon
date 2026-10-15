/*
  Builds a larger synthetic test set for measuring scan recognition: random people (no real data), each
  rendered under a different condition, with the exact answers saved beside the images.

    clean   : neat typed block letters, flat scan
    photo   : tilted phone photo, grey desk behind the page, slight blur
    dim     : poor light, low contrast
    hand    : simulated neat handwriting (an "Ink Free" style font, not a real hand)
    messy   : simulated hurried handwriting (a script font, tilted, blurred)

  The handwriting rows are SIMULATED with fonts. They show how the reader copes with joined, uneven
  letters, but real handwriting from a real clinic will differ. Measure on real forms before quoting numbers.

  Run:  node scripts/make-accuracy-set.mjs [perCondition=12]
  Output: .data/accuracy/*.png and .data/accuracy/truth.json (inside the git-ignored .data folder).
*/
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const per = Number(process.argv[2] ?? 12)
const out = new URL(process.argv.includes('--v2') ? '../.data/accuracy-v2/' : '../.data/accuracy/', import.meta.url)
mkdirSync(out, { recursive: true })
const file = (n) => new URL(n, out).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// Small seeded generator so the same set can be rebuilt.
let seed = 20261015
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const pad = (n, w) => String(n).padStart(w, '0')

const FIRST = ['MARIA', 'JOSE', 'ANA', 'JUAN', 'ROSALIE', 'CARLO', 'LIZA', 'RAMON', 'ELENA', 'MARK', 'GRACE', 'PAUL', 'JOY', 'NESTOR', 'CHERRY', 'DANTE', 'FELIX', 'IRENE', 'JOEL', 'LEA']
const MID = ['LOURDES', 'SANTOS', 'MAE', 'ANGELO', 'GRACE', 'REYES', 'LUZ', 'DELA', '']
const LAST = ['VILLANUEVA', 'DELA CRUZ', 'SORONGON', 'HECHANOVA', 'MAGBANUA', 'PARRENO', 'BANAS', 'TOLENTINO', 'LACSON', 'JAVELLANA', 'DEGUZMAN', 'GARCIA', 'ESPINOSA', 'SUMAGAYSAY', 'LOPEZ']
const ALLERGEN = [['PENICILLIN', 'RASH'], ['SHRIMP', 'HIVES'], ['IBUPROFEN', 'SWELLING'], ['SULFA', 'ITCHING'], ['EGG', 'VOMITING'], ['ASPIRIN', 'WHEEZING'], ['DUST', 'SNEEZING']]
const SEV = ['MILD', 'MODERATE', 'SEVERE']
const REL = ['MOTHER', 'FATHER', 'SISTER', 'BROTHER', 'GRANDMOTHER', 'GRANDFATHER']
const COND = ['HYPERTENSION', 'DIABETES', 'ASTHMA', 'HEART DISEASE', 'STROKE', 'CANCER']
const MEDS = ['AMLODIPINE 5MG ONCE DAILY', 'METFORMIN 500MG TWICE DAILY', 'LOSARTAN 50MG ONCE DAILY', 'SIMVASTATIN 20MG AT NIGHT', 'SALBUTAMOL INHALER AS NEEDED', 'NONE']
const COMPLAINT = ['BACK PAIN', 'HEADACHE', 'COUGH AND COLDS', 'ELEVATED BLOOD PRESSURE', 'FEVER', 'PRE-EMPLOYMENT CHECKUP', 'DENTAL CLEANING', 'STOMACH PAIN']

function person() {
  const mid = pick(MID)
  const name = [pick(FIRST), mid, pick(LAST)].filter(Boolean).join(' ')
  const y = int(1962, 2002)
  const na = int(0, 3)
  const nf = int(1, 3)
  const nv = int(1, 3)
  return {
    folder: `F-${int(2001, 2025)}-${pad(int(1, 999), 4)}`,
    name,
    birth: `${y}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`,
    sex: pick(['FEMALE', 'MALE']),
    civil: pick(['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED']),
    contact: `09${int(15, 99)} ${int(100, 999)} ${int(1000, 9999)}`,
    pin: `12-${pad(int(0, 999999999), 9)}-${int(0, 9)}`,
    allergies: Array.from({ length: na }, () => { const [s, r] = pick(ALLERGEN); return `${s} - ${r} - ${pick(SEV)}` }),
    family: Array.from({ length: nf }, () => `${pick(REL)} - ${pick(COND)}`),
    meds: Array.from({ length: int(1, 2) }, () => pick(MEDS)).filter((v, i, a) => a.indexOf(v) === i).join(', '),
    visits: Array.from({ length: nv }, () => `${int(2024, 2026)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)} - ${pick(COMPLAINT)}`),
  }
}

const CONDITIONS = {
  clean: { font: '"Courier New",monospace', size: 19, weight: 700, color: '#102a6b', sheet: '', bg: '#fff' },
  photo: { font: '"Courier New",monospace', size: 19, weight: 700, color: '#102a6b', sheet: 'transform:rotate(-2.2deg) scale(.95);box-shadow:0 6px 24px rgba(0,0,0,.35);filter:contrast(.92) blur(.4px);', bg: '#9a9a96' },
  dim: { font: '"Courier New",monospace', size: 19, weight: 700, color: '#2a3a66', sheet: 'filter:brightness(.62) contrast(.7) blur(.5px);', bg: '#555' },
  hand: { font: '"Ink Free","Segoe Print",cursive', size: 22, weight: 400, color: '#1b2a6b', sheet: '', bg: '#fff' },
  messy: { font: '"Segoe Script","Ink Free",cursive', size: 20, weight: 400, color: '#232a55', sheet: 'transform:rotate(1.8deg) scale(.96);filter:contrast(.9) blur(.5px);box-shadow:0 4px 18px rgba(0,0,0,.3);', bg: '#a8a49a' },
}

const V2 = process.argv.includes('--v2')

/** One box per character. Separated characters are far easier to read than joined handwriting. */
const comb = (value, pattern) => {
  const chars = [...value.replace(/[^0-9A-Za-z]/g, '')]
  let i = 0
  return (
    '<span class="comb">' +
    [...pattern]
      .map((slot) => (slot === '#' ? `<span class="cell">${chars[i++] ?? ''}</span>` : `<span class="sep">${slot}</span>`))
      .join('') +
    '</span>'
  )
}

const ticks = (options, chosen) =>
  '<span class="ticks">' +
  options.map((o) => `<span class="tick"><span class="box">${o.toUpperCase() === chosen.toUpperCase() ? 'X' : ''}</span>${o}</span>`).join('') +
  '</span>'

const rows = (list, n, c) => Array.from({ length: n }, (_, i) => `<div class="row"><span class="n">${i + 1}.</span><span class="v">${list[i] ?? ''}</span></div>`).join('')

const page = (d, c) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;background:${c.bg};font-family:Arial,Helvetica,sans-serif;color:#111}
.sheet{width:794px;height:1123px;background:#fffefb;padding:48px 56px;position:relative;${c.sheet}}
h1{margin:0;font-size:22px;letter-spacing:.04em} .sub{font-size:12px;color:#444;margin-top:2px}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:22px}
.title{font-size:19px;font-weight:700;margin:0 0 18px}
.f{display:flex;align-items:flex-end;gap:10px;margin-bottom:16px}
.l{font-size:13px;font-weight:700;white-space:nowrap}
.val,.v{font-family:${c.font};font-weight:${c.weight};font-size:${c.size}px;color:${c.color};border-bottom:1.5px solid #111;flex:1;min-height:28px;padding:0 4px}
.sec{font-size:13px;font-weight:700;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:3px}
.row{display:flex;align-items:flex-end;gap:8px;margin-bottom:10px} .row .n{font-size:13px;width:18px}
.comb{display:inline-flex;align-items:center;gap:2px}
.comb .cell{display:inline-grid;place-items:center;width:26px;height:34px;border:1.5px solid #c9c9c9;border-radius:3px;font-family:${c.font};font-size:${c.size}px;font-weight:${c.weight};color:${c.color};background:#fff}
.comb .sep{font-size:15px;font-weight:700;padding:0 3px;color:#333}
.ticks{display:inline-flex;gap:16px;align-items:center}
.tick{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700}
.tick .box{display:inline-grid;place-items:center;width:22px;height:22px;border:1.5px solid #c9c9c9;font-family:${c.font};font-size:16px;color:${c.color}}
.foot{position:absolute;left:56px;right:56px;bottom:40px;font-size:11px;color:#555;border-top:1px solid #999;padding-top:8px;display:flex;justify-content:space-between}
</style></head><body><div class="sheet">
<div class="head"><div><h1>GILAYON HMO CLINIC</h1><div class="sub">Province of Iloilo - Office of the Hospital Management Officer</div></div><div class="sub">FORM OPF-1 (synthetic demo)</div></div>
<p class="title">OLD PATIENT FOLDER INTAKE FORM</p>
${V2 ? `
<div class="f"><span class="l">FOLDER NO:</span>${comb(d.folder, 'F-####-####')}</div>
<div class="f"><span class="l">FULL NAME:</span><span class="val">${d.name}</span></div>
<div class="f"><span class="l">BIRTHDATE:</span>${comb(d.birth, '####-##-##')}<span class="l" style="margin-left:18px">SEX:</span>${ticks(['Female', 'Male'], d.sex)}</div>
<div class="f"><span class="l">CIVIL STATUS:</span>${ticks(['Single', 'Married', 'Widowed', 'Separated'], d.civil)}</div>
<div class="f"><span class="l">CONTACT NO:</span>${comb(d.contact, '#### ### ####')}</div>
<div class="f"><span class="l">PHILHEALTH PIN:</span>${comb(d.pin, '##-#########-#')}</div>` : `
<div class="f"><span class="l">FOLDER NO:</span><span class="val">${d.folder}</span></div>
<div class="f"><span class="l">FULL NAME:</span><span class="val">${d.name}</span></div>
<div class="f"><span class="l">BIRTHDATE (YYYY-MM-DD):</span><span class="val">${d.birth}</span><span class="l">SEX:</span><span class="val" style="max-width:150px">${d.sex}</span></div>
<div class="f"><span class="l">CIVIL STATUS:</span><span class="val">${d.civil}</span><span class="l">CONTACT NO:</span><span class="val">${d.contact}</span></div>
<div class="f"><span class="l">PHILHEALTH PIN:</span><span class="val">${d.pin}</span></div>`}
<div class="sec">ALLERGIES (substance - reaction - severity)</div>${rows(d.allergies, 3)}
<div class="sec">FAMILY HISTORY (relative - condition)</div>${rows(d.family, 3)}
<div class="f" style="margin-top:22px"><span class="l">REGULAR MEDICINES:</span><span class="val">${d.meds}</span></div>
<div class="sec">LAST VISITS (date - complaint)</div>${rows(d.visits, 3)}
<div class="foot"><span>Copied from the paper folder by: ____________________</span><span>Verified by nurse/doctor: ____________________</span></div>
</div></body></html>`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
const truth = []
for (const [cond, c] of Object.entries(CONDITIONS)) {
  for (let i = 1; i <= per; i++) {
    const d = person()
    const id = `${cond}-${pad(i, 2)}`
    const p = await ctx.newPage()
    await p.setContent(page(d, c))
    await p.screenshot({ path: file(`${id}.png`), type: 'png' })
    await p.close()
    truth.push({ id, condition: cond, ...d })
  }
  console.log('built', cond, per)
}
writeFileSync(file('truth.json'), JSON.stringify(truth, null, 2))
await browser.close()
console.log('wrote', truth.length, 'forms to', V2 ? '.data/accuracy-v2' : '.data/accuracy')
