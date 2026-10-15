import { route, z } from '@/server/http'
import { setEmployeeInfo } from '@/server/services/records'

const Body = z.object({ employee_no: z.string().min(1), office: z.string(), position: z.string(), reason: z.string().optional() })

/** Employee ID, office and position typed in by hand (HR may have no list to import). */
export const PUT = route({ body: Body }, async ({ tx, actor, body, params }) => {
  await setEmployeeInfo(tx, actor, params.id, body, body.reason)
  return { ok: true }
})
