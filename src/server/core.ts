import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { counter, auditLog } from '../../db/schema'
import type { Db, Q } from './db'
import type { Staff } from '../features/clinic/types'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const uuid = () => randomUUID()
export const nowMs = () => Date.now()

/** Postgres returns null for empty columns; the frontend types use optional fields. */
export function strip<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) out[k] = v
  return out as T
}

export type Actor = Pick<Staff, 'staff_id' | 'name' | 'role'> & { license_no?: string }

export type AuditEntry = {
  action: string
  table: string
  record: string
  summary: string
  detail?: string
}

/** Every write goes through this inside the same transaction, so the log can never miss a change. */
export async function audit(q: Q, staff_id: string, e: AuditEntry) {
  await q.insert(auditLog).values({
    log_id: uuid(),
    staff_id,
    action: e.action,
    table_name: e.table,
    record_id: e.record,
    summary: e.summary,
    detail: e.detail ?? null,
    logged_at: nowMs(),
  })
}

/** Atomically increments a named counter. `floor` makes sure it never falls behind existing data. */
export async function nextCounter(q: Q, key: string, floor = 0): Promise<number> {
  if (floor > 0) {
    await q
      .insert(counter)
      .values({ key, value: floor })
      .onConflictDoUpdate({ target: counter.key, set: { value: sql`GREATEST(${counter.value}, ${floor})` } })
  }
  const [row] = await q
    .insert(counter)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counter.key, set: { value: sql`${counter.value} + 1` } })
    .returning({ value: counter.value })
  return row.value
}

export function requireRole(actor: Actor, ...roles: Actor['role'][]) {
  if (!roles.includes(actor.role)) throw new HttpError(403, 'Your role is not allowed to do this.')
}

export type Ctx = { db: Db; actor: Actor }
