import { route, z } from '@/server/http'
import { issueTicket } from '@/server/services/queue'

const Body = z.object({
  ticket_id: z.string().optional(),
  patient_id: z.string(),
  categories: z.array(z.enum(['urgent', 'pregnant', 'pwd', 'senior', 'regular'])),
  service: z.enum(['Medical', 'Dental', 'Laboratory']),
  reason: z.string().default(''),
})

export const POST = route({ body: Body }, async ({ tx, actor, body }) => ({
  ticket_id: await issueTicket(tx, actor, body.patient_id, body.categories, body.service, body.reason, body.ticket_id),
}))
