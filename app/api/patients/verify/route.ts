import { route, z } from '@/server/http'
import { verifyIdentity } from '@/server/services/records'

const Body = z.object({
  person_id: z.string(),
  full_name: z.string(),
  birthdate: z.string(),
  employee_no: z.string().optional(),
  principal_no: z.string().optional(),
})

export const POST = route({ body: Body }, ({ tx, actor, body }) => {
  const { person_id, ...entered } = body
  return verifyIdentity(tx, actor, person_id, entered)
})
