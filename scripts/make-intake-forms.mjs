/*
  Builds the synthetic "Old patient folder intake form" used to demo and measure scan recognition:
  one blank form to print and fill in, and filled samples (block letters, like a nurse copying from a
  paper folder). Sample people exist in the demo seed, so the verification step can find them.
  Run: node scripts/make-intake-forms.mjs   (needs the Playwright Chromium from `npx playwright install chromium`)
*/
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const out = new URL('../public/forms/', import.meta.url)
mkdirSync(out, { recursive: true })

const year = new Date().getFullYear()
const samples = {
  'sample-villanueva': {
    folder: 'F-2004-0181', name: 'MARIA LOURDES VILLANUEVA', birth: `${year - 58}-03-18`, sex: 'FEMALE', civil: 'MARRIED', contact: '0917 482 1093', pin: '12-050318204-7',
    allergies: ['PENICILLIN - RASH - MODERATE'], family: ['MOTHER - HYPERTENSION', 'FATHER - DIABETES'],
    meds: 'AMLODIPINE 5MG ONCE DAILY, METFORMIN 500MG TWICE DAILY', visits: ['2025-11-04 - ELEVATED BLOOD PRESSURE', '2025-06-17 - COUGH AND COLDS'],
  },
  'sample-delacruz': {
    folder: 'F-2009-0712', name: 'JOSE DELA CRUZ', birth: `${year - 44}-08-09`, sex: 'MALE', civil: 'MARRIED', contact: '0919 554 2210', pin: '12-090809331-4',
    allergies: ['SHRIMP - HIVES - MILD', 'IBUPROFEN - SWELLING - SEVERE'], family: ['FATHER - HEART DISEASE'],
    meds: 'LOSARTAN 50MG ONCE DAILY', visits: ['2026-01-22 - BACK PAIN', '2025-09-08 - HEADACHE'],
  },
  'sample-sorongon': {
    folder: 'F-2025-0033', name: 'CARLO SORONGON', birth: `${year - 24}-05-14`, sex: 'MALE', civil: 'SINGLE', contact: '0995 612 0038', pin: '12-250514006-2',
    allergies: [], family: ['MOTHER - ASTHMA', 'GRANDFATHER - STROKE'],
    meds: 'NONE', visits: ['2026-02-10 - PRE-EMPLOYMENT CHECKUP'],
  },
}

const rows = (list, n, blank) => Array.from({ length: n }, (_, i) => `<div class="row"><span class="n">${i + 1}.</span><span class="v">${blank ? '' : (list[i] ?? '')}</span></div>`).join('')

const page = (d, { skew = false } = {}) => {
  const blank = !d
  const v = (x) => (blank ? '' : x)
  d = d ?? { allergies: [], family: [], visits: [] }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;background:${skew ? '#9a9a96' : '#fff'};font-family:Arial,Helvetica,sans-serif;color:#111}
  .sheet{width:794px;height:1123px;background:#fffefb;padding:48px 56px;position:relative;${skew ? 'transform:rotate(-1.6deg) scale(.96);box-shadow:0 6px 24px rgba(0,0,0,.35);filter:contrast(.92) blur(.35px);' : ''}}
  h1{margin:0;font-size:22px;letter-spacing:.04em} .sub{font-size:12px;color:#444;margin-top:2px}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:22px}
  .title{font-size:19px;font-weight:700;margin:0 0 18px}
  .f{display:flex;align-items:flex-end;gap:10px;margin-bottom:16px}
  .l{font-size:13px;font-weight:700;white-space:nowrap} .v,.val{font-family:"Courier New",monospace;font-weight:700;font-size:19px;color:#102a6b;border-bottom:1.5px solid #111;flex:1;min-height:26px;padding:0 4px;letter-spacing:.02em}
  .sec{font-size:13px;font-weight:700;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:3px}
  .row{display:flex;align-items:flex-end;gap:8px;margin-bottom:10px} .row .n{font-size:13px;width:18px}
  .row .v{border-bottom:1.5px solid #111;flex:1}
  .foot{position:absolute;left:56px;right:56px;bottom:40px;font-size:11px;color:#555;border-top:1px solid #999;padding-top:8px;display:flex;justify-content:space-between}
  </style></head><body><div class="sheet">
  <div class="head"><div><h1>GILAYON HMO CLINIC</h1><div class="sub">Province of Iloilo - Office of the Hospital Management Officer</div></div><div class="sub">FORM OPF-1 (synthetic demo)</div></div>
  <p class="title">OLD PATIENT FOLDER INTAKE FORM</p>
  <div class="f"><span class="l">FOLDER NO:</span><span class="val">${v(d.folder)}</span></div>
  <div class="f"><span class="l">FULL NAME:</span><span class="val">${v(d.name)}</span></div>
  <div class="f"><span class="l">BIRTHDATE (YYYY-MM-DD):</span><span class="val">${v(d.birth)}</span><span class="l">SEX:</span><span class="val" style="max-width:150px">${v(d.sex)}</span></div>
  <div class="f"><span class="l">CIVIL STATUS:</span><span class="val">${v(d.civil)}</span><span class="l">CONTACT NO:</span><span class="val">${v(d.contact)}</span></div>
  <div class="f"><span class="l">PHILHEALTH PIN:</span><span class="val">${v(d.pin)}</span></div>
  <div class="sec">ALLERGIES (substance - reaction - severity)</div>${rows(d.allergies, 3, blank)}
  <div class="sec">FAMILY HISTORY (relative - condition)</div>${rows(d.family, 3, blank)}
  <div class="f" style="margin-top:22px"><span class="l">REGULAR MEDICINES:</span><span class="val">${v(d.meds)}</span></div>
  <div class="sec">LAST VISITS (date - complaint)</div>${rows(d.visits, 3, blank)}
  <div class="foot"><span>Copied from the paper folder by: ____________________</span><span>Verified by nurse/doctor: ____________________</span></div>
  </div></body></html>`
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
const shot = async (name, html) => {
  const p = await ctx.newPage()
  await p.setContent(html)
  await p.screenshot({ path: new URL(`${name}.png`, out).pathname.replace(/^\/([A-Za-z]:)/, '$1'), type: 'png' })
  await p.close()
  console.log('wrote', name)
}
writeFileSync(new URL('intake-form-blank.html', out), page(null))
await shot('intake-form-blank', page(null))
for (const [k, d] of Object.entries(samples)) await shot(k, page(d))
await shot('sample-villanueva-photo', page(samples['sample-villanueva'], { skew: true }))
writeFileSync(new URL('samples.json', out), JSON.stringify(samples, null, 2))
await browser.close()
