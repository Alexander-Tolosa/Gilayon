import path from 'node:path'
import { createWorker, type Worker } from 'tesseract.js'
import { prepareImage, type PrepareOptions } from './prepare'

/*
  Local OCR. Tesseract runs as WebAssembly inside this server process with its language file read from
  node_modules, so no image and no text ever leaves the clinic and no internet is needed. One worker is
  kept warm between scans: the first scan after start-up pays about a quarter second to load it.
*/

export type OcrLine = { text: string; confidence: number }
/** `lines` are rebuilt from word positions; `alt` are the engine's own rows. Each reads some pages better, so both are kept. */
export type OcrResult = { lines: OcrLine[]; alt: OcrLine[]; text: string; ms: number; engine: string }

const langPath = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'node_modules/@tesseract.js-data/eng/4.0.0_best_int')

type Box = { x0: number; y0: number; x1: number; y1: number }
type RawWord = { text: string; confidence: number; bbox: Box }
type RawBlock = { paragraphs: { lines: { words: RawWord[] }[] }[] }

/**
 * Reads word by word, then rebuilds the rows from where the words sit. On this form a label and its answer
 * share a row but have different heights and fonts, and the engine's own row finder splits them apart.
 */
function regroup(blocks: RawBlock[]): OcrLine[] {
  const words = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))).filter((w) => w.text.trim())
  if (!words.length) return []
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const tol = heights[Math.floor(heights.length / 2)] * Number(process.env.OCR_TOL ?? 1.4)
  const mid = (w: RawWord) => (w.bbox.y0 + w.bbox.y1) / 2
  const rows: { y: number; words: RawWord[] }[] = []
  for (const w of [...words].sort((a, b) => mid(a) - mid(b))) {
    const row = rows.find((r) => Math.abs(r.y - mid(w)) <= tol)
    if (row) {
      row.words.push(w)
      row.y = row.words.reduce((a, x) => a + mid(x), 0) / row.words.length
    } else rows.push({ y: mid(w), words: [w] })
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) => {
      const ws = r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0)
      return { text: ws.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(), confidence: Math.round(ws.reduce((a, w) => a + w.confidence, 0) / ws.length) }
    })
    .filter((l) => l.text)
}

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
export function ocrImage(image: Buffer, opts: PrepareOptions & { prepare?: boolean } = {}): Promise<OcrResult> {
  const run = async (): Promise<OcrResult> => {
    const t0 = Date.now()
    const w = await getWorker()
    const clean = opts.prepare === false || process.env.OCR_PREPARE === '0' ? image : await prepareImage(image, opts)
    await w.setParameters({ tessedit_pageseg_mode: (process.env.OCR_PSM ?? '11') as never, preserve_interword_spaces: '1' })
    const { data } = await w.recognize(clean, {}, { text: true, blocks: true })
    const lines = regroup(data.blocks ?? [])
    await w.setParameters({ tessedit_pageseg_mode: '3' as never })
    const second = await w.recognize(clean, {}, { text: true, blocks: true })
    const alt = (second.data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), confidence: Math.round(l.confidence) }))
      .filter((l) => l.text)
    return { lines, alt, text: lines.map((l) => l.text).join('\n'), ms: Date.now() - t0, engine: 'Tesseract 7 (local)' }
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
