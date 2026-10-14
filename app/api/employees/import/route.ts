import { route, z } from '@/server/http'
import { importEmployees } from '@/server/services/records'

const Row = z.object({
  employee_no: z.string().min(1),
  full_name: z.string().min(1),
  birthdate: z.string(),
  sex: z.enum(['Female', 'Male']),
  office: z.string(),
  position: z.string(),
  contact: z.string().optional(),
})

export const POST = route({ roles: ['doctor'], body: z.object({ rows: z.array(Row).max(5000), source: z.string() }) }, ({ tx, actor, body }) => importEmployees(tx, actor, body.rows, body.source))
