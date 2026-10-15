import { HttpError } from '@/server/core'
import { route } from '@/server/http'
import { listAudit } from '@/server/services/auditlog'

export const dynamic = 'force-dynamic'

/** Older audit entries, newest first: ?before=<ms>&before_id=<log id>&limit=<1..500>. Doctor only. */
export const GET = route({ roles: ['doctor'], read: true }, ({ db, req }) => {
  const p = new URL(req.url).searchParams
  const before = p.get('before')
  const limit = p.get('limit')
  if ((before !== null && !/^\d+$/.test(before)) || (limit !== null && !/^\d+$/.test(limit))) throw new HttpError(400, 'before and limit must be whole numbers.')
  return listAudit(db, { before: before === null ? undefined : Number(before), beforeId: p.get('before_id') ?? undefined, limit: limit === null ? undefined : Number(limit) })
})
