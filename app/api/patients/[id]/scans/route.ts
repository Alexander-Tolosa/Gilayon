import { route, z } from '@/server/http'
import { uploadScan } from '@/server/services/records'

const Body = z.object({ page_id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(), file: z.string(), kind: z.enum(['Chart', 'Prescription', 'Lab result', 'Certificate']), page_date: z.string() })

export const POST = route({ body: Body }, async ({ tx, actor, body, params }) => ({ page_id: await uploadScan(tx, actor, params.id, body.file, body.kind, body.page_date, body.page_id) }))
