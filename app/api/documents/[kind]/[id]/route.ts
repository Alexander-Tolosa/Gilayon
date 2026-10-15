import { HttpError } from '@/server/core'
import { route } from '@/server/http'
import { DraftPatch as Body } from '@/server/schemas'
import { editDraft } from '@/server/services/clinical'

export const PATCH = route({ roles: ['doctor'], body: Body }, ({ tx, actor, body, params }) => {
  if (params.kind !== 'rx' && params.kind !== 'doc') throw new HttpError(404, 'Unknown document kind')
  return editDraft(tx, actor, params.kind, params.id, body)
})
