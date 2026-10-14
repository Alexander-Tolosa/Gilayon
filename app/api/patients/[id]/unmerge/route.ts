import { route, z } from '@/server/http'
import { unmergePatient } from '@/server/services/merge'

/** Only a doctor can undo a merge. */
export const POST = route({ roles: ['doctor'], body: z.object({ reason: z.string() }) }, ({ tx, actor, body, params }) => unmergePatient(tx, actor, params.id, body.reason))
