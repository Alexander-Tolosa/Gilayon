import { route, z } from '@/server/http'
import { NewPerson, Short } from '@/server/schemas'
import { registerUnlisted } from '@/server/services/records'

const Body = z.object({
  patient_id: z.string().optional(),
  person: NewPerson.extend({ employee_no: Short(40).optional(), office: Short(120).optional(), position: Short(120).optional() }),
  confirmed: z.boolean().optional(),
})

/** Someone who is not in the system yet, registered at the front desk. Employee details are optional. */
export const POST = route({ body: Body }, async ({ tx, actor, body }) => ({
  patient_id: await registerUnlisted(tx, actor, { ...body.person, patient_id: body.patient_id }, body.confirmed),
}))
