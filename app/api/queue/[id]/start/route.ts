import { route } from '@/server/http'
import { startConsult } from '@/server/services/queue'

export const POST = route({ roles: ['doctor'] }, ({ tx, actor, params }) => startConsult(tx, actor, params.id))
