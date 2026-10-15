import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { ocrImage } from '../src/server/recognition/ocr'
import { parseWithRules } from '../src/server/recognition/parse'

// The synthetic intake forms in public/forms are built by scripts/make-intake-forms.mjs.
type Sample = { folder: string; name: string; birth: string; sex: string; civil: string; contact: string; pin: string; allergies: string[]; family: string[]; meds: string; visits: string[] }
const samples = JSON.parse(readFileSync('public/forms/samples.json', 'utf8')) as Record<string, Sample>
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

const cases: [string, string][] = [
  ['sample-villanueva', 'sample-villanueva'],
  ['sample-delacruz', 'sample-delacruz'],
  ['sample-sorongon', 'sample-sorongon'],
  ['sample-villanueva-photo', 'sample-villanueva'],
]

describe('scan recognition (local OCR + rules, no network)', () => {
  afterAll(() => undefined)
  for (const [file, key] of cases) {
    it(`reads ${file}`, async () => {
      const want = samples[key]
      const ocr = await ocrImage(readFileSync(`public/forms/${file}.png`))
      const f = Object.fromEntries(parseWithRules(ocr.lines).map((x) => [x.key, x.value]))
      expect(f.folder).toBe(want.folder)
      expect(f.full_name).toBe(title(want.name))
      expect(f.birthdate).toBe(want.birth)
      expect(f.sex).toBe(title(want.sex))
      expect(f.civil_status).toBe(title(want.civil))
      expect(f.contact).toBe(want.contact)
      expect(f.philhealth_pin).toBe(want.pin)
      want.allergies.forEach((a, i) => expect(f[`allergy_${i + 1}`]).toBe(a))
      expect(f[`allergy_${want.allergies.length + 1}`]).toBeUndefined()
      want.family.forEach((a, i) => expect(f[`family_${i + 1}`]).toBe(a))
      expect(f[`family_${want.family.length + 1}`]).toBeUndefined()
      want.visits.forEach((a, i) => expect(f[`visit_${i + 1}`]).toBe(a))
      expect(f.medicines.replace(/,/g, '')).toBe(want.meds.replace(/,/g, ''))
    }, 60000)
  }
})
