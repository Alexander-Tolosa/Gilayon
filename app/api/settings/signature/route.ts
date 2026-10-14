import { route, z } from '@/server/http'
import { setSignatureImage } from '@/server/services/admin'

export const PUT = route({ roles: ['doctor'], body: z.object({ image: z.string() }) }, ({ tx, actor, body }) => setSignatureImage(tx, actor, body.image))
