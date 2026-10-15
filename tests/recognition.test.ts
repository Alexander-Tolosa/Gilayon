import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { ocrImage } from '../src/server/recognition/ocr'
import { parseReading } from '../src/server/recognition/parse'
import { distance, snapToKnown, type KnownPatient } from '../src/server/recognition/snap'

// The synthetic intake forms in public/forms are built by scripts/make-intake-forms.mjs.
type Sample = { folder: string; name: string; birth: string; sex: string; civil: string; contact: string; pin: string; allergies: string[]; family: string[]; meds: string; visits: string[] }
const samples = JSON.parse(readFileSync('public/forms/samples.json', 'utf8')) as Record<string, Sample>
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

// The clinic registry the forms are checked against: the sample people, plus a look-alike that must not be picked.
const registry: KnownPatient[] = [
  ...Object.values(samples).map((x, i) => ({ patient_id: `p${i}`, full_name: title(x.name), birthdate: x.birth, sex: title(x.sex), contact: x.contact, civil_status: title(x.civil), philhealth_pin: x.pin, folder: x.folder })),
  { patient_id: 'decoy', full_name: 'Marta Lourdes Villanueva', birthdate: '1990-01-01', sex: 'Female', contact: '0900 000 0000', civil_status: 'Single', philhealth_pin: '12-000000000-0', folder: 'F-2020-0001' },
]

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
      const f = Object.fromEntries(snapToKnown(parseReading(ocr), registry).fields.map((x) => [x.key, x.value]))
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

describe('snapping to the clinic records', () => {
  const known: KnownPatient = { patient_id: 'p1', full_name: 'Maria Lourdes Villanueva', birthdate: '1968-03-18', sex: 'Female', contact: '0917 482 1093', civil_status: 'Married', philhealth_pin: '12-050318204-7', folder: 'F-2004-0181' }
  const field = (key: string, value: string, group: 'identity' | 'allergy' | 'family' = 'identity') => ({ key, label: key, group, raw: value, value, confidence: 80, review: false, source: 'rules' as const })

  it('counts edits between strings', () => {
    expect(distance('maria', 'marta')).toBe(1)
    expect(distance('1983', '1423')).toBe(2)
    expect(distance('same', 'same')).toBe(0)
  })

  it('corrects a near miss once the person is identified, and says what it changed', () => {
    const { fields, patient } = snapToKnown([field('folder', 'F-2004-0181'), field('full_name', 'Marta Lourdes Villanueva'), field('birthdate', '1963-03-18'), field('contact', '0917 482 1O93')], [known])
    expect(patient?.patient_id).toBe('p1')
    const by = Object.fromEntries(fields.map((f) => [f.key, f]))
    expect(by.full_name.value).toBe('Maria Lourdes Villanueva')
    expect(by.full_name.note).toContain('Marta')
    expect(by.birthdate.value).toBe('1968-03-18')
    expect(by.contact.value).toBe('0917 482 1093')
  })

  it('leaves a value that is far from the record alone: it may be a real update', () => {
    const { fields } = snapToKnown([field('folder', 'F-2004-0181'), field('contact', '0999 111 2222')], [known])
    expect(fields.find((f) => f.key === 'contact')?.value).toBe('0999 111 2222')
  })

  it('does not guess when the person cannot be told for certain', () => {
    const twin = { ...known, patient_id: 'p2', folder: '' }
    const { patient } = snapToKnown([field('full_name', 'Marta Lourdes Villanueva'), field('birthdate', '1968-03-18')], [known, twin])
    expect(patient).toBeNull()
  })

  it('matches words against fixed lists', () => {
    const { fields } = snapToKnown([field('allergy_1', 'PENICILLIN - RASH - MIID', 'allergy'), field('family_1', 'MOTHFR - HYPERTENSION', 'family')], [])
    expect(fields[0].value).toBe('PENICILLIN - RASH - MILD')
    expect(fields[1].value).toBe('MOTHER - HYPERTENSION')
  })
})
