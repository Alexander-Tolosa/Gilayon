import { seed } from '../../../../db/seed'
import { HttpError } from '@/server/core'
import { isDemoServer, setting } from '@/server/env'
import { notifyChanged } from '@/server/events'
import { route } from '@/server/http'

/**
 * Replaces all records with the synthetic seed. Only on the demo server, and off in production builds,
 * unless GILAYON_ALLOW_RESET=1 (old name HIMSOG_ALLOW_RESET). A real clinic database is never wiped by a button.
 */
export const POST = route({ roles: ['doctor'], read: true }, async ({ db }) => {
  const allowed = setting('ALLOW_RESET') === '1' || (isDemoServer() && process.env.NODE_ENV !== 'production')
  if (!allowed) throw new HttpError(403, 'Reset is disabled on this server.')
  await seed(db)
  notifyChanged()
  return { ok: true }
})
