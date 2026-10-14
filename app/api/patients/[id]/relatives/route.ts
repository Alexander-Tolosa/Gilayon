import { route, z } from '@/server/http'
import { linkRelative } from '@/server/services/records'

const Body = z.object({ related_patient_id: z.string(), type: z.enum(['Spouse', 'Child', 'Parent', 'Sibling']), mdr: z.boolean() })

export const POST = route({ body: Body }, ({ tx, actor, body, params }) => linkRelative(tx, actor, params.id, body.related_patient_id, body.type, body.mdr))
