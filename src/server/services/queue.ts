import { and, eq, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { ageOf, todayKey, topCategory } from '../../features/clinic/lib/helpers'
import type { CategoryKey, PriorityCategory, ServiceType, TicketStatus } from '../../features/clinic/types'
import { audit, HttpError, nextCounter, nowMs, uuid, type Actor } from '../core'
import type { Q } from '../db'
import { canonicalPatientId } from './merge'
import { isReturning, patientName } from './records'

/** Only the server issues queue numbers, inside one transaction, so two computers never hand out the same one. */
export async function issueTicket(q: Q, actor: Actor, patientIdIn: string, categories: CategoryKey[], service: ServiceType, reason: string, ticketId: string = uuid()) {
  const [existing] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (existing) return existing.ticket_id // retried request
  const patientId = await canonicalPatientId(q, patientIdIn)
  const [row] = await q
    .select({ birthdate: t.person.birthdate, name: t.person.full_name })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
    .where(eq(t.patient.patient_id, patientId))
  if (!row) throw new HttpError(404, 'Patient not found')
  const day = todayKey()
  const table = (await q.select().from(t.priorityCategory)) as PriorityCategory[]
  const cats = [...new Set<CategoryKey>([...categories, ...(ageOf(row.birthdate) >= 60 ? (['senior'] as CategoryKey[]) : [])])]
  const finalCats: CategoryKey[] = cats.length ? cats : ['regular']
  const category = topCategory(finalCats, table)
  const [{ max }] = await q.select({ max: sql<number>`coalesce(max(${t.queueTicket.queue_no}), 0)` }).from(t.queueTicket).where(eq(t.queueTicket.day, day))
  const queue_no = await nextCounter(q, `queue:${day}`, max)
  await q.insert(t.queueTicket).values({
    ticket_id: ticketId,
    patient_id: patientId,
    category_id: category,
    categories: finalCats,
    verified_by: actor.staff_id,
    is_returning: await isReturning(q, patientId),
    queue_no,
    service_type: service,
    reason: reason || null,
    status: 'waiting',
    checked_in_at: nowMs(),
    day,
  })
  await audit(q, actor.staff_id, { action: 'check-in', table: 'queue_ticket', record: ticketId, summary: `Issued queue number for ${row.name} (${category} lane, ${service})` })
  return ticketId
}

export async function setTicketStatus(q: Q, actor: Actor, ticketId: string, status: TicketStatus) {
  const [tk] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (!tk) throw new HttpError(404, 'Ticket not found')
  await q
    .update(t.queueTicket)
    .set(status === 'waiting' ? { status, called_at: null, doctor_id: null } : { status })
    .where(eq(t.queueTicket.ticket_id, ticketId))
  const name = await patientName(q, tk.patient_id)
  const label = status === 'left' ? 'Marked left without being seen' : status === 'waiting' ? 'Returned to the waiting list' : `Set status to ${status}`
  await audit(q, actor.staff_id, { action: 'status', table: 'queue_ticket', record: ticketId, summary: `${label}: ${name}` })
}

export async function markUrgent(q: Q, actor: Actor, ticketId: string) {
  const [tk] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (!tk) throw new HttpError(404, 'Ticket not found')
  const cats = [...new Set<string>(['urgent', ...tk.categories.filter((c) => c !== 'regular')])]
  await q.update(t.queueTicket).set({ categories: cats, category_id: 'urgent' }).where(eq(t.queueTicket.ticket_id, ticketId))
  await audit(q, actor.staff_id, { action: 'edit', table: 'queue_ticket', record: ticketId, summary: `Flagged urgent: ${await patientName(q, tk.patient_id)} moved to the top of the queue` })
}

export async function callTicket(q: Q, actor: Actor, ticketId: string) {
  const [tk] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (!tk) throw new HttpError(404, 'Ticket not found')
  // Two doctors pressing "Call next" at once must not call the same number twice.
  const res = await q
    .update(t.queueTicket)
    .set({ status: 'called', called_at: nowMs(), doctor_id: actor.staff_id })
    .where(and(eq(t.queueTicket.ticket_id, ticketId), eq(t.queueTicket.status, 'waiting')))
    .returning({ id: t.queueTicket.ticket_id })
  if (!res.length) throw new HttpError(409, 'This patient was already called.')
  await audit(q, actor.staff_id, { action: 'call', table: 'queue_ticket', record: ticketId, summary: `Called ${await patientName(q, tk.patient_id)}` })
}

export async function startConsult(q: Q, actor: Actor, ticketId: string) {
  await q
    .update(t.queueTicket)
    .set({
      status: 'in_consult',
      called_at: sql`coalesce(${t.queueTicket.called_at}, ${nowMs()})`,
      doctor_id: sql`coalesce(${t.queueTicket.doctor_id}, ${actor.staff_id})`,
    })
    .where(eq(t.queueTicket.ticket_id, ticketId))
}
