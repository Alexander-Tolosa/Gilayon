import { HttpError } from '@/server/core'
import { route, z } from '@/server/http'
import { voidDocument } from '@/server/services/clinical'

export const POST = route({ roles: ['doctor'], body: z.object({ reason: z.string().min(1) }) }, ({ tx, actor, body, params }) => {
  if (params.kind !== 'rx' && params.kind !== 'doc') throw new HttpError(404, 'Unknown document kind')
  return voidDocument(tx, actor, params.kind, params.id, body.reason)
})
