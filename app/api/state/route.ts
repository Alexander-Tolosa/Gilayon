import { route } from '@/server/http'
import { loadSnapshot } from '@/server/state'

export const dynamic = 'force-dynamic'

export const GET = route({ read: true, allowTempPassword: true }, ({ db, actor }) => loadSnapshot(db, actor))
