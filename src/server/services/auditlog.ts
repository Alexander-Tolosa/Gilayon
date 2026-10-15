import { and, desc, eq, lt, or } from 'drizzle-orm'
import * as t from '../../../db/schema'
import type { AuditPage } from '../../features/clinic/api-types'
import type { AuditLog } from '../../features/clinic/types'
import { audit, strip, type Actor } from '../core'
import type { Q } from '../db'

export const AUDIT_PAGE_MAX = 500

/**
 * One page of the audit log, newest first. The cursor is the last row already shown (its time and id),
 * so rows logged in the same millisecond are neither skipped nor shown twice.
 */
export async function listAudit(q: Q, opts: { before?: number; beforeId?: string; limit?: number } = {}): Promise<AuditPage> {
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 200), 1), AUDIT_PAGE_MAX)
  const { before, beforeId } = opts
  const where =
    before === undefined
      ? undefined
      : beforeId
        ? or(lt(t.auditLog.logged_at, before), and(eq(t.auditLog.logged_at, before), lt(t.auditLog.log_id, beforeId)))
        : lt(t.auditLog.logged_at, before)
  const rows = await q
    .select()
    .from(t.auditLog)
    .where(where)
    .orderBy(desc(t.auditLog.logged_at), desc(t.auditLog.log_id))
    .limit(limit + 1)
  return { rows: rows.slice(0, limit).map((r) => strip<AuditLog>(r)), more: rows.length > limit }
}

/** A spreadsheet cell that starts with = + - @ could run as a formula when opened; prefix it so it stays text. */
const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`

/** The whole audit log as CSV. The export itself is logged, since the file names patients. */
export async function exportAuditCsv(q: Q, actor: Actor): Promise<{ csv: string; rows: number }> {
  const staff = new Map((await q.select({ id: t.staff.staff_id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]))
  const lines = [['when', 'staff', 'action', 'table', 'record_id', 'summary', 'detail'].join(',')]
  let page = await listAudit(q, { limit: AUDIT_PAGE_MAX })
  let count = 0
  for (;;) {
    for (const a of page.rows) {
      lines.push([new Date(a.logged_at).toISOString(), staff.get(a.staff_id) ?? 'System', a.action, a.table_name, a.record_id, a.summary, a.detail ?? ''].map(cell).join(','))
      count++
    }
    const last = page.rows.at(-1)
    if (!page.more || !last) break
    page = await listAudit(q, { before: last.logged_at, beforeId: last.log_id, limit: AUDIT_PAGE_MAX })
  }
  await audit(q, actor.staff_id, { action: 'export', table: 'audit_log', record: 'all', summary: `Exported the full audit trail (${count} entries)` })
  return { csv: lines.join('\n') + '\n', rows: count }
}
