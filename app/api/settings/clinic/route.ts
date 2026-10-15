import { route, z } from '@/server/http'
import { setClinicProfile } from '@/server/services/clinic'

const Body = z.object({
  header: z.string(),
  name: z.string(),
  office: z.string(),
  address: z.string(),
  contact: z.string(),
  license_no: z.string(),
  logo: z.string(),
})

/** Letterhead details printed on prescriptions, certificates, summaries and reports. Doctor only. */
export const PUT = route({ roles: ['doctor'], body: Body }, ({ tx, actor, body }) => setClinicProfile(tx, actor, body))
