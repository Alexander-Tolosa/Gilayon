import { Bell, CheckCircle, ClipboardText, FileText, Megaphone, Play, UsersThree, Warning } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, useToast } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { LaneBadge, TicketNo } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { unreadActivity } from '../lib/activity'
import { ageOf, fmtMinutes, fmtStampOf, minutesBetween, ticketLabel } from '../lib/helpers'
import { useClinic } from '../store/store'
import { TicketRow, useNow, useToday } from './QueueBoard'

export default function DoctorQueue() {
  const t = useT()
  const now = useNow()
  const navigate = useNavigate()
  const toast = useToast()
  const { me, data, personOfPatient, callTicket, startConsult, online, staffById, markAuditSeen } = useClinic()
  const q = useToday()
  const services = me?.services ?? []
  const mine = q.waiting.filter((x) => services.includes(x.service_type))
  const current = q.active.filter((x) => x.doctor_id === me?.staff_id)
  const next = mine[0]
  const nextPerson = next && personOfPatient(next.patient_id)
  const allergies = next ? data.allergies.filter((a) => a.patient_id === next.patient_id) : []
  const seenToday = q.done.filter((x) => x.doctor_id === me?.staff_id).length
  const news = unreadActivity(data, me?.staff_id ?? '')
  // Pending items prepared for this doctor: drafts waiting for a PIN signature.
  const drafts = data.prescriptions.filter((r) => r.status === 'draft' && r.doctor_id === me?.staff_id).length + data.documents.filter((d) => d.status === 'draft' && d.doctor_id === me?.staff_id).length
  const stats: { to: string; label: string; value: number; hint: string; icon: Icon; alert?: boolean }[] = [
    { to: '/clinic/queue', label: 'Waiting for you', value: mine.length, hint: 'Queue board', icon: UsersThree },
    { to: '/clinic/documents', label: 'Drafts to sign', value: drafts, hint: drafts ? 'Sign with your PIN' : 'Nothing to sign', icon: FileText, alert: drafts > 0 },
    { to: '/clinic/report', label: 'Seen today', value: seenToday, hint: 'Daily report', icon: CheckCircle },
    { to: '/clinic/audit', label: 'New changes', value: news.length, hint: 'Audit trail', icon: ClipboardText, alert: news.length > 0 },
  ]

  const open = (ticketId: string, patientId: string) => {
    startConsult(ticketId)
    navigate(`/clinic/consult/${patientId}?ticket=${ticketId}`)
  }

  return (
    <div>
      <PageTitle title={t('My queue')} sub={`${me?.name} · ${me?.room} · ${services.map((s) => t(s)).join(', ')} · ${seenToday} ${t('seen today')}`} />

      {current.length > 0 && (
        <div className="mb-5 flex flex-col gap-3">
          {current.map((c) => {
            const p = personOfPatient(c.patient_id)
            return (
              <Card key={c.ticket_id} className="flex flex-col gap-4 border-brand-200 bg-brand-50/60 p-6 sm:flex-row sm:items-center">
                <TicketNo ticket={c} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-800">{c.status === 'called' ? t('Called') : t('In consultation')}</p>
                  <p className="break-words text-2xl font-semibold">{p?.full_name}</p>
                  <p className="text-base text-ink-2">{c.reason}</p>
                </div>
                <Button size="lg" className="h-14 text-lg" icon={<Play size={20} weight="fill" />} onClick={() => open(c.ticket_id, c.patient_id)}>
                  {c.status === 'called' ? t('Start consultation') : 'Resume'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mb-6 overflow-hidden">
        {next && nextPerson ? (
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
            <TicketNo ticket={next} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-muted">{t('Next patient')}</p>
              <p className="text-[1.75rem] font-semibold leading-tight">{nextPerson.full_name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-base text-ink-2">
                <span>{[`${ageOf(nextPerson.birthdate)} ${t('yrs')} · ${t(nextPerson.sex)}`, t(next.service_type), next.reason].filter(Boolean).join(' · ')}</span>
                <LaneBadge category={next.category_id} />
                <span>
                  {t('Waiting')} {fmtMinutes(minutesBetween(next.checked_in_at, now))}
                </span>
              </p>
              {next.vitals && Object.values(next.vitals).some(Boolean) && (
                <p className="mt-2 text-base text-ink-2">
                  <b className="text-ink">{t('Vital signs')}:</b>{' '}
                  {[
                    next.vitals.bp && `BP ${next.vitals.bp}`,
                    next.vitals.temperature && `${next.vitals.temperature} °C`,
                    next.vitals.pulse && `PR ${next.vitals.pulse}`,
                    next.vitals.respiration && `RR ${next.vitals.respiration}`,
                    next.vitals.height && `${next.vitals.height} cm`,
                    next.vitals.weight && `${next.vitals.weight} kg`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {allergies.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-base font-semibold text-danger">
                  <Warning size={18} weight="fill" /> Allergic to {allergies.map((a) => a.substance).join(', ')}
                </p>
              )}
            </div>
            <Button
              size="lg"
              className="h-16 px-8 text-xl"
              disabled={!online}
              icon={<Megaphone size={24} weight="fill" />}
              onClick={async () => {
                if (await callTicket(next.ticket_id)) toast({ tone: 'ok', title: `Called ${ticketLabel(next)}`, body: 'The number is now on the waiting screen.' })
              }}
            >
              {t('Call next patient')}
            </Button>
          </div>
        ) : (
          <p className="p-8 text-center text-xl text-ink-2">{t('No one is waiting')}</p>
        )}
        {!online && <p className="border-t border-line bg-danger-soft px-6 py-3 text-base text-danger">{t('Offline: calling patients needs the clinic server. You can still open records you opened recently.')}</p>}
      </Card>

      <h2 className="mb-3 text-xl font-semibold">
        {t('Waiting')} ({mine.length})
      </h2>
      <ul className="mb-8 flex flex-col gap-3">
        {mine.map((tk, i) => (
          <TicketRow key={tk.ticket_id} ticket={tk} now={now} position={i + 1} />
        ))}
      </ul>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((st) => (
          <Link key={st.label} to={st.to} className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 sm:p-5">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${st.alert ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>
              <st.icon size={24} weight="fill" />
            </span>
            <span className="min-w-0">
              <span className="block text-[2rem] font-semibold leading-none tabular">{st.value}</span>
              <span className="mt-1 block break-words text-[15px] font-medium text-ink">{st.label}</span>
              <span className="block break-words text-sm text-muted group-hover:text-brand-700">{st.hint}</span>
            </span>
          </Link>
        ))}
      </div>

      {news.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Bell size={22} weight="fill" className="text-brand-600" /> {news.length} new {news.length === 1 ? 'change' : 'changes'} since you last looked
            </p>
            <div className="flex items-center gap-2">
              <Link to="/clinic/audit" className="text-[15px] font-semibold text-brand-700 hover:underline">
                Open audit trail
              </Link>
              <Button variant="secondary" onClick={() => void markAuditSeen(Math.max(...news.map((a) => a.logged_at)))}>
                Mark all as seen
              </Button>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {news.slice(0, 5).map((a) => (
              <li key={a.log_id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-canvas px-4 py-2 text-[15px]">
                <span className="min-w-0">
                  {a.summary} <span className="text-muted">· {staffById(a.staff_id)?.name ?? 'System'}</span>
                </span>
                <span className="text-sm text-muted tabular">{fmtStampOf(a.logged_at)}</span>
              </li>
            ))}
          </ul>
          {news.length > 5 && <p className="mt-2 text-sm text-muted">and {news.length - 5} more in the audit trail.</p>}
        </Card>
      )}
    </div>
  )
}
