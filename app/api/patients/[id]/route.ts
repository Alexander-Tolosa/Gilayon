import { route, z } from '@/server/http'
import { completeRecord } from '@/server/services/records'

const Body = z.object({
  patch: z.object({
    full_name: z.string().min(1),
    birthdate: z.string(),
    sex: z.enum(['Female', 'Male']),
    contact: z.string(),
    civil_status: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
    pwd_id: z.string(),
    philhealth_pin: z.string(),
    legacy_folder_no: z.string(),
    hr_flag: z.string(),
  }).partial(),
  reason: z.string().optional(),
})

export const PATCH = route({ body: Body }, ({ tx, actor, body, params }) => completeRecord(tx, actor, params.id, body.patch, body.reason))
