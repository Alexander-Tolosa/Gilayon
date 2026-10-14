import { seed } from '../../../../db/seed'
import { HttpError } from '@/server/core'
import { notifyChanged } from '@/server/events'
import { route } from '@/server/http'

/** Replaces all records with the synthetic seed. Off in production unless HIMSOG_ALLOW_RESET=1. */
export const POST = route({ roles: ['doctor'], read: true }, async ({ db }) => {
  if (process.env.NODE_ENV === 'production' && process.env.HIMSOG_ALLOW_RESET !== '1') throw new HttpError(403, 'Reset is disabled on this server.')
  await seed(db)
  notifyChanged()
  return { ok: true }
})
