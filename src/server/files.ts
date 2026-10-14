import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { eq, like } from 'drizzle-orm'
import { scannedPage } from '../../db/schema'
import { HttpError } from './core'
import type { Db } from './db'

/*
  Scanned pages live as files on the server PC, not in the database: the database stays small and
  fast to back up, and a scan is only ever served through an authenticated route.
  The database row keeps "disk:<name>"; <name> is generated here and checked on every read, so a
  file name can never point outside the scans folder.
*/

export const MAX_SCAN_BYTES = 2_500_000
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const
const NAME = /^[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$/

const dir = () => path.resolve(process.env.UPLOADS_DIR ?? './uploads', 'scans')

/** Real image bytes only: the claimed type has to match the file's own signature. */
function sniff(bytes: Buffer): keyof typeof MIME | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (bytes.length > 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp'
  return null
}

export function decodeImage(dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new HttpError(400, 'Scans must be JPG, PNG or WebP images.')
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_SCAN_BYTES) throw new HttpError(413, 'Scan must be under 2.5 MB.')
  const kind = sniff(bytes)
  if (!kind || TYPES[m[1] as keyof typeof TYPES] !== kind) throw new HttpError(400, 'That file is not a valid image.')
  return { bytes, ext: kind }
}

/** Writes the image and returns the value stored in the database. */
export async function storeScan(dataUrl: string, id: string): Promise<string> {
  const { bytes, ext } = decodeImage(dataUrl)
  const name = `${id}.${ext}`
  if (!NAME.test(name)) throw new HttpError(400, 'Invalid scan id.')
  await mkdir(dir(), { recursive: true })
  await writeFile(path.join(dir(), name), bytes, { flag: 'wx', mode: 0o600 })
  return `disk:${name}`
}

export async function removeScan(file: string) {
  const name = file.slice(5)
  if (file.startsWith('disk:') && NAME.test(name)) await unlink(path.join(dir(), name)).catch(() => undefined)
}

export async function readScan(file: string) {
  const name = file.startsWith('disk:') ? file.slice(5) : ''
  if (!NAME.test(name)) throw new HttpError(404, 'Scan not found')
  try {
    const ext = name.split('.').pop() as keyof typeof MIME
    return { bytes: await readFile(path.join(dir(), name)), type: MIME[ext] }
  } catch {
    throw new HttpError(404, 'The scan file is missing on the server.')
  }
}

export const newScanId = () => randomBytes(16).toString('hex')

/** One-time move of scans stored in the database by the first version onto disk. Safe to repeat. */
export async function moveScansToDisk(db: Db) {
  const rows = await db.select().from(scannedPage).where(like(scannedPage.file, 'data:image/%'))
  for (const r of rows) {
    try {
      const file = await storeScan(r.file, r.page_id)
      await db.update(scannedPage).set({ file }).where(eq(scannedPage.page_id, r.page_id))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') await db.update(scannedPage).set({ file: `disk:${r.page_id}.jpg` }).where(eq(scannedPage.page_id, r.page_id))
      else console.error(`Could not move scan ${r.page_id} to disk`, e)
    }
  }
}
