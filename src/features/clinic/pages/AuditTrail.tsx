import { ArrowDown, Check, DownloadSimple, FileCsv } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Chip, Input, useToast } from '../../../shared/components/ui'
import { cn, downloadCSV } from '../../../shared/lib/utils'
import { useT } from '../lib/i18n'
import { unreadActivity } from '../lib/activity'
import { fmtStampOf } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { AuditAction, AuditLog } from '../types'

const GROUPS: { key: string; label: string; actions: AuditAction[] }[] = [
  { key: 'all', label: 'Everything', actions: [] },
  { key: 'create', label: 'Created', actions: ['create', 'import', 'upload', 'link'] },
  { key: 'edit', label: 'Edited', actions: ['edit', 'status'] },
  { key: 'sign', label: 'Signed', actions: ['sign'] },
  { key: 'void', label: 'Voided', actions: ['void'] },
  { key: 'queue', label: 'Check-in and queue', actions: ['verify', 'check-in', 'call'] },
  { key: 'flag', label: 'Flags', actions: ['flag'] },
  { key: 'sync', label: 'Offline sync', actions: ['sync'] },
  { key: 'backup', label: 'Backups', actions: ['backup'] },
  { key: 'export', label: 'Exports', actions: ['export'] },
]

const TONE: Partial<Record<AuditAction, string>> = { sign: 'bg-ok-soft text-ok', void: 'bg-danger-soft text-danger', flag: 'bg-warn-soft text-warn', edit: 'bg-brand-50 text-brand-800', sync: 'bg-mist text-ink-2', export: 'bg-warn-soft text-warn', release: 'bg-ok-soft text-ok' }

export default function AuditTrail() {
  const t = useT()
  const toast = useToast()
  const { data, staffById, me, markAuditSeen, fetchAuditPage, exportAudit, online } = useClinic()
  // The snapshot carries the newest entries; older pages are fetched from the server on request.
  const [older, setOlder] = useState<AuditLog[]>([])
  const [olderDone, setOlderDone] = useState(false)
  const [busy, setBusy] = useState<'older' | 'export' | 'read' | null>(null)
  const all = useMemo(() => {
    const seen = new Set(data.audit.map((a) => a.log_id))
    return [...data.audit, ...older.filter((a) => !seen.has(a.log_id))]
  }, [data.audit, older])
  const unreadRows = useMemo(() => unreadActivity(data, me?.staff_id ?? ''), [data, me])
  const unread = useMemo(() => new Set(unreadRows.map((a) => a.log_id)), [unreadRows])
  const [group, setGroup] = useState('all')
  const [staff, setStaff] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(60)
  const rows = useMemo(() => {
    const g = GROUPS.find((x) => x.key === group)!
    return all
      .filter((a) => !g.actions.length || g.actions.includes(a.action))
      .filter((a) => staff === 'all' || a.staff_id === staff)
      // Search matches what the box promises: the summary (patient, document no.), the action, who did it, and the record.
      .filter((a) => {
        const needle = q.trim().toLowerCase()
        if (!needle) return true
        return [a.summary, a.detail ?? '', a.action, a.table_name, a.record_id, staffById(a.staff_id)?.name ?? 'System'].some((f) => f.toLowerCase().includes(needle))
      })
  }, [all, group, staff, q, staffById])
  // Most entries are about a patient through another record (a consultation, document, ticket or scan):
  // map each of those ids to its patient so "open record" works on them too.
  const patientOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of data.patients) m.set(p.patient_id, p.patient_id)
    for (const c of data.consultations) m.set(c.consultation_id, c.patient_id)
    for (const r of data.prescriptions) m.set(r.prescription_id, r.patient_id)
    for (const d of data.documents) m.set(d.document_id, d.patient_id)
    for (const tk of data.tickets) m.set(tk.ticket_id, tk.patient_id)
    for (const sc of data.scans) m.set(sc.page_id, sc.patient_id)
    for (const l of data.labs) m.set(l.lab_id, l.patient_id)
    return m
  }, [data])

  return (
    <div>
      {/* Same title style as other screens. The description, the two exports and a compact "Mark all as read" share
          one row on wide screens; on narrower ones the description sits above and the three buttons share the row below. */}
      <div className="mb-6">
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[2.2rem]">{t('Audit trail')}</h1>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[repeat(2,minmax(12rem,1fr))_auto] sm:items-center xl:grid-cols-[minmax(0,1fr)_repeat(2,minmax(12rem,auto))_auto]">
          <p className="mb-2 text-base text-ink-2 sm:col-span-3 xl:col-span-1 xl:mb-0 xl:pr-4">{t('Who created, edited, signed or voided each record, and when. Reviewed by the doctor in charge.')}</p>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            icon={<DownloadSimple size={20} />}
            onClick={() => {
              if (!rows.length) return toast({ tone: 'warn', title: 'Nothing to export', body: 'No entries match the current filters.' })
              downloadCSV('gilayon-audit-trail-view.csv', rows.map((a) => ({ when: new Date(a.logged_at).toISOString(), staff: staffById(a.staff_id)?.name ?? 'System', action: a.action, table: a.table_name, record_id: a.record_id, summary: a.summary, detail: a.detail ?? '' })))
              toast({ tone: 'ok', title: `Exported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`, body: 'Every entry that matches the current filters.' })
            }}
          >
            Export this view
          </Button>
          <Button
            size="lg"
            className="w-full"
            icon={<FileCsv size={20} />}
            disabled={!online || busy !== null}
            onClick={async () => {
              setBusy('export')
              const problem = await exportAudit()
              setBusy(null)
              toast(problem ? { tone: 'warn', title: problem } : { tone: 'ok', title: 'Full audit trail downloaded', body: 'The export is recorded in the audit trail.' })
            }}
          >
            {busy === 'export' ? 'Preparing…' : 'Export full log'}
          </Button>
          <Button
            variant="soft"
            size="lg"
            className="w-full gap-1.5 px-3.5 text-[13px] sm:w-auto"
            icon={<Check size={16} weight="bold" />}
            disabled={!online || busy !== null}
            onClick={async () => {
              if (!unreadRows.length) return toast({ tone: 'ok', title: 'Everything is already marked as read' })
              setBusy('read')
              await markAuditSeen(Math.max(...unreadRows.map((a) => a.logged_at)))
              setBusy(null)
              toast({ tone: 'ok', title: `Marked ${unreadRows.length} ${unreadRows.length === 1 ? 'entry' : 'entries'} as read` })
            }}
          >
            {busy === 'read' ? 'Marking…' : 'Mark all as read'}
            {unreadRows.length > 0 && busy !== 'read' && <span className="grid min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-[18px] text-white tabular">{unreadRows.length}</span>}
          </Button>
        </div>
      </div>
      <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto">
        {GROUPS.map((g) => (
          <Chip key={g.key} selected={group === g.key} onClick={() => setGroup(g.key)} className="h-11 text-base">
            {g.label}
          </Chip>
        ))}
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by patient, document no. or action')} className="h-12 text-base sm:max-w-md" />
        <select value={staff} onChange={(e) => setStaff(e.target.value)} aria-label={t('Staff')} className="h-12 rounded-xl border border-line-strong bg-surface px-4 text-base">
          <option value="all">{t('All staff')}</option>
          {data.staff.map((s) => (
            <option key={s.staff_id} value={s.staff_id}>
              {s.name}
            </option>
          ))}
          <option value="system">{t('System')}</option>
        </select>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((a) => (
            <li key={a.log_id} className={cn('grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4', unread.has(a.log_id) && 'border-l-4 border-brand-500 bg-brand-50/40')}>
              <span className="text-[15px] text-muted tabular">{fmtStampOf(a.logged_at)}</span>
              <div className="min-w-0">
                <p className="text-base font-medium">
                  {unread.has(a.log_id) && <span className="mr-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold uppercase text-white">New</span>}
                  {a.summary}
                </p>
                {a.detail && <p className="mt-0.5 font-mono text-sm text-ink-2">{a.detail}</p>}
                <p className="text-sm text-muted">
                  {staffById(a.staff_id)?.name ?? 'System'} · {a.table_name}
                  {patientOf.has(a.record_id) && (
                    <>
                      {' · '}
                      <Link to={`/clinic/patients/${patientOf.get(a.record_id)}`} className="font-semibold text-brand-700 hover:underline">
                        open record
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <span className={cn('w-fit rounded-full px-3 py-1 text-sm font-semibold capitalize', TONE[a.action] ?? 'bg-canvas text-ink-2')}>{a.action}</span>
            </li>
          ))}
        </ul>
        {rows.length > limit && (
          <div className="border-t border-line p-4 text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + 100)}>
              Show more ({rows.length - limit} left)
            </Button>
          </div>
        )}
        {rows.length === 0 && <p className="p-8 text-center text-lg text-ink-2">{t('No entries.')}</p>}
        {rows.length <= limit && (
          <div className="flex flex-col items-center gap-1 border-t border-line p-4 text-center">
            {olderDone ? (
              <p className="text-[15px] text-muted">That is the whole audit trail.</p>
            ) : (
              <>
                <Button
                  variant="secondary"
                  icon={<ArrowDown size={18} />}
                  disabled={!online || busy !== null}
                  onClick={async () => {
                    setBusy('older')
                    const last = all.reduce<AuditLog | undefined>((m, a) => (!m || a.logged_at < m.logged_at || (a.logged_at === m.logged_at && a.log_id < m.log_id) ? a : m), undefined)
                    const page = await fetchAuditPage(last && { at: last.logged_at, id: last.log_id })
                    setBusy(null)
                    if (!page) return
                    setOlder((o) => [...o, ...page.rows])
                    setOlderDone(!page.more)
                    setLimit((l) => l + page.rows.length)
                  }}
                >
                  {busy === 'older' ? 'Loading…' : 'Load older entries from the server'}
                </Button>
                <p className="text-sm text-muted">{t('Filters and search apply to the entries loaded so far.')}</p>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
