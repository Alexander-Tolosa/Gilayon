import { route, z } from '@/server/http'
import { resetPassword } from '@/server/services/admin'

export const POST = route({ roles: ['doctor'], body: z.object({ temporary: z.string() }) }, ({ tx, actor, body, params }) => resetPassword(tx, actor, params.id, body.temporary))
