import { route, z } from '@/server/http'
import { mergePatients } from '@/server/services/merge'

const Body = z.object({ keep_patient_id: z.string().min(1), duplicate_patient_id: z.string().min(1), reason: z.string() })

/** Any staff member can merge two records they are sure are the same person. It is audited and can be undone. */
export const POST = route({ body: Body }, ({ tx, actor, body }) => mergePatients(tx, actor, { keep: body.keep_patient_id, duplicate: body.duplicate_patient_id, reason: body.reason }))
