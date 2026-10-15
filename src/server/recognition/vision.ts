import sharp from 'sharp'
import { HttpError } from '../core'
import { formSchema, ollamaUrl } from './parse'

/*
  The optional handwriting reader. A local vision model (Qwen2.5-VL through Ollama) looks at the picture
  itself, instead of reading the text Tesseract found. On handwriting it is much better than the OCR,
  but it takes about half a minute a page and, unlike OCR, it can write a plausible wrong word, so its
  answers are always proposals for a person to check (see mergeVision in parse.ts).

  It runs on this PC, with no internet. Nothing is sent anywhere. It is off unless someone asks for it
  on the scan screen, and the screen says plainly when the model is not installed.
*/

export type VisionStatus = { available: boolean; model: string; reason?: string }

export const visionModel = () => process.env.OLLAMA_VISION_MODEL ?? 'qwen2.5vl:3b'

export async function visionStatus(): Promise<VisionStatus> {
  const model = visionModel()
  if (process.env.OLLAMA_DISABLED === '1') return { available: false, model, reason: 'Turned off (OLLAMA_DISABLED=1).' }
  try {
    const res = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(800) })
    if (!res.ok) return { available: false, model, reason: `Ollama answered ${res.status}.` }
    const data = (await res.json()) as { models?: { name: string }[] }
    const has = (data.models ?? []).some((m) => m.name === model || (!model.includes(':') && m.name.split(':')[0] === model))
    return has ? { available: true, model } : { available: false, model, reason: `The handwriting model is not installed. Run: ollama pull ${model}` }
  } catch {
    return { available: false, model, reason: 'Ollama is not running on this PC (port 11434).' }
  }
}

const PROMPT =
  'This is a photo of a paper patient-folder form. Read the filled-in answers exactly as written, including handwriting. ' +
  'Return JSON with: folder (FOLDER NO.), full_name (FULL NAME), birthdate (BIRTHDATE as YYYY-MM-DD), sex, civil_status (CIVIL STATUS), contact (CONTACT NO.), ' +
  'philhealth_pin (PHILHEALTH PIN), allergies (each filled line under ALLERGIES, as "substance - reaction - severity"), ' +
  'family_history (each filled line under FAMILY HISTORY, as "relative - condition"), medicines (REGULAR MEDICINES), ' +
  'visits (each filled line under LAST VISITS, as "date - complaint"), ' +
  'page_text (the whole page written out, top to bottom, every filled-in line including the ones used for the fields above, each as "label: answer" exactly as written, so nothing on the page is lost). ' +
  'Use "" or [] for anything left blank on the form. Copy text exactly as written; never guess, correct spelling, translate, or add anything that is not on the page.'

/** Long edge sent to the model. A full-size phone photo would use far more of the model's memory for no gain in accuracy. */
const MAX_EDGE = Number(process.env.OLLAMA_VISION_EDGE ?? 1800)

async function prepare(bytes: Buffer, flip: boolean) {
  let img = sharp(bytes, { failOn: 'none' }).rotate() // honours the phone's own orientation tag
  if (flip) img = img.flop() // a mirrored front-camera picture, as the OCR path also corrects
  return (await img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString('base64')
}

/** Asks the model to read the form picture. Throws an HttpError with a plain reason when it cannot. */
export async function readWithVision(bytes: Buffer, opts: { flip?: boolean } = {}): Promise<{ data: Record<string, unknown>; ms: number; model: string }> {
  const st = await visionStatus()
  if (!st.available) throw new HttpError(503, st.reason ?? 'The handwriting reader is not available.')
  const t0 = Date.now()
  const timeout = Number(process.env.OLLAMA_VISION_TIMEOUT_MS ?? 240000)
  let res: Response
  try {
    res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: st.model,
        stream: false,
        format: formSchema,
        // The picture alone is about 4,000 tokens, so the default 4,096-token window would cut it off.
        options: { temperature: 0, num_ctx: 8192 },
        messages: [{ role: 'user', content: PROMPT, images: [await prepare(bytes, !!opts.flip)] }],
      }),
    })
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new HttpError(504, `The handwriting reader took longer than ${Math.round(timeout / 1000)} seconds. Try again, or close other programs to free memory.`)
    throw new HttpError(503, 'Ollama stopped answering while reading this page.')
  }
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? ''
    throw new HttpError(502, `The handwriting reader failed (${res.status})${/memory/i.test(detail) ? ': the computer is out of memory for this model. Close other programs and try again' : ''}.`)
  }
  const body = (await res.json()) as { message?: { content?: string } }
  let data: unknown
  try {
    data = JSON.parse(body.message?.content ?? '')
  } catch {
    throw new HttpError(502, 'The handwriting reader gave an answer that could not be understood. Try again.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(502, 'The handwriting reader gave an answer that could not be understood. Try again.')
  return { data: data as Record<string, unknown>, ms: Date.now() - t0, model: st.model }
}
