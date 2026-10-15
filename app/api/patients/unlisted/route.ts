import { route, z } from '@/server/http'
import { registerUnlisted } from '@/server/services/records'

const Body = z.object({
  patient_id: z.string().optional(),
  person: z.object({
    full_name: z.string().min(1),
    birthdate: z.string(),
    sex: z.enum(['Female', 'Male']),
    contact: z.string(),
    civil_status: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
    philhealth_pin: z.string().optional(),
    pwd_id: z.string().optional(),
    employee_no: z.string().optional(),
    office: z.string().optional(),
    position: z.string().optional(),
  }),
  confirmed: z.boolean().optional(),
})

/** Someone who is not in the system yet, registered at the front desk. Employee details are optional. */
export const POST = route({ body: Body }, async ({ tx, actor, body }) => ({
  patient_id: await registerUnlisted(tx, actor, { ...body.person, patient_id: body.patient_id }, body.confirmed),
}))
