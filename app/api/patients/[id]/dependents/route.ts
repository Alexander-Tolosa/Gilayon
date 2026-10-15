import { route, z } from '@/server/http'
import { NewPerson } from '@/server/schemas'
import { createDependent } from '@/server/services/records'

const Body = z.object({
  /** Our own id for the new record, so a retried request cannot create the dependent twice. */
  patient_id: z.string().min(8).max(64).optional(),
  person: NewPerson,
  confirmed: z.boolean().optional(),
  type: z.enum(['Spouse', 'Child', 'Parent', 'Sibling']),
  mdr: z.boolean(),
})

export const POST = route({ body: Body }, async ({ tx, actor, body, params }) => ({
  patient_id: await createDependent(tx, actor, params.id, body.person, body.type, body.mdr, { patientId: body.patient_id, confirmed: body.confirmed }),
}))
