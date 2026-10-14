import { route, z } from '@/server/http'
import { updateStaffDetails } from '@/server/services/admin'

const Body = z.object({
  name: z.string(),
  title: z.string(),
  role: z.enum(['doctor', 'desk', 'nurse']),
  license_no: z.string(),
  ptr_no: z.string(),
  services: z.array(z.enum(['Medical', 'Dental', 'Laboratory'])),
  room: z.string(),
}).partial()

export const PATCH = route({ roles: ['doctor'], body: Body }, ({ tx, actor, body, params }) => updateStaffDetails(tx, actor, params.id, body))
