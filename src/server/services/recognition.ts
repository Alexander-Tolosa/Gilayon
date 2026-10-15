import { desc, eq, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { audit, HttpError, nowMs, uuid, type Actor } from '../core'
import { getDb, type Q } from '../db'
import { notifyChanged } from '../events'
import { decodeImage, readScan, removeScan, storeScan } from '../files'
import { ocrImage, readability } from '../recognition/ocr'
import { mergeVision, parseReading, withoutInferredSections, type ParsedField } from '../recognition/parse'
import { BASE_VOCABULARY, snapToKnown, type KnownPatient } from '../recognition/snap'
import { readWithVision, visionStatus } from '../recognition/vision'
import { addAllergy, addFamilyHistory, completeRecord, uploadScan } from './records'

/*
  Reads a scanned old-patient folder form on this PC and records how well it did.

  scan    : OCR + parse (rules, plus the local language model when Ollama is running). Saves a draft event.
  confirm : the nurse or doctor checked every field. Only then does anything reach the patient record,
            and the machine-read value and the confirmed value are both kept, which is the accuracy data.
  metrics : the numbers behind the dashboard.
*/

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const PLURAL: Record<string, string> = { allergy: 'Allergies', family: 'Family history', visit: 'Visits' }

export type EventField = ParsedField & { confirmed?: string; correct?: boolean }

async function findPatient(q: Q, f: Record<string, string>) {
  const rows = await q
    .select({ patient_id: t.patient.patient_id, full_name: t.person.full_name, birthdate: t.person.birthdate, folder: t.patient.legacy_folder_no, merged: t.patient.merged_into })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
  const live = rows.filter((r) => !r.merged)
  const byNameAndBirth = live.filter((r) => f.full_name && f.birthdate && norm(r.full_name) === norm(f.full_name) && r.birthdate === f.birthdate)
  const byFolder = live.filter((r) => f.folder && r.folder && r.folder.toUpperCase() === f.folder.toUpperCase())
  const first = (byNameAndBirth.length ? byNameAndBirth : byFolder)[0]
  const surname = norm(f.full_name?.split(' ').slice(-1)[0] ?? '')
  const candidates = live.filter((r) => surname.length > 2 && norm(r.full_name).includes(surname) && r.patient_id !== first?.patient_id).slice(0, 5)
  return {
    match: first ? { patient_id: first.patient_id, full_name: first.full_name, birthdate: first.birthdate, by: byNameAndBirth.length ? ('name and birthdate' as const) : ('folder number' as const) } : null,
    candidates: candidates.map((c) => ({ patient_id: c.patient_id, full_name: c.full_name, birthdate: c.birthdate })),
  }
}

/** OCR, then the parser (and the local model when it is running). Nothing here touches the database. */
async function knownPatients(q: Q): Promise<KnownPatient[]> {
  const rows = await q
    .select({ patient_id: t.patient.patient_id, full_name: t.person.full_name, birthdate: t.person.birthdate, sex: t.person.sex, contact: t.person.contact, civil_status: t.patient.civil_status, pin: t.patient.philhealth_pin, folder: t.patient.legacy_folder_no, merged: t.patient.merged_into })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
  return rows.filter((r) => !r.merged).map((r) => ({ patient_id: r.patient_id, full_name: r.full_name, birthdate: r.birthdate, sex: r.sex, contact: r.contact, civil_status: r.civil_status, philhealth_pin: r.pin ?? '', folder: r.folder ?? '' }))
}

async function vocabulary(q: Q) {
  const [al, fh] = await Promise.all([q.select({ s: t.allergy.substance }).from(t.allergy), q.select({ c: t.familyHistory.condition }).from(t.familyHistory)])
  const upper = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toUpperCase()).filter(Boolean))]
  return { ...BASE_VOCABULARY, substances: upper([...BASE_VOCABULARY.substances, ...al.map((a) => a.s)]), conditions: upper([...BASE_VOCABULARY.conditions, ...fh.map((f) => f.c)]) }
}

/**
 * A line is worth showing only when something was written on it. The model returns the form's own empty
 * lines too ("Verified by nurse/doctor: [blank]"), and a blank line copied nowhere is noise on the screen.
 */
function hasAnAnswer(line: string) {
  if (line.length < 3) return false
  const answer = line.includes(':') ? line.slice(line.lastIndexOf(':') + 1) : line
  return answer.replace(/\[?\b(blank|none|n\/?a|empty)\b\]?/gi, '').replace(/[^a-z0-9]/gi, '').length > 0
}

/**
 * The picture is also read by the local vision model whenever it is installed (`OLLAMA_VISION_AUTO=0` turns that off), because
 * Tesseract alone misreads handwriting. `handwriting` asks for it explicitly: then a failure is reported instead of skipped.
 */
async function readBytes(q: Q, bytes: Buffer, opts: { handwriting?: boolean } = {}) {
  let ocr = await ocrImage(bytes)
  let flipped = false
  // Some cameras hand over a mirrored picture. It still produces rows, but they are nonsense and the
  // engine is barely sure of any of them, so a poor score is worth the cost of reading it the other way round.
  if (readability(ocr) < 60) {
    const mirrored = await ocrImage(bytes, { flip: true })
    if (readability(mirrored) > readability(ocr)) {
      ocr = mirrored
      flipped = true
    }
  }
  // Pure handwriting can leave the OCR with almost nothing, which is exactly when the image reader is needed.
  const auto = !opts.handwriting && process.env.OLLAMA_VISION_AUTO !== '0' && (await visionStatus()).available
  if (ocr.lines.length < 4 && !opts.handwriting && !auto) throw new HttpError(422, 'Could not read any text on this image. Retake it flat, in good light, with the whole form in view.')
  const t0 = Date.now()
  let fields = parseReading(ocr)
  let parse_engine = 'Rule reader (local)'
  /** The whole page, written out. Shown to the person scanning so nothing on the paper is lost; never filed on its own. */
  let other: string[] = []
  if (opts.handwriting || auto) {
    try {
      const v = await readWithVision(bytes, { flip: flipped })
      fields = mergeVision(fields, v.data, v.model)
      other = (Array.isArray(v.data.page_text) ? (v.data.page_text as unknown[]) : []).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(hasAnAnswer).slice(0, 60)
      parse_engine = `${parse_engine} + ${v.model} (image reader, Ollama, local)`
    } catch (e) {
      // An automatic second reading is a bonus: if it fails, the OCR reading still stands (and the nurse can press Read handwriting to retry).
      if (opts.handwriting) throw e
      if (ocr.lines.length < 4) throw new HttpError(422, 'Could not read any text on this image. Retake it flat, in good light, with the whole form in view.')
    }
  }
  fields = withoutInferredSections(fields, ocr.text)
  // Layer 2: correct near-misses against the clinic's own records.
  fields = snapToKnown(fields, await knownPatients(q), await vocabulary(q)).fields
  return { fields, other, ocr_ms: ocr.ms, parse_ms: Date.now() - t0, ocr_engine: ocr.engine, parse_engine: `${parse_engine} + clinic records` }
}

async function reading(q: Q, ev: { event_id: string; fields: unknown; other?: string[]; ocr_ms: number; parse_ms: number; ocr_engine: string; parse_engine: string }) {
  const fields = ev.fields as ParsedField[]
  const f = Object.fromEntries(fields.map((x) => [x.key, x.value]))
  return { event_id: ev.event_id, fields, other: ev.other ?? [], read_handwriting: ev.parse_engine.includes('image reader'), ocr_ms: ev.ocr_ms, parse_ms: ev.parse_ms, ocr_engine: ev.ocr_engine, parse_engine: ev.parse_engine, vision: await visionStatus(), ...(await findPatient(q, f)) }
}

/** `replaces` is the draft from this person's first reading of the same page, removed once the second succeeds. */
export async function scanForm(q: Q, actor: Actor, file: string, opts: { handwriting?: boolean; replaces?: string } = {}) {
  const r = await readBytes(q, decodeImage(file).bytes, { handwriting: opts.handwriting })
  if (opts.replaces) {
    const [old] = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, opts.replaces))
    if (old && old.created_by === actor.staff_id && old.status === 'draft' && !old.image_file) await q.delete(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, opts.replaces))
  }
  const event_id = uuid()
  await q.insert(t.recognitionEvent).values({ event_id, status: 'draft', ocr_engine: r.ocr_engine, parse_engine: r.parse_engine, ocr_ms: r.ocr_ms, parse_ms: r.parse_ms, fields: r.fields, created_by: actor.staff_id, created_at: nowMs() })
  return reading(q, { event_id, ...r })
}

/* --------------------------------------------------- photos taken while the server was unreachable */

/**
 * A photo captured offline arrives with the sync. It is stored and queued here, and read in the
 * background afterwards, so a batch of photos never holds a database transaction open for OCR.
 * The id is the one the clinic PC made, so a retried sync never queues the same photo twice.
 */
export async function queueFolderScan(q: Q, actor: Actor, input: { scan_id: string; file: string; captured_at: number; patient_hint?: string }) {
  const [have] = await q.select({ id: t.recognitionEvent.event_id }).from(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, input.scan_id))
  if (have) return
  const image_file = await storeScan(input.file, `q${input.scan_id.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`)
  try {
    await q.insert(t.recognitionEvent).values({
      event_id: input.scan_id,
      status: 'queued',
      ocr_engine: '',
      parse_engine: '',
      ocr_ms: 0,
      parse_ms: 0,
      fields: [],
      created_by: actor.staff_id,
      created_at: nowMs(),
      image_file,
      captured_at: input.captured_at,
      patient_hint: input.patient_hint?.trim().slice(0, 200) || null,
    })
  } catch (e) {
    await removeScan(image_file)
    throw e
  }
}

let running = false
/** Reads every queued photo, one after another. Safe to call often: only one run happens at a time. */
export async function processQueued() {
  if (running) return
  running = true
  try {
    const db = await getDb()
    for (;;) {
      const [next] = await db.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.status, 'queued')).orderBy(t.recognitionEvent.created_at).limit(1)
      if (!next?.image_file) break
      try {
        const r = await readBytes(db, (await readScan(next.image_file)).bytes)
        await db.update(t.recognitionEvent).set({ status: 'draft', fields: r.fields, ocr_ms: r.ocr_ms, parse_ms: r.parse_ms, ocr_engine: r.ocr_engine, parse_engine: r.parse_engine, note: null }).where(eq(t.recognitionEvent.event_id, next.event_id))
      } catch (e) {
        const note = e instanceof HttpError ? e.message : 'This photo could not be read.'
        await db.update(t.recognitionEvent).set({ status: 'failed', note }).where(eq(t.recognitionEvent.event_id, next.event_id))
      }
      notifyChanged()
    }
  } finally {
    running = false
  }
}

/** Photos this person sent from the offline queue and has not yet confirmed or discarded. */
export async function pendingScans(q: Q, actor: Actor) {
  const rows = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.created_by, actor.staff_id)).orderBy(desc(t.recognitionEvent.created_at))
  const mine = rows.filter((r) => r.image_file && r.status !== 'confirmed')
  if (mine.some((r) => r.status === 'queued')) setTimeout(() => void processQueued(), 100)
  return mine.map((r) => ({
    event_id: r.event_id,
    status: r.status as 'queued' | 'draft' | 'failed',
    captured_at: r.captured_at ?? r.created_at,
    patient_hint: r.patient_hint ?? '',
    note: r.note ?? '',
    full_name: (r.fields as ParsedField[]).find((f) => f.key === 'full_name')?.value ?? '',
  }))
}

/** Opens one queued photo for checking: what was read, the best patient match, and the picture itself. */
export async function openPendingScan(q: Q, actor: Actor, eventId: string) {
  const [ev] = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, eventId))
  if (!ev || ev.created_by !== actor.staff_id || !ev.image_file) throw new HttpError(404, 'That photo was not found.')
  if (ev.status === 'queued') throw new HttpError(409, 'This photo is still being read. Try again in a moment.')
  if (ev.status === 'failed') throw new HttpError(422, ev.note ?? 'This photo could not be read.')
  const { bytes, type } = await readScan(ev.image_file)
  return { ...(await reading(q, ev)), image: `data:${type};base64,${bytes.toString('base64')}`, patient_hint: ev.patient_hint ?? '' }
}

export async function discardPendingScan(q: Q, actor: Actor, eventId: string) {
  const [ev] = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, eventId))
  if (!ev || ev.created_by !== actor.staff_id) throw new HttpError(404, 'That photo was not found.')
  if (ev.status === 'confirmed') throw new HttpError(409, 'A confirmed form cannot be discarded.')
  await q.delete(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, eventId))
  if (ev.image_file) await removeScan(ev.image_file)
}

type Confirm = { patient_id: string; values: Record<string, string>; review_ms: number; file?: string }

const SEVERITY = { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' } as const
const parts = (v: string) => v.split(/\s+[-~—–]\s+/).map((x) => x.trim())

export async function confirmScan(q: Q, actor: Actor, eventId: string, input: Confirm) {
  const [ev] = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.event_id, eventId))
  if (!ev) throw new HttpError(404, 'That scan was not found.')
  if (ev.status === 'confirmed') throw new HttpError(409, 'This scan was already confirmed.')
  if (ev.status !== 'draft') throw new HttpError(409, 'This photo has not been read yet.')
  if (ev.created_by !== actor.staff_id) throw new HttpError(403, 'Only the person who scanned this page can confirm it.')
  const [pt] = await q.select({ id: t.patient.patient_id, civil: t.patient.civil_status, folder: t.patient.legacy_folder_no }).from(t.patient).where(eq(t.patient.patient_id, input.patient_id))
  if (!pt) throw new HttpError(404, 'Choose the patient this folder belongs to.')

  const read = ev.fields as EventField[]
  const known = new Set(read.map((x) => x.key))
  const out: EventField[] = read.map((x) => {
    const confirmed = (input.values[x.key] ?? x.value).trim()
    return { ...x, confirmed, correct: norm(confirmed) === norm(x.value) }
  })
  // A field the nurse had to add because the machine missed it counts against accuracy.
  for (const [key, v] of Object.entries(input.values)) {
    if (known.has(key) || !v.trim()) continue
    out.push({ key, label: key, group: key.startsWith('allergy') ? 'allergy' : key.startsWith('family') ? 'family' : key.startsWith('visit') ? 'visit' : 'identity', raw: '', value: '', confidence: 0, review: true, source: 'rules', confirmed: v.trim(), correct: false })
  }
  const counted = out.filter((x) => norm(x.value) || norm(x.confirmed ?? ''))
  const correct = counted.filter((x) => x.correct).length
  const val = (k: string) => (out.find((x) => x.key === k)?.confirmed ?? '').trim()

  // 1. The patient's own details: only fill blanks or correct what staff confirmed; the name and birthdate were used to find the patient.
  const patch: Record<string, string> = {}
  if (val('contact')) patch.contact = val('contact')
  if (val('civil_status') && ['Single', 'Married', 'Widowed', 'Separated'].includes(val('civil_status'))) patch.civil_status = val('civil_status')
  if (val('philhealth_pin')) patch.philhealth_pin = val('philhealth_pin')
  if (val('folder') && !pt.folder) patch.legacy_folder_no = val('folder')
  if (Object.keys(patch).length) await completeRecord(q, actor, pt.id, patch, 'from scanned folder form')

  // 2. Allergies and family history, skipping what the record already has.
  const have = await q.select().from(t.allergy).where(eq(t.allergy.patient_id, pt.id))
  const haveFh = await q.select().from(t.familyHistory).where(eq(t.familyHistory.patient_id, pt.id))
  let added = 0
  for (const x of out.filter((o) => o.group === 'allergy' && (o.confirmed ?? '').trim())) {
    const [substance, reaction = 'Not stated', sev = ''] = parts(x.confirmed!)
    if (!substance || have.some((a) => norm(a.substance) === norm(substance))) continue
    await addAllergy(q, actor, pt.id, substance, reaction, SEVERITY[sev.toLowerCase() as keyof typeof SEVERITY] ?? 'Moderate')
    added++
  }
  for (const x of out.filter((o) => o.group === 'family' && (o.confirmed ?? '').trim())) {
    const [relative, condition] = parts(x.confirmed!)
    if (!relative || !condition || haveFh.some((h) => norm(h.relative) === norm(relative) && norm(h.condition) === norm(condition))) continue
    await addFamilyHistory(q, actor, pt.id, relative, condition, 'From the scanned folder form')
    added++
  }

  // 3. Keep the page itself with the record, so the paper can be checked against what was entered.
  let page_id: string | undefined
  let file = input.file
  if (!file && ev.image_file) {
    const img = await readScan(ev.image_file)
    file = `data:${img.type};base64,${img.bytes.toString('base64')}`
  }
  if (file) page_id = await uploadScan(q, actor, pt.id, file, 'Chart', new Date().toISOString().slice(0, 10))
  if (ev.image_file) await removeScan(ev.image_file)

  await q
    .update(t.recognitionEvent)
    .set({ status: 'confirmed', patient_id: pt.id, page_id: page_id ?? null, review_ms: Math.max(0, Math.round(input.review_ms)), field_count: counted.length, correct_count: correct, fields: out, confirmed_at: nowMs(), image_file: null })
    .where(eq(t.recognitionEvent.event_id, eventId))
  await audit(q, actor.staff_id, {
    action: 'edit',
    table: 'recognition_event',
    record: pt.id,
    summary: `Confirmed a scanned folder form for ${val('full_name') || 'a patient'} (${correct} of ${counted.length} fields read correctly, ${added} entries added)`,
    detail: `Visits and regular medicines are kept with the scan: ${out.filter((o) => o.group === 'visit' || o.group === 'medicines').map((o) => o.confirmed).filter(Boolean).join('; ')}`,
  })
  return { ok: true, added, correct, field_count: counted.length, page_id }
}

export async function recognitionMetrics(q: Q) {
  const rows = await q.select().from(t.recognitionEvent).where(eq(t.recognitionEvent.status, 'confirmed')).orderBy(desc(t.recognitionEvent.confirmed_at)).limit(500)
  const [drafts] = await q.select({ n: sql<number>`count(*)::int` }).from(t.recognitionEvent).where(eq(t.recognitionEvent.status, 'draft'))
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0)
  const fieldsTotal = sum((r) => r.field_count)
  const byField = new Map<string, { label: string; total: number; correct: number }>()
  const byGroup = new Map<string, { total: number; correct: number }>()
  for (const r of rows) {
    for (const f of r.fields as EventField[]) {
      if (!norm(f.value) && !norm(f.confirmed ?? '')) continue
      const key = /_\d+$/.test(f.key) ? f.key.replace(/_\d+$/, '') : f.key
      const label = /_\d+$/.test(f.key) ? (PLURAL[f.key.replace(/_\d+$/, '')] ?? f.label) : f.label
      const a = byField.get(key) ?? { label, total: 0, correct: 0 }
      a.total++
      if (f.correct) a.correct++
      byField.set(key, a)
      const g = byGroup.get(f.group) ?? { total: 0, correct: 0 }
      g.total++
      if (f.correct) g.correct++
      byGroup.set(f.group, g)
    }
  }
  const avg = (n: number) => (rows.length ? Math.round(n / rows.length) : 0)
  const pct = (c: number, n: number) => (n ? Math.round((c / n) * 1000) / 10 : 0)
  const totalMs = (r: (typeof rows)[number]) => r.ocr_ms + r.parse_ms + (r.review_ms ?? 0)
  return {
    scans: rows.length,
    drafts: drafts?.n ?? 0,
    fields: fieldsTotal,
    correct: sum((r) => r.correct_count),
    accuracy: pct(sum((r) => r.correct_count), fieldsTotal),
    machine_ms: avg(sum((r) => r.ocr_ms + r.parse_ms)),
    review_ms: avg(sum((r) => r.review_ms ?? 0)),
    total_ms: avg(sum(totalMs)),
    fastest_ms: rows.length ? Math.min(...rows.map(totalMs)) : 0,
    perfect: rows.filter((r) => r.correct_count === r.field_count && r.field_count > 0).length,
    by_field: [...byField.entries()].map(([key, v]) => ({ key, label: v.label, total: v.total, correct: v.correct, accuracy: pct(v.correct, v.total) })).sort((a, b) => a.accuracy - b.accuracy),
    by_group: [...byGroup.entries()].map(([group, v]) => ({ group, total: v.total, correct: v.correct, accuracy: pct(v.correct, v.total) })),
    // oldest first, for the trend chart
    recent: rows
      .slice(0, 30)
      .reverse()
      .map((r, i) => ({ n: i + 1, at: r.confirmed_at, accuracy: pct(r.correct_count, r.field_count), seconds: Math.round(totalMs(r) / 100) / 10, machine_ms: r.ocr_ms + r.parse_ms, parse_engine: r.parse_engine })),
    engines: [...new Set(rows.map((r) => r.parse_engine))],
  }
}
