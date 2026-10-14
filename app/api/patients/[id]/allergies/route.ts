import { route, z } from '@/server/http'
import { addAllergy } from '@/server/services/records'

const Body = z.object({ substance: z.string().min(1), reaction: z.string().min(1), severity: z.enum(['Mild', 'Moderate', 'Severe']) })

export const POST = route({ body: Body }, ({ tx, actor, body, params }) => addAllergy(tx, actor, params.id, body.substance, body.reaction, body.severity))
