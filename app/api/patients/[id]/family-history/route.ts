import { route, z } from '@/server/http'
import { addFamilyHistory } from '@/server/services/records'

const Body = z.object({ relative: z.string().min(1), condition: z.string().min(1), notes: z.string().optional() })

export const POST = route({ body: Body }, ({ tx, actor, body, params }) => addFamilyHistory(tx, actor, params.id, body.relative, body.condition, body.notes))
