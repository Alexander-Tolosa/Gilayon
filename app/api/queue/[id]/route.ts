import { route, z } from '@/server/http'
import { setTicketStatus } from '@/server/services/queue'

const Body = z.object({ status: z.enum(['waiting', 'called', 'in_consult', 'done', 'left']) })

export const PATCH = route({ body: Body }, ({ tx, actor, body, params }) => setTicketStatus(tx, actor, params.id, body.status))
