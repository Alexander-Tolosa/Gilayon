import { route, z } from '@/server/http'
import { signDocuments } from '@/server/services/clinical'

const Body = z.object({ refs: z.array(z.object({ kind: z.enum(['rx', 'doc']), id: z.string() })).min(1), pin: z.string().regex(/^\d{4}$/) })

export const POST = route({ roles: ['doctor'], body: Body }, async ({ tx, actor, body }) => ({ result: await signDocuments(tx, actor, body.refs, body.pin) }))
