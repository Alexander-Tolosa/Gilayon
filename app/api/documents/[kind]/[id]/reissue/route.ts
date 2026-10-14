import { HttpError } from '@/server/core'
import { route, z } from '@/server/http'
import { reissueDocument } from '@/server/services/clinical'

export const POST = route({ roles: ['doctor'], body: z.object({ new_id: z.string().min(1) }) }, async ({ tx, actor, body, params }) => {
  if (params.kind !== 'rx' && params.kind !== 'doc') throw new HttpError(404, 'Unknown document kind')
  return { id: await reissueDocument(tx, actor, params.kind, params.id, body.new_id) }
})
