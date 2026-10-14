import type { Snapshot } from '../api-types'
import type { AuditAction, AuditLog } from '../types'

/** Changes by other people that a doctor wants to notice. Routine traffic (sign-ins, calls, queue moves) is left out. */
export const NOTABLE: AuditAction[] = ['create', 'edit', 'upload', 'import', 'flag', 'void', 'sync', 'link', 'backup']

/** Activity by someone else since this doctor last marked things as seen. */
export function unreadActivity(data: Pick<Snapshot, 'audit' | 'auditSeenAt'>, myId: string): AuditLog[] {
  return data.audit.filter((a) => a.logged_at > data.auditSeenAt && a.staff_id !== myId && NOTABLE.includes(a.action))
}
