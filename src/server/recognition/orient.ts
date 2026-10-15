import sharp from 'sharp'
import { ocrImage, type OcrResult } from './ocr'

/*
  A page photographed sideways or upside down. The phone's own orientation tag covers a picture taken in the camera app, but
  a page photographed flat on a desk or uploaded from a scanner folder often arrives turned, and then the reader gets worse in
  every way: on a real record the vision model misread the name, the birthday and the contact number, and wrote visits that
  were not on the page. The OCR scores how readable a page is, and a page the wrong way round reads as nonsense, so the four
  turns are tried on a small copy and the best one is kept. Nothing is sent anywhere: it runs in this process.
*/

export type Turn = 0 | 90 | 180 | 270

/** Characters in rows the engine was sure of. A page the wrong way round has almost none. */
const solid = (r: OcrResult) => r.lines.filter((l) => l.confidence >= 60).reduce((a, l) => a + l.text.length, 0)

/** Enough sure text to say the page is already the right way up, so the other turns are not tried. */
const READABLE = 120

/** Turns a photo the right way up. Returns the picture as it came when it already is, or when no turn clearly reads better. */
export async function uprightBytes(bytes: Buffer): Promise<{ bytes: Buffer; turned: Turn }> {
  try {
    const oriented = await sharp(bytes, { failOn: 'none' }).rotate().jpeg({ quality: 92 }).toBuffer() // the phone's orientation tag first
    const small = await sharp(oriented).resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).grayscale().normalise().png().toBuffer()
    const score = async (deg: Turn) => solid(await ocrImage(deg ? await sharp(small).rotate(deg).png().toBuffer() : small, { prepare: false }))
    const straight = await score(0)
    if (straight >= READABLE) return { bytes, turned: 0 }
    let best: { deg: Turn; score: number } = { deg: 0, score: straight }
    for (const deg of [90, 270, 180] as const) {
      const s = await score(deg)
      if (s > best.score) best = { deg, score: s }
    }
    // A turn has to read clearly better, not just marginally: a mostly handwritten page scores low whichever way it faces.
    if (best.deg === 0 || best.score < Math.max(60, straight * 1.6)) return { bytes, turned: 0 }
    return { bytes: await sharp(oriented).rotate(best.deg).jpeg({ quality: 92 }).toBuffer(), turned: best.deg }
  } catch {
    return { bytes, turned: 0 } // never let the check itself stop a scan
  }
}
