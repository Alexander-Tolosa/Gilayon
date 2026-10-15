import { route } from '@/server/http'
import { openPendingScan } from '@/server/services/recognition'

export const GET = route({ read: true }, async ({ tx, actor, params }) => openPendingScan(tx, actor, params.id))
