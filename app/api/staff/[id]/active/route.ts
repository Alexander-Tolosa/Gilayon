import { route, z } from '@/server/http'
import { setStaffActive } from '@/server/services/admin'

export const POST = route({ roles: ['doctor'], body: z.object({ active: z.boolean() }) }, ({ tx, actor, body, params }) => setStaffActive(tx, actor, params.id, body.active))
