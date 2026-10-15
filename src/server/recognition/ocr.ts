import path from 'node:path'
import { createWorker, type Worker } from 'tesseract.js'

/*
  Local OCR. Tesseract runs as WebAssembly inside this server process with its language file read from
  node_modules, so no image and no text ever leaves the clinic and no internet is needed. One worker is
  kept warm between scans: the first scan after start-up pays about a quarter second to load it.
*/

export type OcrLine = { text: string; confidence: number }
export type OcrResult = { lines: OcrLine[]; text: string; ms: number; engine: string }

const langPath = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0_best_int')

let worker: Promise<Worker> | null = null
let queue: Promise<unknown> = Promise.resolve()

function getWorker() {
  worker ??= createWorker('eng', 1, { langPath: langPath(), cacheMethod: 'none' }).catch((e) => {
    worker = null
    throw e
  })
  return worker
}

/** Scans are read one at a time: a single worker, and a queue in front of it. */
export function ocrImage(image: Buffer): Promise<OcrResult> {
  const run = async (): Promise<OcrResult> => {
    const t0 = Date.now()
    const w = await getWorker()
    const { data } = await w.recognize(image, {}, { text: true, blocks: true })
    const lines = (data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), confidence: Math.round(l.confidence) }))
      .filter((l) => l.text)
    return { lines, text: lines.map((l) => l.text).join('\n'), ms: Date.now() - t0, engine: 'Tesseract 7 (local)' }
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
