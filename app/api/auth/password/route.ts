import { route, z } from '@/server/http'
import { changeOwnPassword } from '@/server/services/admin'

/** Any signed-in staff member can change their own password. */
export const POST = route({ body: z.object({ current: z.string(), next: z.string() }) }, ({ tx, actor, body }) => changeOwnPassword(tx, actor, body.current, body.next))
