import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../src/server/core'
import { mergeVision, type ParsedField } from '../src/server/recognition/parse'
import { readWithVision, visionStatus } from '../src/server/recognition/vision'

const field = (over: Partial<ParsedField>): ParsedField => ({ key: 'medicines', label: 'Regular medicines', group: 'medicines', raw: '', value: '', confidence: 0, review: false, source: 'rules', ...over })
const MODEL = 'qwen2.5vl:3b'

describe('merging the handwriting reader into the rule reader', () => {
  it('fills what the rules missed, always marked for checking', () => {
    const out = mergeVision([], { medicines: 'AMLODIPINE 5MG ONCE DAILY', full_name: 'JOEL MAE VILLANUEVA' }, MODEL)
    const med = out.find((f) => f.key === 'medicines')!
    expect(med).toMatchObject({ value: 'AMLODIPINE 5MG ONCE DAILY', source: 'vision', review: true })
    expect(out.find((f) => f.key === 'full_name')).toMatchObject({ value: 'Joel Mae Villanueva', group: 'identity', source: 'vision', review: true })
  })

  it('replaces a value the rules were unsure of, and says what the rules saw', () => {
    const [f] = mergeVision([field({ value: 'AMLODIPINE sMG ONCE DAILY', confidence: 61 })], { medicines: 'AMLODIPINE 5MG ONCE DAILY' }, MODEL)
    expect(f).toMatchObject({ value: 'AMLODIPINE 5MG ONCE DAILY', source: 'vision', review: true })
    expect(f.note).toContain('AMLODIPINE sMG ONCE DAILY')
  })

  it('keeps a value the rules read cleanly and confidently, but flags the disagreement', () => {
    const rules = field({ key: 'contact', label: 'Contact no.', group: 'identity', value: '0917 555 0142', confidence: 95 })
    const [f] = mergeVision([rules], { contact: '0917 555 0143' }, MODEL)
    expect(f).toMatchObject({ value: '0917 555 0142', source: 'rules', review: true })
    expect(f.note).toContain('0917 555 0143')
  })

  it('never lets the rules vouch for medicines, which have no format check ("5MG" read as "sMG" is still confident)', () => {
    const [f] = mergeVision([field({ value: 'AMLODIPINE sMG ONCE DAILY', confidence: 96 })], { medicines: 'AMLODIPINE 5MG ONCE DAILY' }, MODEL)
    expect(f).toMatchObject({ value: 'AMLODIPINE 5MG ONCE DAILY', source: 'vision', review: true })
    expect(f.note).toContain('sMG')
  })

  it('drops visit lines the rules misfiled under family history when the model saw them as visits', () => {
    const misfiled = field({ key: 'family_3', label: 'Family history 3', group: 'family', value: '2024-05-04 - STOMACH PAIN', confidence: 93 })
    const real = field({ key: 'family_1', label: 'Family history 1', group: 'family', value: 'GRANDMOTHER - CANCER', confidence: 94 })
    const out = mergeVision([real, misfiled], { visits: ['2024-05-04 - STOMACH PAIN'], family_history: ['GRANDMOTHER - CANCER'] }, MODEL)
    expect(out.map((f) => [f.key, f.value])).toEqual([['family_1', 'GRANDMOTHER - CANCER'], ['visit_1', '2024-05-04 - STOMACH PAIN']])
    // without the model's visits there is nothing to say the line is misfiled, so it stays for a person to judge
    expect(mergeVision([misfiled], {}, MODEL)).toEqual([misfiled])
  })

  it('does not add a visit that the model put in the family-history list', () => {
    expect(mergeVision([], { family_history: ['2024-05-04 - STOMACH PAIN', 'BROTHER - DIABETES'] }, MODEL).map((f) => f.value)).toEqual(['BROTHER - DIABETES'])
    expect(mergeVision([], { allergies: ['2024-05-04 - FEVER'] }, MODEL)).toEqual([])
  })

  it('corrects a garbled "NONE", but does not add "NONE" to a form with no medicines field', () => {
    const [f] = mergeVision([field({ value: 'NC NE', confidence: 70 })], { medicines: 'NONE' }, MODEL)
    expect(f).toMatchObject({ value: 'NONE', source: 'vision' })
    expect(mergeVision([], { medicines: 'NONE' }, MODEL)).toEqual([])
  })

  it('leaves a field alone when both readers agree, ignoring case and punctuation', () => {
    const rules = field({ value: 'Losartan 50mg once daily', confidence: 95 })
    expect(mergeVision([rules], { medicines: 'LOSARTAN 50MG ONCE DAILY' }, MODEL)).toEqual([rules])
  })

  it('ignores a value with characters that are not on the form (the model slipped into Chinese)', () => {
    const rules = field({ key: 'visit_1', label: 'Visit 1', group: 'visit', value: '2025-12-23 - COUGH AND C', confidence: 50, review: true })
    const [f] = mergeVision([rules], { visits: ['2025-12-23 - COUGH AND C冷冷S'] }, MODEL)
    expect(f.value).toBe('2025-12-23 - COUGH AND C')
    expect(f.note).toMatch(/not on the form/)
    expect(mergeVision([], { full_name: 'JUAN DELA CRUZ 안녕' }, MODEL)).toEqual([])
  })

  it('ignores values that fail their format check: a date that does not exist, a visit without a complaint', () => {
    const out = mergeVision([], { birthdate: '1987-02-31', visits: ['2025-01-01'], contact: 'call me', philhealth_pin: '12345' }, MODEL)
    expect(out).toEqual([])
  })

  it('adds the lines the rules never found, numbered after the ones they did', () => {
    const rules = field({ key: 'visit_1', label: 'Visit 1', group: 'visit', value: '2025-01-25 - BACK PAIN', confidence: 90 })
    const out = mergeVision([rules], { visits: ['2025-01-25 - BACK PAIN', '2025-08-12 – DENTAL CLEANING'] }, MODEL)
    expect(out.map((f) => [f.key, f.value])).toEqual([
      ['visit_1', '2025-01-25 - BACK PAIN'],
      ['visit_2', '2025-08-12 - DENTAL CLEANING'], // an en dash becomes the form's " - "
    ])
    expect(out[1]).toMatchObject({ group: 'visit', source: 'vision', review: true })
  })

  it('does not add "none", empty strings or empty lists, and never changes its input', () => {
    const input = [field({ key: 'folder', label: 'Folder no.', group: 'identity', value: 'F-2005-0935', confidence: 40 })]
    const copy = JSON.stringify(input)
    expect(mergeVision(input, { medicines: 'none', allergies: [], family_history: ['', '  '], folder: '' }, MODEL)).toEqual(input)
    expect(JSON.stringify(input)).toBe(copy)
  })
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Replaces fetch: /api/tags answers with `models`, /api/chat with whatever `chat` returns. */
function ollama(models: string[], chat?: () => Response | Promise<Response>) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined })
      if (url.endsWith('/api/tags')) return json({ models: models.map((name) => ({ name })) })
      return chat ? chat() : json({ message: { content: '{}' } })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.OLLAMA_DISABLED
  delete process.env.OLLAMA_VISION_MODEL
})

describe('the handwriting reader', () => {
  it('says plainly when the model is not installed, when Ollama is off, or when it is switched off', async () => {
    ollama(['llama3.2:3b'])
    expect(await visionStatus()).toMatchObject({ available: false, model: MODEL, reason: expect.stringContaining('ollama pull qwen2.5vl:3b') })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    expect((await visionStatus()).reason).toMatch(/not running/)
    ollama([MODEL])
    process.env.OLLAMA_DISABLED = '1'
    expect((await visionStatus()).reason).toMatch(/OLLAMA_DISABLED/)
  })

  it('sends a resized picture with a window big enough to hold it, and returns the JSON', async () => {
    const calls = ollama([MODEL], () => json({ message: { content: JSON.stringify({ full_name: 'JUAN DELA CRUZ', allergies: [] }) } }))
    const r = await readWithVision(PNG)
    expect(r.data.full_name).toBe('JUAN DELA CRUZ')
    expect(r.model).toBe(MODEL)
    const chat = calls.find((c) => c.url.endsWith('/api/chat'))!.body!
    expect(chat.model).toBe(MODEL)
    expect((chat.options as { num_ctx: number }).num_ctx).toBeGreaterThanOrEqual(8192) // the page alone is ~4,000 tokens
    expect((chat.messages as { images: string[] }[])[0].images[0]).toMatch(/^\/9j\//) // a JPEG
    expect(chat.format).toMatchObject({ type: 'object' })
  })

  it('uses the model named in OLLAMA_VISION_MODEL', async () => {
    process.env.OLLAMA_VISION_MODEL = 'gemma3:12b'
    const calls = ollama(['gemma3:12b'])
    await readWithVision(PNG)
    expect(calls.find((c) => c.url.endsWith('/api/chat'))!.body!.model).toBe('gemma3:12b')
  })

  const fails = async (chat: () => Response | Promise<Response>, status: number, text: RegExp) => {
    ollama([MODEL], chat)
    const e = await readWithVision(PNG).catch((x) => x)
    expect(e).toBeInstanceOf(HttpError)
    expect(e.status).toBe(status)
    expect(e.message).toMatch(text)
  }

  it('gives a clear reason for each way it can fail', async () => {
    ollama([])
    await expect(readWithVision(PNG)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('ollama pull') })
    await fails(() => json({ message: { content: 'not json at all' } }), 502, /could not be understood/)
    await fails(() => json({ message: { content: '[1,2]' } }), 502, /could not be understood/)
    await fails(() => json({ error: 'model requires more system memory than is available' }, 500), 502, /out of memory/)
    await fails(() => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }, 504, /longer than/)
    await fails(() => { throw new Error('socket hang up') }, 503, /stopped answering/)
  })
})
