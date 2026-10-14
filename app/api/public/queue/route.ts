import { route } from '@/server/http'
import { loadPublicQueue } from '@/server/state'

export const dynamic = 'force-dynamic'

/** Waiting screen and sign-in page: queue numbers and staff names only. */
export const GET = route({ public: true, read: true }, ({ db }) => loadPublicQueue(db))
