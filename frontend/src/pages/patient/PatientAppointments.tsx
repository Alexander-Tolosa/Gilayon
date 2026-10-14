import { Buildings, CalendarPlus, CalendarX, VideoCamera, BellRinging } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookingModal } from '../../components/BookingModal'
import { Avatar, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Switch, Tabs, useToast } from '../../components/ui'
import type { Appointment } from '../../data/types'
import { cn, fmtDate, fmtTime, relDay, todayISO } from '../../lib/utils'
import { useDoctor, useStore } from '../../store/store'
import { useMyAppointments, useSelf } from './shared'

export default function PatientAppointments() {
  const me = useSelf()
  const { upcoming, past } = useMyAppointments(me.id)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const open = params.get('book') === '1'
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Book, join and manage your consultations"
        actions={
          <Button icon={<CalendarPlus size={18} />} onClick={() => setParams({ book: '1' })}>
            Book a visit
          </Button>
        }
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Upcoming', count: upcoming.length }, { value: 'past', label: 'Past', count: past.length }]} />
      <div className="flex flex-col gap-3">
        {list.length === 0 && (
          <Card>
            <EmptyState icon={<CalendarPlus size={26} />} title={tab === 'upcoming' ? 'Nothing booked yet' : 'No past visits'} body="Pick a doctor and a time that suits you." action={<Button onClick={() => setParams({ book: '1' })}>Book a visit</Button>} />
          </Card>
        )}
        {list.map((a) => (
          <ApptRow key={a.id} a={a} upcoming={tab === 'upcoming'} />
        ))}
      </div>

      {tab === 'upcoming' && upcoming.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Reminders" subtitle="How we remind you before each visit" />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
            <ReminderPref label="Text message" detail={me.phone} />
            <ReminderPref label="Email" detail={me.email} />
          </div>
        </Card>
      )}
      <BookingModal open={open} onClose={() => setParams({})} patientId={me.id} defaultDoctorId={me.doctorId} />
    </div>
  )
}

function ReminderPref({ label, detail }: { label: string; detail: string }) {
  const [on, setOn] = useState(true)
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-canvas p-4">
      <div className="flex items-center gap-3">
        <BellRinging size={20} className="text-brand-600" />
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted">{detail} · 24 hours before</p>
        </div>
      </div>
      <Switch checked={on} onChange={setOn} label={`${label} reminders`} />
    </div>
  )
}

function ApptRow({ a, upcoming }: { a: Appointment; upcoming: boolean }) {
  const d = useDoctor(a.doctorId)
  const { setAppointmentStatus } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const isToday = a.date === todayISO()
  return (
    <Card className={cn('p-4 sm:p-5', isToday && upcoming && 'border-brand-200 ring-1 ring-brand-100')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:w-56">
          <div className={cn('grid size-14 shrink-0 place-items-center rounded-2xl text-center', isToday && upcoming ? 'bg-brand-600 text-white' : 'bg-brand-50')}>
            <span className={cn('text-[11px] font-medium uppercase', isToday && upcoming ? 'text-brand-100' : 'text-brand-700')}>{fmtDate(a.date, { month: 'short' })}</span>
            <span className={cn('-mt-1 text-lg font-semibold tabular', isToday && upcoming ? 'text-white' : 'text-brand-800')}>{fmtDate(a.date, { day: 'numeric' })}</span>
          </div>
          <div>
            <p className="font-semibold tabular">{fmtTime(a.time)}</p>
            <p className="text-[13px] text-muted">{relDay(a.date)}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={d?.name ?? ''} src={d?.photo} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium">{a.reason}</p>
            <p className="flex items-center gap-1.5 truncate text-[13px] text-muted">
              {d?.name} · {a.mode === 'Telehealth' ? <><VideoCamera size={13} /> Video</> : <><Buildings size={13} /> {d?.room}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge status={a.status} />
          {upcoming && a.mode === 'Telehealth' && a.status !== 'requested' && (
            <Button size="sm" icon={<VideoCamera size={14} weight="fill" />} onClick={() => navigate(`/patient/visit/${a.id}`)}>
              Join
            </Button>
          )}
          {upcoming && ['requested', 'confirmed'].includes(a.status) && (
            <Button
              size="sm"
              variant="ghost"
              icon={<CalendarX size={14} />}
              onClick={() => {
                setAppointmentStatus(a.id, 'cancelled')
                toast({ tone: 'info', title: 'Appointment cancelled', body: 'The slot was released for other patients.' })
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
