import { route } from '@/server/http'
import { pendingScans } from '@/server/services/recognition'

export const GET = route({ read: true }, async ({ tx, actor }) => pendingScans(tx, actor))
