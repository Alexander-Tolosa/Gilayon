import { route, z } from '@/server/http'
import { createDependent } from '@/server/services/records'

const Body = z.object({
  person: z.object({
    full_name: z.string().min(1),
    birthdate: z.string(),
    sex: z.enum(['Female', 'Male']),
    contact: z.string(),
    civil_status: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
    philhealth_pin: z.string().optional(),
    pwd_id: z.string().optional(),
  }),
  type: z.enum(['Spouse', 'Child', 'Parent', 'Sibling']),
  mdr: z.boolean(),
})

export const POST = route({ body: Body }, async ({ tx, actor, body, params }) => ({
  patient_id: await createDependent(tx, actor, params.id, body.person, body.type, body.mdr),
}))
