import { eq } from 'drizzle-orm'
import { scannedPage } from '../../../../../db/schema'
import { HttpError } from '@/server/core'
import { readScan } from '@/server/files'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** A scanned page. Signed-in staff only; never cached by the browser or a proxy. */
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  let file = ''
  let type = ''
  const res = await route({ read: true }, async ({ db, params }) => {
    const [row] = await db.select().from(scannedPage).where(eq(scannedPage.page_id, params.id))
    if (!row) throw new HttpError(404, 'Scan not found')
    const out = await readScan(row.file)
    file = out.bytes.toString('base64')
    type = out.type
    return { ok: true }
  })(req, ctx)
  if (!res.ok) return res
  return new Response(Buffer.from(file, 'base64'), { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
