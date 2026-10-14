import { route } from '@/server/http'
import { saveConsultation } from '@/server/services/clinical'
import { ConsultSchema } from '@/server/schemas'

export const POST = route({ roles: ['doctor'], body: ConsultSchema }, async ({ tx, actor, body }) => ({ result: await saveConsultation(tx, actor, body) }))
