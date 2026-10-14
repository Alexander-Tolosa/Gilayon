import { route, z } from '@/server/http'
import { markAuditSeen } from '@/server/services/admin'

/** "I have seen the activity up to here." Each doctor keeps their own mark. */
export const POST = route({ roles: ['doctor'], body: z.object({ up_to: z.number() }) }, ({ tx, actor, body }) => markAuditSeen(tx, actor, body.up_to))
