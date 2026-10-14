/*
  Census: how many people the clinic served. The concept left open whether to count patients or
  visits, so every period shows both: a "visit" is one check-in (one queue ticket), a "patient" is
  one distinct person however many times they came in that period.
*/

export type CensusRow = { period: 'Day' | 'Week' | 'Month' | 'Year'; from: string; to: string; visits: number; patients: number }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Calendar week, Monday to Sunday, containing `day`. */
export function weekRange(day: string): [string, string] {
  const d = parse(day)
  const back = (d.getDay() + 6) % 7
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return [iso(start), iso(end)]
}

export function censusFor(tickets: { day: string; patient_id: string }[], day: string): CensusRow[] {
  const d = parse(day)
  const [wFrom, wTo] = weekRange(day)
  const ranges: [CensusRow['period'], string, string][] = [
    ['Day', day, day],
    ['Week', wFrom, wTo],
    ['Month', iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))],
    ['Year', `${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`],
  ]
  return ranges.map(([period, from, to]) => {
    // Never count past the selected day: "this week so far", not the days still to come.
    const upTo = to > day ? day : to
    const inRange = tickets.filter((t) => t.day >= from && t.day <= upTo)
    return { period, from, to: upTo, visits: inRange.length, patients: new Set(inRange.map((t) => t.patient_id)).size }
  })
}
