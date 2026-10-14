import { route } from '@/server/http'
import { callTicket } from '@/server/services/queue'

export const POST = route({ roles: ['doctor'] }, ({ tx, actor, params }) => callTicket(tx, actor, params.id))
