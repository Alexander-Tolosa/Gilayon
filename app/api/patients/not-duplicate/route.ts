import { route, z } from '@/server/http'
import { markNotDuplicate } from '@/server/services/merge'

export const POST = route({ body: z.object({ a: z.string().min(1), b: z.string().min(1) }) }, ({ tx, actor, body }) => markNotDuplicate(tx, actor, body.a, body.b))
