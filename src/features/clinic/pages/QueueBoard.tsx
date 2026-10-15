import { ArrowCounterClockwise, Monitor, Printer, SignOut, Siren } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Tabs, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { PageTitle } from '../ClinicShell'
import { LaneBadge, StatusPill, TicketNo } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { ageOf, fmtMinutes, fmtTimeOf, minutesBetween, rankTickets, todayKey } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { QueueTicket } from '../types'

/** Re-render every few seconds so waiting times stay current. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function useToday() {
  const { data } = useClinic()
  return useMemo(() => {
    const today = todayKey()
    const list = data.tickets.filter((t) => t.day === today)
    return {
      all: list,
      waiting: rankTickets(
        list.filter((t) => t.status === 'waiting'),
        data.categories,
      ),
      active: list.filter((t) => t.status === 'called' || t.status === 'in_consult').sort((a, b) => (b.called_at ?? 0) - (a.called_at ?? 0)),
      done: list.filter((t) => t.status === 'done').sort((a, b) => (b.done_at ?? 0) - (a.done_at ?? 0)),
      left: list.filter((t) => t.status === 'left'),
    }
  }, [data.tickets, data.categories])
}

export function TicketRow({ ticket, position, actions, now }: { ticket: QueueTicket; position?: number; actions?: React.ReactNode; now: number }) {
  const t = useT()
  const { personOfPatient, staffById, principalOf } = useClinic()
  const p = personOfPatient(ticket.patient_id)
  const doc = staffById(ticket.doctor_id)
  const wait = minutesBetween(ticket.checked_in_at, ticket.called_at ?? now)
  const dep = principalOf(ticket.patient_id)
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 items-center gap-4 rounded-3xl border border-line bg-surface p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:p-5">
      {position !== undefined && <span className="hidden w-8 text-center text-xl font-semibold text-faint tabular sm:block">{position}</span>}
      <TicketNo ticket={ticket} />
      <div className="min-w-0">
        <p className="break-words text-xl font-semibold">{p?.full_name}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2">
          <span>{[p && `${ageOf(p.birthdate)} ${t('yrs')} · ${t(p.sex)}`, t(ticket.service_type), ticket.reason, dep && t('Dependent')].filter(Boolean).join(' · ')}</span>
          {!ticket.is_returning && <span className="rounded-full bg-brand-50 px-2 text-sm font-semibold text-brand-800">{t('New record')}</span>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
          <LaneBadge category={ticket.category_id} />
          <StatusPill status={ticket.status} />
          <span className={cn('tabular', ticket.status === 'waiting' && wait >= 30 ? 'font-semibold text-danger' : 'text-muted')}>
            {ticket.status === 'waiting' ? `${t('Waiting')} ${fmtMinutes(wait)}` : `${t('Wait time')} ${fmtMinutes(wait)}`}
            {ticket.status === 'waiting' && wait >= 30 && <span className="sr-only"> (long wait)</span>}
          </span>
          {doc && <span className="text-muted">· {doc.name} ({doc.room})</span>}
          <span className="text-faint">· {t('in at')} {fmtTimeOf(ticket.checked_in_at)}</span>
        </p>
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </motion.li>
  )
}

export default function QueueBoard() {
  const t = useT()
  const now = useNow()
  const { me, markUrgent, setTicketStatus } = useClinic()
  const toast = useToast()
  const q = useToday()
  const [tab, setTab] = useState<'waiting' | 'active' | 'done' | 'left'>('waiting')
  const lists = { waiting: q.waiting, active: q.active, done: q.done, left: q.left }
  const avgWait = q.done.length ? Math.round(q.done.reduce((s, x) => s + minutesBetween(x.checked_in_at, x.called_at ?? x.checked_in_at), 0) / q.done.length) : 0

  return (
    <div>
      <PageTitle
        title={t('Queue board')}
        sub={`${q.waiting.length} ${t('Waiting').toLowerCase()} · ${q.active.length} with a doctor · ${q.done.length} ${t('Done').toLowerCase()} · ${t('Average wait')} ${fmtMinutes(avgWait)}`}
        actions={
          <>
            <Button variant="secondary" size="lg" icon={<Monitor size={20} />} onClick={() => window.open('/waiting', '_blank')}>
              {t('Waiting screen')}
            </Button>
            {me?.role !== 'doctor' && (
              <Button size="lg" to="/clinic/checkin">
                {t('Check in')}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['urgent', 'pregnant', 'senior', 'regular'] as const).map((lane) => {
          const n = q.waiting.filter((x) => (lane === 'pregnant' ? ['pregnant', 'pwd'].includes(x.category_id) : x.category_id === lane)).length
          return (
            <Card key={lane} className="flex min-w-0 items-center justify-between gap-2 p-4 sm:p-5">
              <span className="flex min-w-0 flex-col items-start gap-1">
                <LaneBadge category={lane} className="text-base" />
                {lane === 'pregnant' && <span className="text-xs text-muted">+ PWD</span>}
              </span>
              <span className="text-3xl font-semibold tabular">{n}</span>
            </Card>
          )
        })}
      </div>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'waiting', label: t('Waiting'), count: q.waiting.length },
          { value: 'active', label: t('In consultation'), count: q.active.length },
          { value: 'done', label: t('Done'), count: q.done.length },
          { value: 'left', label: t('Left without being seen'), count: q.left.length },
        ]}
      />
      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {lists[tab].map((tk, i) => (
            <TicketRow
              key={tk.ticket_id}
              ticket={tk}
              now={now}
              position={tab === 'waiting' ? i + 1 : undefined}
              actions={
                <>
                  <Button size="md" variant="ghost" icon={<Printer size={16} />} onClick={() => window.open(`/print/ticket/${tk.ticket_id}`, '_blank')}>
                    {t('Print slip')}
                  </Button>
                  {tab === 'waiting' && tk.category_id !== 'urgent' && (
                    <Button
                      size="md"
                      variant="danger"
                      icon={<Siren size={16} />}
                      onClick={() => {
                        markUrgent(tk.ticket_id)
                        toast({ tone: 'warn', title: 'Moved to the top', body: 'Urgent tickets are called first.' })
                      }}
                    >
                      {t('Mark urgent')}
                    </Button>
                  )}
                  {tab === 'waiting' && (
                    <Button size="md" variant="secondary" icon={<SignOut size={16} />} onClick={() => setTicketStatus(tk.ticket_id, 'left')}>
                      {t('Mark left')}
                    </Button>
                  )}
                  {(tab === 'left' || (tab === 'active' && tk.status === 'called')) && (
                    <Button size="md" variant="secondary" icon={<ArrowCounterClockwise size={16} />} onClick={() => setTicketStatus(tk.ticket_id, 'waiting')}>
                      Back to waiting
                    </Button>
                  )}
                  <Link to={`/clinic/patients/${tk.patient_id}`} className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    {t('Open record')}
                  </Link>
                </>
              }
            />
          ))}
        </AnimatePresence>
        {lists[tab].length === 0 && <li className="rounded-3xl border border-line bg-surface p-8 text-center text-lg text-ink-2">{t('No one is waiting')}</li>}
      </ul>
    </div>
  )
}
