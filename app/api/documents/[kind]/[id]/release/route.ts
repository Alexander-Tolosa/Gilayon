import { HttpError } from '@/server/core'
import { route } from '@/server/http'
import { releaseDocument } from '@/server/services/clinical'

// The front desk stamps a signed document and gives it to the patient; the doctor may do it too.
export const POST = route({}, async ({ tx, actor, params }) => {
  if (params.kind !== 'rx' && params.kind !== 'doc') throw new HttpError(404, 'Unknown document kind')
  return { result: await releaseDocument(tx, actor, params.kind, params.id) }
})
