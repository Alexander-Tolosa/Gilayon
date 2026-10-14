import { route, z } from '@/server/http'
import { changePin } from '@/server/services/admin'

export const POST = route({ roles: ['doctor'], body: z.object({ current: z.string(), next: z.string() }) }, async ({ tx, actor, body }) => ({ ok: await changePin(tx, actor, body.current, body.next) }))
