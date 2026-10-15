import { route, z } from '@/server/http'
import { Birthdate, Short } from '@/server/schemas'
import { completeRecord } from '@/server/services/records'

const Body = z.object({
  patch: z.object({
    full_name: z.string().trim().min(1).max(120),
    birthdate: Birthdate,
    sex: z.enum(['Female', 'Male']),
    contact: Short(120),
    civil_status: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
    pwd_id: Short(40),
    philhealth_pin: Short(20),
    legacy_folder_no: Short(40),
    hr_flag: Short(500),
  }).partial(),
  reason: Short(300).optional(),
})

export const PATCH = route({ body: Body }, ({ tx, actor, body, params }) => completeRecord(tx, actor, params.id, body.patch, body.reason))
