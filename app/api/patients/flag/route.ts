import { route, z } from '@/server/http'
import { flagForHR } from '@/server/services/records'

export const POST = route({ body: z.object({ person_id: z.string(), note: z.string().trim().min(1).max(500) }) }, ({ tx, actor, body }) => flagForHR(tx, actor, body.person_id, body.note))
