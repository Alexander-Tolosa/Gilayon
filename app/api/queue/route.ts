import { route, z } from '@/server/http'
import { issueTicket } from '@/server/services/queue'

const Body = z.object({
  ticket_id: z.string().optional(),
  patient_id: z.string(),
  categories: z.array(z.enum(['urgent', 'pregnant', 'pwd', 'senior', 'regular'])),
  service: z.enum(['Medical', 'Dental', 'Laboratory']),
  reason: z.string().max(500).default(''),
  // Taken at the front desk; each reading is a short string, blank ones are dropped.
  vitals: z
    .object({ bp: z.string().max(20), temperature: z.string().max(10), pulse: z.string().max(10), respiration: z.string().max(10), height: z.string().max(10), weight: z.string().max(10) })
    .partial()
    .optional(),
})

export const POST = route({ body: Body }, async ({ tx, actor, body }) => ({
  ticket_id: await issueTicket(tx, actor, body.patient_id, body.categories, body.service, body.reason, body.ticket_id, body.vitals),
}))
