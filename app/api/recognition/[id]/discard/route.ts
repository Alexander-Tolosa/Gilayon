import { route } from '@/server/http'
import { discardPendingScan } from '@/server/services/recognition'

export const POST = route({}, async ({ tx, actor, params }) => discardPendingScan(tx, actor, params.id))
