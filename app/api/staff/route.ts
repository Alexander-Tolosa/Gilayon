import { route, z } from '@/server/http'
import { createStaff } from '@/server/services/admin'

const Body = z.object({
  name: z.string().min(2),
  role: z.enum(['doctor', 'desk', 'nurse']),
  title: z.string().min(2),
  license_no: z.string().optional(),
  ptr_no: z.string().optional(),
  services: z.array(z.enum(['Medical', 'Dental', 'Laboratory'])).optional(),
  room: z.string().optional(),
  password: z.string().min(1),
})

export const POST = route({ roles: ['doctor'], body: Body }, async ({ tx, actor, body }) => ({ staff_id: await createStaff(tx, actor, body) }))
