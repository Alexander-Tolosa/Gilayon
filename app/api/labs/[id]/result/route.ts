import { route, z } from '@/server/http'
import { addLabResult } from '@/server/services/clinical'

export const POST = route({ body: z.object({ result: z.string().trim().min(1).max(2000) }) }, ({ tx, actor, body, params }) => addLabResult(tx, actor, params.id, body.result))
