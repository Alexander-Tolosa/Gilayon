import { route, z } from '@/server/http'
import { uploadScan } from '@/server/services/records'

const Body = z.object({ file: z.string(), kind: z.enum(['Chart', 'Prescription', 'Lab result', 'Certificate']), page_date: z.string() })

export const POST = route({ body: Body }, ({ tx, actor, body, params }) => uploadScan(tx, actor, params.id, body.file, body.kind, body.page_date))
