import { route, z } from '@/server/http'
import { addFamilyHistory } from '@/server/services/records'

const Body = z.object({ relative: z.string().trim().min(1).max(60), condition: z.string().trim().min(1).max(200), notes: z.string().max(1000).optional() })

export const POST = route({ body: Body }, ({ tx, actor, body, params }) => addFamilyHistory(tx, actor, params.id, body.relative, body.condition, body.notes))
