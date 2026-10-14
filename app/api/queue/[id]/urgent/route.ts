import { route } from '@/server/http'
import { markUrgent } from '@/server/services/queue'

export const POST = route({}, ({ tx, actor, params }) => markUrgent(tx, actor, params.id))
