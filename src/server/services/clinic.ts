import { eq } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { DEFAULT_CLINIC, type ClinicProfile } from '../../features/clinic/api-types'
import { audit, HttpError, type Actor } from '../core'
import type { Q } from '../db'

const KEY = 'clinic_profile'
const MAX_LOGO_CHARS = 300_000
const LIMITS: Record<Exclude<keyof ClinicProfile, 'logo'>, number> = { header: 120, name: 80, office: 120, address: 160, contact: 120, license_no: 60 }

/** The letterhead details, with the defaults filled in for anything the clinic has not set. */
export async function getClinicProfile(q: Q): Promise<ClinicProfile> {
  const [row] = await q.select().from(t.meta).where(eq(t.meta.key, KEY))
  return { ...DEFAULT_CLINIC, ...((row?.value as Partial<ClinicProfile> | undefined) ?? {}) }
}

export async function setClinicProfile(q: Q, actor: Actor, input: ClinicProfile): Promise<ClinicProfile> {
  const value = {} as ClinicProfile
  for (const [k, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = (input[k] ?? '').trim()
    if (v.length > max) throw new HttpError(400, `${k.replace('_', ' ')} is too long (at most ${max} characters).`)
    value[k] = v
  }
  if (!value.name) throw new HttpError(400, 'The clinic name is required.')
  const logo = input.logo ?? ''
  if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > MAX_LOGO_CHARS)) {
    throw new HttpError(413, 'The logo must be a PNG, JPG or WebP image under about 200 KB.')
  }
  value.logo = logo
  await q.insert(t.meta).values({ key: KEY, value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
  await audit(q, actor.staff_id, { action: 'edit', table: 'meta', record: KEY, summary: `Updated the clinic letterhead (${value.name})` })
  return value
}
