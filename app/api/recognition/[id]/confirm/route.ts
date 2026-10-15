import { route, z } from '@/server/http'
import { confirmScan } from '@/server/services/recognition'

const Body = z.object({
  patient_id: z.string().min(1),
  values: z.record(z.string(), z.string().max(500)),
  review_ms: z.number().min(0).max(3_600_000),
  file: z.string().optional(),
})

export const POST = route({ body: Body }, async ({ tx, actor, body, params }) => confirmScan(tx, actor, params.id, body))
