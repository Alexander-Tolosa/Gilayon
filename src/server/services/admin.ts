import { eq } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { hashSecret, verifyPin } from '../auth'
import { audit, HttpError, nowMs, type Actor } from '../core'
import type { Q } from '../db'

export async function updateCategoryRank(q: Q, actor: Actor, category: string, rank: number) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 9) throw new HttpError(400, 'Rank must be a whole number from 1 to 9.')
  const res = await q.update(t.priorityCategory).set({ rank }).where(eq(t.priorityCategory.category_id, category)).returning({ id: t.priorityCategory.category_id })
  if (!res.length) throw new HttpError(404, 'Unknown category')
  await audit(q, actor.staff_id, { action: 'edit', table: 'priority_category', record: category, summary: `Set ${category} lane rank to ${rank}` })
}

const MAX_SIGNATURE_BYTES = 400_000

export async function setSignatureImage(q: Q, actor: Actor, image: string) {
  if (!image.startsWith('data:image/') || image.length > MAX_SIGNATURE_BYTES) throw new HttpError(413, 'Signature must be a small image.')
  await q.update(t.staff).set({ signature_image: image }).where(eq(t.staff.staff_id, actor.staff_id))
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: actor.staff_id, summary: 'Updated signature image' })
}

export async function changePin(q: Q, actor: Actor, current: string, next: string) {
  if (!/^\d{4}$/.test(next)) throw new HttpError(400, 'The PIN is 4 digits.')
  const [me] = await q.select().from(t.staff).where(eq(t.staff.staff_id, actor.staff_id))
  if (!me || !(await verifyPin(current, me.pin_hash))) {
    await audit(q, actor.staff_id, { action: 'flag', table: 'staff', record: actor.staff_id, summary: 'PIN change failed: current PIN incorrect' })
    return false
  }
  await q.update(t.staff).set({ pin_hash: await hashSecret(next) }).where(eq(t.staff.staff_id, actor.staff_id))
  await audit(q, actor.staff_id, { action: 'edit', table: 'staff', record: actor.staff_id, summary: 'Changed signing PIN' })
  return true
}

/** The front desk's backup indicator: everything logged before this moment has reached the off-site copy. */
export async function markBackedUp(q: Q) {
  const value = nowMs()
  await q.insert(t.meta).values({ key: 'last_backup_at', value }).onConflictDoUpdate({ target: t.meta.key, set: { value } })
}
