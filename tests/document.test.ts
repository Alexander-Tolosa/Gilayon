process.env.PGLITE_DIR = 'memory://'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const { getDb } = await import('../src/server/db')
const { seed } = await import('../db/seed')
const { scannedPage } = await import('../db/schema')
const { loadSnapshot } = await import('../src/server/state')
const { readDocument, isHollowRow } = await import('../src/server/services/recognition')
const { uploadScan } = await import('../src/server/services/records')
const { documentSchema } = await import('../src/server/recognition/vision')

/*
  Scan with AI for a certificate, lab result, dental report or prescription: the page is read for the doctor to check,
  compared with the patient it is meant for, and filed with its text only when the doctor attaches it.
*/

const doctor = { staff_id: 'st-d1', name: 'Dr. Ramon Sollesta', role: 'doctor' as const }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const MODEL = 'qwen2.5vl:3b'
const LARGE = 'qwen2.5vl:7b'

let db: Awaited<ReturnType<typeof getDb>>
let maria: string // Maria Lourdes Villanueva

beforeAll(async () => {
  db = await getDb()
  await seed(db)
  const snap = await loadSnapshot(db, doctor)
  maria = snap.patients.find((p) => snap.persons.find((x) => x.person_id === p.person_id)?.full_name === 'Maria Lourdes Villanueva')!.patient_id
})

afterEach(() => vi.unstubAllGlobals())

/** Stands in for Ollama: the model is installed, and answers with `answer` to the page. */
function model(answer: Record<string, unknown>, installed: string[] = [MODEL]) {
  const calls: { body?: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: installed.map((name) => ({ name })) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      calls.push({ body: init?.body ? JSON.parse(init.body) : undefined })
      return new Response(JSON.stringify({ message: { content: JSON.stringify(answer) } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return calls
}

const page = (over: Record<string, unknown> = {}) => ({
  patient_name: 'Maria Lourdes Villanueva',
  document_date: '2026-09-30',
  issued_by: 'Iloilo Doctors Hospital',
  title: 'Laboratory result',
  page_text: ['CBC', 'Hemoglobin: 128 g/L', 'WBC: 6.2'],
  ...over,
})

describe('reading a page for the doctor to check', () => {
  it('asks the model for the page, with a bounded schema that cannot loop on empty lines', async () => {
    const calls = model(page())
    await readDocument(db, PNG, 'Lab result', maria)
    const sent = calls[0].body!
    expect(String((sent.messages as { content: string }[])[0].content)).toMatch(/laboratory result/)
    const items = (documentSchema.properties.page_text as { maxItems: number; items: { minLength: number } })
    expect(items.maxItems).toBeLessThanOrEqual(100)
    expect(items.items.minLength).toBeGreaterThan(0)
    expect(sent.format).toEqual(documentSchema)
  })

  it('returns the lines, the date, who issued it and says the name matches', async () => {
    model(page())
    const r = await readDocument(db, PNG, 'Lab result', maria)
    expect(r.text).toEqual(['CBC', 'Hemoglobin: 128 g/L', 'WBC: 6.2'])
    expect(r).toMatchObject({ date: '2026-09-30', issued_by: 'Iloilo Doctors Hospital', title: 'Laboratory result', name_matches: true, patient_name: 'Maria Lourdes Villanueva' })
  })

  it('treats "SURNAME, GIVEN" as the same name, and tolerates a slip in handwriting', async () => {
    model(page({ patient_name: 'VILLANUEVA, MARIA LOURDES' }))
    expect((await readDocument(db, PNG, 'Certificate', maria)).name_matches).toBe(true)
    model(page({ patient_name: 'Maria Lourdes Vilanueva' }))
    expect((await readDocument(db, PNG, 'Certificate', maria)).name_matches).toBe(true)
  })

  it('flags a page that names someone else, the mistake that matters most', async () => {
    model(page({ patient_name: 'NAVARRO, THEODORE' }))
    const r = await readDocument(db, PNG, 'Lab result', maria)
    expect(r.name_matches).toBe(false)
    expect(r.name_on_page).toBe('NAVARRO, THEODORE')
  })

  it('says nothing could be compared, rather than "matches", when the page names no one', async () => {
    model(page({ patient_name: '' }))
    expect((await readDocument(db, PNG, 'Prescription', maria)).name_matches).toBeNull()
  })

  it('drops a date that is not real or is in the future', async () => {
    model(page({ document_date: '2026-02-31' }))
    expect((await readDocument(db, PNG, 'Certificate', maria)).date).toBe('')
    model(page({ document_date: '2999-01-01' }))
    expect((await readDocument(db, PNG, 'Certificate', maria)).date).toBe('')
  })

  it('splits a page the model returned as one string with line breaks, and leaves out empty lines and stray characters', async () => {
    model(page({ page_text: ['CBC\nHemoglobin: 128 g/L\nRemarks:\nWBC: 6.2 冷冷', 'Signed: Dr. Reyes'] }))
    const r = await readDocument(db, PNG, 'Lab result', maria)
    expect(r.text).toEqual(['CBC', 'Hemoglobin: 128 g/L', 'Signed: Dr. Reyes'])
  })

  it('files nothing: reading a page leaves the record as it was', async () => {
    model(page())
    const before = (await db.select().from(scannedPage).where(eq(scannedPage.patient_id, maria))).length
    await readDocument(db, PNG, 'Lab result', maria)
    expect((await db.select().from(scannedPage).where(eq(scannedPage.patient_id, maria))).length).toBe(before)
  })

  it('says plainly when the model is not installed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(readDocument(db, PNG, 'Lab result', maria)).rejects.toMatchObject({ status: 503 })
  })
})

describe('which reader reads a document', () => {
  it('uses the larger model when it is installed, and lets it go from memory soon after', async () => {
    const calls = model(page(), [MODEL, LARGE])
    const r = await readDocument(db, PNG, 'Lab result', maria)
    expect(calls[0].body).toMatchObject({ model: LARGE, keep_alive: '90s' })
    expect(r).toMatchObject({ model: LARGE, small: false })
  })

  it('falls back to the small model, and says so, because the small one can add rows that are not on the page', async () => {
    const calls = model(page(), [MODEL])
    const r = await readDocument(db, PNG, 'Lab result', maria)
    expect(calls[0].body!.model).toBe(MODEL)
    expect(r).toMatchObject({ model: MODEL, small: true })
  })
})

describe('rows the model wrote for lines with nothing on them', () => {
  it('knows a row with nothing in it: two or more of its own answers are "none"', () => {
    expect(isHollowRow('Date: 10/15/24 Chief Complaint: Nausea Diagnosis: None Treatment: None')).toBe(true)
    expect(isHollowRow('Date: 10/15/24 Chief Complaint: Fatigue Diagnosis: N/A Treatment: blank')).toBe(true)
  })

  it('keeps a real row, including one with a single empty cell', () => {
    expect(isHollowRow('Date: 10/15/24 Chief Complaint: Headache Diagnosis: Tension headache Treatment: Rest')).toBe(false)
    expect(isHollowRow('Date: 10/15/24 Chief Complaint: Headache Diagnosis: Tension headache Treatment: None')).toBe(false)
    expect(isHollowRow('Hemoglobin: 128 g/L')).toBe(false)
    expect(isHollowRow('Remarks: none')).toBe(false)
  })

  it('leaves them out of what the doctor is shown, and keeps the real rows', async () => {
    model(page({ page_text: ['Date: 10/15/24 Chief Complaint: Headache Diagnosis: Tension headache Treatment: Rest', 'Date: 10/15/24 Chief Complaint: Nausea Diagnosis: None Treatment: None', 'Date: 10/15/24 Chief Complaint: Fatigue Diagnosis: None Treatment: None'] }))
    const r = await readDocument(db, PNG, 'Chart', maria)
    expect(r.text).toEqual(['Date: 10/15/24 Chief Complaint: Headache Diagnosis: Tension headache Treatment: Rest'])
  })
})

describe('filing the page', () => {
  it('keeps the text the doctor checked with the page, for any kind including Dental', async () => {
    const id = await db.transaction((tx) => uploadScan(tx, doctor, maria, PNG, 'Dental', '2026-09-30', undefined, { category: 'Outside report', source_clinic: 'Dental Care Iloilo', report_date: '2026-09-30', text: '  Tooth 46: filled\nReturn in 6 months  ' }))
    const [row] = await db.select().from(scannedPage).where(eq(scannedPage.page_id, id))
    expect(row).toMatchObject({ kind: 'Dental', source_clinic: 'Dental Care Iloilo', ocr_text: 'Tooth 46: filled\nReturn in 6 months', uploaded_by: doctor.staff_id })
  })

  it('files a plain photo with no text when the reader could not read it', async () => {
    const id = await db.transaction((tx) => uploadScan(tx, doctor, maria, PNG, 'Certificate', '2026-10-01', undefined, { category: 'Old folder' }))
    const [row] = await db.select().from(scannedPage).where(eq(scannedPage.page_id, id))
    expect(row.ocr_text).toBeNull()
  })

  it('reaches the patient in the whole-clinic snapshot, text included', async () => {
    const snap = await loadSnapshot(db, doctor)
    const pages = snap.scans.filter((s) => s.patient_id === maria)
    expect(pages.some((s) => s.kind === 'Dental' && s.ocr_text?.includes('Tooth 46'))).toBe(true)
  })
})
