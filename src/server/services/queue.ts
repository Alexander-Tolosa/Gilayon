import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import * as t from '../../../db/schema'
import { ageOf, ticketLabel, todayKey, topCategory } from '../../features/clinic/lib/helpers'
import type { CategoryKey, PriorityCategory, QueueTicket, ServiceType, TicketStatus } from '../../features/clinic/types'
import { audit, HttpError, nextCounter, nowMs, uuid, type Actor } from '../core'
import type { Q } from '../db'
import { canonicalPatientId } from './merge'
import { isReturning, patientName } from './records'

const ACTIVE: TicketStatus[] = ['waiting', 'called', 'in_consult']

/**
 * Tickets from an earlier day that were never seen are closed as "left", so yesterday's list does not
 * linger as waiting forever. A ticket still "in consultation" is left alone: its note may still arrive.
 */
export async function closeStaleTickets(q: Q) {
  const closed = await q
    .update(t.queueTicket)
    .set({ status: 'left' })
    .where(and(lt(t.queueTicket.day, todayKey()), inArray(t.queueTicket.status, ['waiting', 'called'])))
    .returning({ id: t.queueTicket.ticket_id })
  if (closed.length) await audit(q, 'system', { action: 'status', table: 'queue_ticket', record: closed[0].id, summary: `Closed ${closed.length} ticket${closed.length > 1 ? 's' : ''} left over from an earlier day as not seen` })
  return closed.length
}

/** Only the server issues queue numbers, inside one transaction, so two computers never hand out the same one. */
export async function issueTicket(q: Q, actor: Actor, patientIdIn: string, categories: CategoryKey[], service: ServiceType, reason: string, ticketId: string = uuid(), vitalsIn?: Partial<Record<'bp' | 'temperature' | 'pulse' | 'respiration' | 'height' | 'weight', string>>) {
  const [existing] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (existing) return existing.ticket_id // retried request
  const patientId = await canonicalPatientId(q, patientIdIn)
  const [row] = await q
    .select({ birthdate: t.person.birthdate, name: t.person.full_name, paper: t.patient.paper_status })
    .from(t.patient)
    .innerJoin(t.person, eq(t.person.person_id, t.patient.person_id))
    .where(eq(t.patient.patient_id, patientId))
  if (!row) throw new HttpError(404, 'Patient not found')
  // Folders are filed by name: someone has to look in the cabinet once before the first queue number.
  if (!row.paper) throw new HttpError(409, 'Check the paper folder first: say whether a folder is on file or not.')
  await closeStaleTickets(q)
  const day = todayKey()
  // One place in the queue per person: a second number would put them in two lanes at once.
  const [active] = await q
    .select()
    .from(t.queueTicket)
    .where(and(eq(t.queueTicket.patient_id, patientId), eq(t.queueTicket.day, day), inArray(t.queueTicket.status, ACTIVE)))
  if (active) throw new HttpError(409, `${row.name} is already in today's queue as ${ticketLabel(active as Pick<QueueTicket, 'category_id' | 'queue_no'>)}.`)
  const table = (await q.select().from(t.priorityCategory)) as PriorityCategory[]
  const cats = [...new Set<CategoryKey>([...categories, ...(ageOf(row.birthdate) >= 60 ? (['senior'] as CategoryKey[]) : [])])]
  const finalCats: CategoryKey[] = cats.length ? cats : ['regular']
  const vitals = Object.fromEntries(Object.entries(vitalsIn ?? {}).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
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
    vitals: Object.keys(vitals).length ? vitals : null,
    status: 'waiting',
    checked_in_at: nowMs(),
    day,
  })
  await audit(q, actor.staff_id, { action: 'check-in', table: 'queue_ticket', record: ticketId, summary: `Issued queue number for ${row.name} (${category} lane, ${service})` })
  return ticketId
}

/**
 * The status changes a person may make by hand. "Called" and "in consultation" come only from Call and
 * Start, and "done" normally from saving the consultation; a doctor may still close a ticket by hand.
 */
const MOVES: Record<TicketStatus, Partial<Record<TicketStatus, Actor['role'][]>>> = {
  waiting: { left: ['doctor', 'desk', 'nurse'] },
  called: { waiting: ['doctor', 'desk', 'nurse'], left: ['doctor', 'desk', 'nurse'], done: ['doctor'] },
  in_consult: { waiting: ['doctor'], done: ['doctor'] },
  left: { waiting: ['doctor', 'desk', 'nurse'] },
  done: {},
}

export async function setTicketStatus(q: Q, actor: Actor, ticketId: string, status: TicketStatus) {
  const [tk] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (!tk) throw new HttpError(404, 'Ticket not found')
  if (tk.status === status) return
  const allowed = MOVES[tk.status][status]
  if (!allowed) throw new HttpError(409, `A ${tk.status.replace('_', ' ')} ticket cannot be set to ${status.replace('_', ' ')}.`)
  if (!allowed.includes(actor.role)) throw new HttpError(403, 'Only a doctor can make this change.')
  if ((tk.status === 'called' || tk.status === 'in_consult') && actor.role === 'doctor' && tk.doctor_id && tk.doctor_id !== actor.staff_id) throw new HttpError(403, 'Only the doctor who called this patient can change this ticket.')
  if (status === 'waiting' && tk.day !== todayKey()) throw new HttpError(409, 'That ticket is from an earlier day. Check the person in again.')
  await q
    .update(t.queueTicket)
    .set(status === 'waiting' ? { status, called_at: null, doctor_id: null } : status === 'done' ? { status, done_at: nowMs() } : { status })
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
  const [tk] = await q.select().from(t.queueTicket).where(eq(t.queueTicket.ticket_id, ticketId))
  if (!tk) throw new HttpError(404, 'Ticket not found')
  if (tk.status === 'in_consult' && tk.doctor_id === actor.staff_id) return
  if (tk.status !== 'waiting' && tk.status !== 'called') throw new HttpError(409, 'This patient is no longer waiting to be seen.')
  if (tk.doctor_id && tk.doctor_id !== actor.staff_id) throw new HttpError(409, 'Another doctor called this patient.')
  await q
    .update(t.queueTicket)
    .set({
      status: 'in_consult',
      called_at: sql`coalesce(${t.queueTicket.called_at}, ${nowMs()})`,
      doctor_id: sql`coalesce(${t.queueTicket.doctor_id}, ${actor.staff_id})`,
    })
    .where(eq(t.queueTicket.ticket_id, ticketId))
  await audit(q, actor.staff_id, { action: 'status', table: 'queue_ticket', record: ticketId, summary: `Started the consultation of ${await patientName(q, tk.patient_id)}` })
}
