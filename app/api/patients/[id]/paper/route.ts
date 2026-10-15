import { route, z } from '@/server/http'
import { recordPaperCheck } from '@/server/services/records'

const Body = z.object({ status: z.enum(['on_file', 'none']), folder_no: z.string().optional() })

/** The front desk looked in the paper cabinet: a folder is on file, or there is none. */
export const POST = route({ body: Body }, ({ tx, actor, body, params }) => recordPaperCheck(tx, actor, params.id, body.status, body.folder_no))
