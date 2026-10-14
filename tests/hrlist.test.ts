import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from '../src/features/clinic/lib/csv'
import { autoMap, detectDateOrder, normalizeRow, toIsoDate, toSex } from '../src/features/clinic/lib/hrlist'

describe('CSV parsing', () => {
  it('handles quotes, commas and line breaks inside quotes, doubled quotes, CRLF and a BOM', () => {
    const text = '﻿Name,Office\r\n"Cruz, Maria ""Mia""","Treasurer\'s Office"\r\n"Line\nbreak",Budget\r\n'
    expect(parseCsv(text)).toEqual([
      ['Name', 'Office'],
      ['Cruz, Maria "Mia"', "Treasurer's Office"],
      ['Line\nbreak', 'Budget'],
    ])
  })

  it('skips blank lines and keeps Filipino characters', () => {
    expect(parseCsv('a,b\n\n,\nBañas,Peña\n')).toEqual([['a', 'b'], ['Bañas', 'Peña']])
  })

  it('detects semicolon and tab separated exports', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('a,b')).toBe(',')
  })
})

describe('HR list columns', () => {
  it('matches common header names', () => {
    const m = autoMap(['Emp No.', 'Name of Employee', 'Date of Birth', 'Gender', 'Department', 'Designation', 'Mobile'])
    expect(m).toEqual({ employee_no: 0, full_name: 1, birthdate: 2, sex: 3, office: 4, position: 5, contact: 6 })
  })

  it('does not use one column for two fields', () => {
    expect(autoMap(['Name', 'Name'])).toEqual({ full_name: 0 })
  })
})

describe('dates and sex', () => {
  it('reads ISO, month-first and day-first dates and rejects impossible ones', () => {
    expect(toIsoDate('1968-03-18')).toBe('1968-03-18')
    expect(toIsoDate('03/18/1968', 'mdy')).toBe('1968-03-18')
    expect(toIsoDate('18/03/1968', 'dmy')).toBe('1968-03-18')
    expect(toIsoDate('1968-02-30')).toBeNull()
    expect(toIsoDate('02/30/1968', 'mdy')).toBeNull()
    expect(toIsoDate('March 18, 1968')).toBeNull()
  })

  it('works out the order from the data when it can, and says so when it cannot', () => {
    expect(detectDateOrder(['03/18/1968', '01/02/1970'])).toBe('mdy')
    expect(detectDateOrder(['18/03/1968', '01/02/1970'])).toBe('dmy')
    expect(detectDateOrder(['1968-03-18'])).toBe('iso')
    expect(detectDateOrder(['01/02/1970', '03/04/1980'])).toBeNull()
  })

  it('understands F/M and Filipino words', () => {
    expect(toSex('F')).toBe('Female')
    expect(toSex(' lalaki ')).toBe('Male')
    expect(toSex('X')).toBeNull()
  })
})

describe('row rules', () => {
  const today = new Date(2026, 9, 14)
  const good = { employee_no: ' ipg-2004-0318 ', full_name: '  Maria   Lourdes Villanueva ', birthdate: '1968-03-18', sex: 'F', office: 'Provincial Health Office', position: 'Nurse II' }

  it('cleans a good row', () => {
    const r = normalizeRow(good, today)
    expect(r).toEqual({ ok: true, row: { employee_no: 'IPG-2004-0318', full_name: 'Maria Lourdes Villanueva', birthdate: '1968-03-18', sex: 'Female', office: 'Provincial Health Office', position: 'Nurse II' } })
  })

  it.each([
    ['empty id', { ...good, employee_no: ' ' }, /Employee ID is empty/],
    ['odd id', { ...good, employee_no: 'A;DROP' }, /not allowed/],
    ['empty name', { ...good, full_name: '' }, /Name is empty/],
    ['bad date', { ...good, birthdate: '1968-13-40' }, /not a valid date/],
    ['future date', { ...good, birthdate: '2027-01-01' }, /future/],
    ['too young', { ...good, birthdate: '2020-01-01' }, /unlikely/],
    ['too old', { ...good, birthdate: '1900-01-01' }, /unlikely/],
    ['bad sex', { ...good, sex: 'X' }, /not F or M/],
  ])('rejects %s', (_n, raw, msg) => {
    const r = normalizeRow(raw, today)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(msg)
  })

  it('fills a missing office or position with "Not stated"', () => {
    const r = normalizeRow({ ...good, office: '', position: undefined }, today)
    expect(r.ok && r.row.office).toBe('Not stated')
  })
})
