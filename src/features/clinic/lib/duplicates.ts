import type { Snapshot } from '../api-types'
import type { Patient, Person } from '../types'
import { matchScore } from './helpers'

export type DuplicatePair = {
  a: Patient
  b: Patient
  personA: Person
  personB: Person
  score: number
  /** Both are on the HR list under different employee numbers: they cannot be merged. */
  blocked: boolean
  /** The record to keep: the HR-listed one, else the one with a paper folder or more history. */
  suggestKeep: 'a' | 'b'
}

export const pairKey = (x: string, y: string) => [x, y].sort().join('|')

/** Same birthdate, same sex and a similar name, minus pairs staff already said are different people. */
export function findDuplicatePairs(data: Snapshot): DuplicatePair[] {
  const personById = new Map(data.persons.map((p) => [p.person_id, p]))
  const empOf = new Set(data.employees.map((e) => e.person_id))
  const visits = new Map<string, number>()
  for (const c of data.consultations) visits.set(c.patient_id, (visits.get(c.patient_id) ?? 0) + 1)
  const skip = new Set(data.notDuplicates)

  const byBirth = new Map<string, Patient[]>()
  for (const pt of data.patients) {
    const per = personById.get(pt.person_id)
    if (!per) continue
    const key = `${per.birthdate}|${per.sex}`
    byBirth.set(key, [...(byBirth.get(key) ?? []), pt])
  }

  const out: DuplicatePair[] = []
  for (const group of byBirth.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (skip.has(pairKey(a.patient_id, b.patient_id))) continue
        const personA = personById.get(a.person_id)!
        const personB = personById.get(b.person_id)!
        const score = matchScore(personA.full_name, personB.full_name, [])
        if (score < 0.75) continue
        const aEmp = empOf.has(a.person_id)
        const bEmp = empOf.has(b.person_id)
        const rank = (pt: Patient, emp: boolean) => (emp ? 1000 : 0) + (pt.legacy_folder_no ? 100 : 0) + (visits.get(pt.patient_id) ?? 0)
        out.push({ a, b, personA, personB, score, blocked: aEmp && bEmp, suggestKeep: rank(a, aEmp) >= rank(b, bEmp) ? 'a' : 'b' })
      }
    }
  }
  return out.sort((x, y) => y.score - x.score)
}
