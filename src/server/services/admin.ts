import bcrypt from 'bcryptjs'
import { and, eq, ne } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { STAFF as DEMO_STAFF } from '../../features/clinic/data/seed'
import { assertPinUnlocked, endSessions, hashSecret, notePinAttempt, passwordProblem, verifyPin } from '../auth'
import { audit, HttpError, uuid, type Actor } from '../core'
import type { Q } from '../db'

export async function updateCategoryRank(q: Q, actor: Actor, category: string, rank: number) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 9) throw new HttpError(400, 'Rank must be a whole number from 1 to 9.')
  const res = await q.update(t.priorityCategory).set({ rank }).where(eq(t.priorityCategory.category_id, category)).returning({ id: t.priorityCategory.category_id })
  if (!res.length) throw new HttpError(404, 'Unknown category')
  await audit(q, actor.staff_id, { action: 'edit', table: 'priority_category', record: category, summary: `Set ${category} lane rank to ${rank}` })
}

const MAX_SIGNATURE_BYTES = 400_000

export async function setSignatureImage(q: Q, actor: Actor, image: string) {
  // Raster images only: an SVG can carry script, and the signature is drawn on every printed document.
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_SIGNATURE_BYTES) throw new HttpError(413, 'The signature must be a PNG, JPG or WebP image under about 300 KB.')
  await q.update(t.staff).set({ signature_image: image }).where(eq(t.staff.staff_id, actor.staff_id))
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: actor.staff_id, summary: 'Updated signature image' })
}

export async function changePin(q: Q, actor: Actor, current: string, next: string) {
  if (!/^\d{4}$/.test(next)) throw new HttpError(400, 'The PIN is 4 digits.')
  if (['0000', '1111', '1234', '4321', '2580', '1212'].includes(next)) throw new HttpError(400, 'Choose a PIN that is harder to guess.')
  assertPinUnlocked(actor.staff_id)
  const [me] = await q.select().from(t.staff).where(eq(t.staff.staff_id, actor.staff_id))
  // A new doctor has no PIN yet: the first one is set without a current PIN.
  const ok = !!me && (!me.pin_hash || (await verifyPin(current, me.pin_hash)))
  if (me?.pin_hash) notePinAttempt(actor.staff_id, ok)
  if (!ok) {
    await audit(q, actor.staff_id, { action: 'flag', table: 'staff', record: actor.staff_id, summary: 'PIN change failed: current PIN incorrect' })
    return false
  }
  await q.update(t.staff).set({ pin_hash: await hashSecret(next) }).where(eq(t.staff.staff_id, actor.staff_id))
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: actor.staff_id, summary: 'Changed signing PIN' })
  return true
}

/* ------------------------------ Staff accounts ----------------------------- */

type NewStaff = {
  name: string
  role: 'doctor' | 'desk' | 'nurse'
  title: string
  license_no?: string
  ptr_no?: string
  services?: ('Medical' | 'Dental' | 'Laboratory')[]
  room?: string
  /** Temporary password. The person must replace it at first sign-in. */
  password: string
}

export async function createStaff(q: Q, actor: Actor, input: NewStaff) {
  const problem = passwordProblem(input.password)
  if (problem) throw new HttpError(400, problem)
  if (input.role === 'doctor' && !input.license_no?.trim()) throw new HttpError(400, 'A doctor needs a PRC license number.')
  const staff_id = `st-${uuid().slice(0, 8)}`
  await q.insert(t.staff).values({
    staff_id,
    name: input.name.trim(),
    role: input.role,
    title: input.title.trim(),
    license_no: input.license_no?.trim() || null,
    ptr_no: input.ptr_no?.trim() || null,
    services: input.services?.length ? input.services : null,
    room: input.room?.trim() || null,
    password_hash: await hashSecret(input.password),
    must_change_password: true,
  })
  await audit(q, actor.staff_id, { action: 'create', table: 'staff', record: staff_id, summary: `Created ${input.role} account for ${input.name.trim()}` })
  return staff_id
}

/** Changes made from the server's command line, not by a signed-in person. */
export const SYSTEM_ACTOR: Actor = { staff_id: 'system', name: 'System', role: 'doctor' }

/**
 * Day one on a real database: nobody can sign in until a doctor exists, and only a doctor can add staff.
 * Creates that first doctor with a temporary password. Refused once any active doctor exists.
 */
export async function createFirstDoctor(q: Q, input: Omit<NewStaff, 'role'>) {
  const [any] = await q.select({ id: t.staff.staff_id }).from(t.staff).where(and(eq(t.staff.role, 'doctor'), eq(t.staff.active, true))).limit(1)
  if (any) throw new HttpError(409, 'An active doctor account already exists. Add more staff from Settings > Staff accounts.')
  return createStaff(q, SYSTEM_ACTOR, { ...input, role: 'doctor' })
}

/**
 * Before real records go in: deactivates the seeded demo accounts that share the demo password.
 * Never deletes them (the audit trail still names them) and refuses to leave the clinic without a doctor.
 */
export async function disableDemoAccounts(q: Q) {
  const ids = DEMO_STAFF.map((s) => s.staff_id)
  const rows = (await q.select().from(t.staff)).filter((r) => r.active)
  const demo = rows.filter((r) => ids.includes(r.staff_id))
  if (!demo.length) return []
  if (!rows.some((r) => r.role === 'doctor' && !ids.includes(r.staff_id))) {
    throw new HttpError(409, 'Create a real doctor account first (npm run admin -- create-doctor), or nobody could sign in.')
  }
  for (const r of demo) {
    await q.update(t.staff).set({ active: false }).where(eq(t.staff.staff_id, r.staff_id))
    await endSessions(q, r.staff_id)
    await audit(q, SYSTEM_ACTOR.staff_id, { action: 'edit', table: 'staff', record: r.staff_id, summary: `Deactivated demo account of ${r.name}` })
  }
  return demo.map((r) => r.name)
}

type StaffPatch = Partial<Pick<NewStaff, 'name' | 'title' | 'license_no' | 'ptr_no' | 'services' | 'room' | 'role'>>

async function activeDoctorsExcept(q: Q, staff_id: string) {
  const rows = await q.select({ id: t.staff.staff_id }).from(t.staff).where(and(eq(t.staff.role, 'doctor'), eq(t.staff.active, true), ne(t.staff.staff_id, staff_id)))
  return rows.length
}

export async function updateStaffDetails(q: Q, actor: Actor, staff_id: string, patch: StaffPatch) {
  const [row] = await q.select().from(t.staff).where(eq(t.staff.staff_id, staff_id))
  if (!row) throw new HttpError(404, 'Staff member not found')
  if (patch.role && patch.role !== row.role) {
    if (staff_id === actor.staff_id) throw new HttpError(409, 'You cannot change your own role.')
    if (row.role === 'doctor' && (await activeDoctorsExcept(q, staff_id)) === 0) throw new HttpError(409, 'There must be at least one active doctor.')
  }
  const set: Record<string, unknown> = {}
  for (const k of ['name', 'title', 'license_no', 'ptr_no', 'room', 'role'] as const) {
    if (patch[k] === undefined) continue
    const v = typeof patch[k] === 'string' ? (patch[k] as string).trim() : patch[k]
    set[k] = v === '' ? null : v
  }
  if (patch.services !== undefined) set.services = patch.services.length ? patch.services : null
  if (set.name === null || set.title === null) throw new HttpError(400, 'Name and title are required.')
  if (!Object.keys(set).length) return
  await q.update(t.staff).set(set).where(eq(t.staff.staff_id, staff_id))
  if (set.role) await endSessions(q, staff_id) // permissions changed: sign in again
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: staff_id, summary: `Updated details of ${(set.name as string) ?? row.name}`, detail: Object.keys(set).join(', ') })
}

export async function setStaffActive(q: Q, actor: Actor, staff_id: string, active: boolean) {
  const [row] = await q.select().from(t.staff).where(eq(t.staff.staff_id, staff_id))
  if (!row) throw new HttpError(404, 'Staff member not found')
  if (!active) {
    if (staff_id === actor.staff_id) throw new HttpError(409, 'You cannot deactivate your own account.')
    if (row.role === 'doctor' && (await activeDoctorsExcept(q, staff_id)) === 0) throw new HttpError(409, 'There must be at least one active doctor.')
  }
  await q.update(t.staff).set({ active }).where(eq(t.staff.staff_id, staff_id))
  if (!active) await endSessions(q, staff_id)
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: staff_id, summary: `${active ? 'Reactivated' : 'Deactivated'} account of ${row.name}` })
}

/** An admin sets a temporary password; the person is signed out everywhere and must choose their own. */
export async function resetPassword(q: Q, actor: Actor, staff_id: string, temporary: string) {
  const problem = passwordProblem(temporary)
  if (problem) throw new HttpError(400, problem)
  const [row] = await q.select().from(t.staff).where(eq(t.staff.staff_id, staff_id))
  if (!row) throw new HttpError(404, 'Staff member not found')
  await q.update(t.staff).set({ password_hash: await hashSecret(temporary), must_change_password: true }).where(eq(t.staff.staff_id, staff_id))
  await endSessions(q, staff_id)
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: staff_id, summary: `Reset the password of ${row.name}` })
}

export async function changeOwnPassword(q: Q, actor: Actor, current: string, next: string) {
  const [me] = await q.select().from(t.staff).where(eq(t.staff.staff_id, actor.staff_id))
  if (!me || !(await bcrypt.compare(current, me.password_hash))) {
    await audit(q, actor.staff_id, { action: 'flag', table: 'staff', record: actor.staff_id, summary: 'Password change failed: current password incorrect' })
    throw new HttpError(403, 'Your current password is not correct.')
  }
  const problem = passwordProblem(next, me.staff_id)
  if (problem) throw new HttpError(400, problem)
  if (await bcrypt.compare(next, me.password_hash)) throw new HttpError(400, 'Choose a password you have not used just now.')
  await q.update(t.staff).set({ password_hash: await hashSecret(next), must_change_password: false }).where(eq(t.staff.staff_id, actor.staff_id))
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: actor.staff_id, summary: 'Changed own password' })
}

/** Moves a doctor's "seen up to" mark forward (never back, never into the future). */
export async function markAuditSeen(q: Q, actor: Actor, upTo: number) {
  const key = `audit_seen:${actor.staff_id}`
  const [row] = await q.select().from(t.meta).where(eq(t.meta.key, key))
  const value = Math.max((row?.value as number | undefined) ?? 0, Math.min(Math.floor(upTo), Date.now()))
  await q.insert(t.meta).values({ key, value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
}
