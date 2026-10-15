import { describe, expect, it } from 'vitest'
import { censusFor, weekRange } from '../src/features/clinic/lib/census'
import { unreadActivity } from '../src/features/clinic/lib/activity'
import { buildSeed } from '../src/features/clinic/data/seed'
import { dayKeyOffset, todayKey } from '../src/features/clinic/lib/helpers'

const t = (day: string, patient_id: string) => ({ day, patient_id })

describe('census', () => {
  it('counts visits and distinct patients for the day, week, month and year', () => {
    // Wed 14 Oct 2026. Week = Mon 12 Oct to Sun 18 Oct.
    const tickets = [
      t('2026-10-14', 'a'),
      t('2026-10-14', 'a'), // same person twice in one day: 2 visits, 1 patient
      t('2026-10-14', 'b'),
      t('2026-10-12', 'a'),
      t('2026-10-11', 'c'), // Sunday before: previous week, same month
      t('2026-10-02', 'd'),
      t('2026-03-05', 'e'),
      t('2025-12-31', 'f'), // last year
      t('2026-10-16', 'g'), // after the selected day: not counted yet
    ]
    const r = Object.fromEntries(censusFor(tickets, '2026-10-14').map((x) => [x.period, x]))
    expect(r.Day).toMatchObject({ visits: 3, patients: 2 })
    expect(r.Week).toMatchObject({ from: '2026-10-12', to: '2026-10-14', visits: 4, patients: 2 })
    expect(r.Month).toMatchObject({ visits: 6, patients: 4 })
    expect(r.Year).toMatchObject({ visits: 7, patients: 5 })
  })

  it('weeks run Monday to Sunday, including across a month boundary', () => {
    expect(weekRange('2026-10-14')).toEqual(['2026-10-12', '2026-10-18'])
    expect(weekRange('2026-11-01')).toEqual(['2026-10-26', '2026-11-01']) // a Sunday
    expect(weekRange('2026-10-12')).toEqual(['2026-10-12', '2026-10-18']) // a Monday
  })
})

describe('what a doctor has not seen yet', () => {
  const log = (id: string, at: number, staff_id: string, action: string) => ({ log_id: id, staff_id, action: action as never, table_name: 'x', record_id: 'r', summary: id, logged_at: at })
  const audit = [
    log('mine', 300, 'st-d1', 'edit'),
    log('old', 100, 'st-f1', 'create'),
    log('new-edit', 250, 'st-f1', 'edit'),
    log('routine', 260, 'st-f1', 'check-in'),
    log('signin', 270, 'st-f1', 'verify'),
    log('sync', 280, 'system', 'sync'),
  ]

  it('shows other people\'s notable changes after the seen mark, not own work or routine traffic', () => {
    const ids = unreadActivity({ audit, auditSeenAt: 200 }, 'st-d1').map((a) => a.log_id)
    expect(ids).toEqual(['new-edit', 'sync'])
  })

  it('shows nothing once the mark is at the latest entry', () => {
    expect(unreadActivity({ audit, auditSeenAt: 300 }, 'st-d1')).toEqual([])
  })
})

describe('the seeded pitch week', () => {
  const PITCH_VISITS = [0, 14, 12, 11, 13, 9, 6] // Sun..Sat, same shape as the seed
  const { tickets } = buildSeed()

  it('gives each of the last six days its designed number of visits', () => {
    for (let d = 1; d <= 6; d++) {
      const day = dayKeyOffset(-d)
      const [y, m, dd] = day.split('-').map(Number)
      const want = PITCH_VISITS[new Date(y, m - 1, dd).getDay()]
      expect(tickets.filter((x) => x.day === day), day).toHaveLength(want)
    }
  })

  it('shows more visits than distinct patients over the trailing seven days, and a non-empty today', () => {
    // Not the calendar week: on a Monday that week holds only today.
    const from = dayKeyOffset(-6)
    const week = tickets.filter((x) => x.day >= from && x.day <= todayKey())
    expect(week.length).toBeGreaterThan(new Set(week.map((x) => x.patient_id)).size)
    expect(censusFor(tickets, todayKey())[0].visits).toBeGreaterThan(0)
  })
})
