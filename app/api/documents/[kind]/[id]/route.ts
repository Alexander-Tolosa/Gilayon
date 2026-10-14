import { HttpError } from '@/server/core'
import { route, z } from '@/server/http'
import { editDraft } from '@/server/services/clinical'

const Body = z.object({
  items: z.array(z.object({ drug_name: z.string().min(1), dose: z.string(), frequency: z.string(), quantity: z.number().int().positive() })).optional(),
  purpose: z.string().optional(),
  findings: z.string().optional(),
  rest_days: z.number().int().nullable().optional(),
  remarks: z.string().nullable().optional(),
})

export const PATCH = route({ roles: ['doctor'], body: Body }, ({ tx, actor, body, params }) => {
  if (params.kind !== 'rx' && params.kind !== 'doc') throw new HttpError(404, 'Unknown document kind')
  return editDraft(tx, actor, params.kind, params.id, body)
})
