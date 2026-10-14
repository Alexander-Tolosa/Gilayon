import { route, z } from '@/server/http'
import { updateCategoryRank } from '@/server/services/admin'

export const PATCH = route({ roles: ['doctor'], body: z.object({ rank: z.number().int() }) }, ({ tx, actor, body, params }) => updateCategoryRank(tx, actor, params.id, body.rank))
