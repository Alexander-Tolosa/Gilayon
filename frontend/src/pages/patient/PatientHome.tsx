import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Buildings,
  CalendarPlus,
  ChatCircleDots,
  CheckCircle,
  Circle,
  Eye,
  FirstAid,
  Heartbeat,
  MapPin,
  Pill,
  Scales,
  VideoCamera,
  Drop,
  Bell,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkline } from '../../components/charts'
import { Reveal } from '../../components/Reveal'
import { Avatar, Button, Card, CardHeader, EmptyState, StatusBadge, useToast } from '../../components/ui'
import { cdsAlerts, latestVitals } from '../../data/clinical'
import { cn, firstName, fmtTime, fmtWeekday, greeting, relDay, todayISO } from '../../lib/utils'
import { useDoctor } from '../../store/store'
import { LabCard, useMyAppointments, useSelf } from './shared'

export default function PatientHome() {
  const me = useSelf()
  const { upcoming } = useMyAppointments(me.id)
  const next = upcoming[0]
  const myDoctor = useDoctor(me.doctorId)
  const toast = useToast()
  const navigate = useNavigate()
  const priority = ['eye', 'refill', 'bp', 'mammo', 'colon']
  const alerts = [...cdsAlerts(me)].sort((a, b) => (priority.indexOf(a.id) + 1 || 99) - (priority.indexOf(b.id) + 1 || 99))
  const v = latestVitals(me)
  const prev = me.vitals[me.vitals.length - 2]
  // Lab-derived values are not measured every visit, so use the latest reading that has them.
  const a1cs = me.vitals.filter((x) => x.a1c !== undefined)
  const ldls = me.vitals.filter((x) => x.ldl !== undefined)
  const a1c = a1cs.at(-1)?.a1c
  const ldl = ldls.at(-1)?.ldl
  const recentLabs = [...me.labs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const activeMeds = me.medications.filter((m) => m.status === 'active')

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{fmtWeekday(todayISO())}</p>
          <h1 className="mt-1 text-[30px] font-light leading-tight tracking-[-0.035em] sm:text-4xl">
            {greeting()}, <span className="font-semibold">{firstName(me.name)}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" to="/patient/messages" icon={<ChatCircleDots size={18} />}>
            Message
          </Button>
          <Button to="/patient/appointments?book=1" icon={<CalendarPlus size={18} />}>
            Book a visit
          </Button>
        </div>
      </div>

      {me.isNew && <GettingStarted />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Next appointment */}
          <Reveal>
            {next ? (
              <div className="relative overflow-hidden rounded-3xl bg-brand-600 p-6 text-white shadow-brand sm:p-7">
                <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-brand-500/60 blur-2xl" />
                <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">Next appointment</span>
                      {next.status === 'requested' && <span className="rounded-full bg-[#ffd27a] px-3 py-1 text-xs font-semibold text-brand-950">Awaiting confirmation</span>}
                      {next.status === 'checked-in' && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700">Checked in</span>}
                    </div>
                    <p className="mt-5 text-[32px] font-light leading-none tracking-[-0.03em] sm:text-4xl">
                      {relDay(next.date)}, <span className="font-semibold">{fmtTime(next.time)}</span>
                    </p>
                    <p className="mt-2 text-brand-100">{next.reason}</p>
                  </div>
                  <NextDoctor doctorId={next.doctorId} mode={next.mode} />
                </div>
                <div className="relative mt-6 flex flex-wrap gap-2">
                  {next.mode === 'Telehealth' ? (
                    <Button variant="white" icon={<VideoCamera size={18} weight="fill" />} onClick={() => navigate(`/patient/visit/${next.id}`)}>
                      Join video visit
                    </Button>
                  ) : (
                    <Button variant="white" icon={<MapPin size={18} weight="fill" />} onClick={() => toast({ tone: 'info', title: 'Directions sent', body: 'HMO-Clinic, Provincial Capitol. We texted you the map link.' })}>
                      Get directions
                    </Button>
                  )}
                  <Button variant="onBrand" to="/patient/appointments">
                    Manage
                  </Button>
                </div>
              </div>
            ) : (
              <Card>
                <EmptyState icon={<CalendarPlus size={26} />} title="No upcoming visits" body="Book a consultation with your doctor in under a minute." action={<Button to="/patient/appointments?book=1">Book a visit</Button>} />
              </Card>
            )}
          </Reveal>

          {/* Vitals */}
          <Reveal delay={0.05}>
            <Card>
              <CardHeader title="Your vitals" subtitle={v ? `Last measured ${relDay(v.date).toLowerCase()}` : undefined} action={<Link to="/patient/records?tab=trends" className="text-sm font-medium text-brand-700 hover:underline">See trends</Link>} />
              {v ? (
                <div className="grid grid-cols-2 gap-3 p-5 sm:p-6 xl:grid-cols-4">
                  <VitalTile icon={<Heartbeat size={18} />} label="Blood pressure" value={`${v.systolic}/${v.diastolic}`} unit="mmHg" series={me.vitals.map((x) => x.systolic)} delta={prev ? v.systolic - prev.systolic : 0} goodWhenDown />
                  {a1c !== undefined ? (
                    <VitalTile icon={<Drop size={18} />} label="HbA1c" value={a1c.toFixed(1)} unit="%" series={a1cs.map((x) => x.a1c!)} delta={a1cs.length > 1 ? +(a1c - a1cs.at(-2)!.a1c!).toFixed(1) : 0} goodWhenDown />
                  ) : (
                    <VitalTile icon={<Heartbeat size={18} />} label="Heart rate" value={String(v.heartRate)} unit="bpm" series={me.vitals.map((x) => x.heartRate)} delta={prev ? v.heartRate - prev.heartRate : 0} goodWhenDown />
                  )}
                  {ldl !== undefined ? (
                    <VitalTile icon={<FirstAid size={18} />} label="LDL cholesterol" value={String(ldl)} unit="mg/dL" series={ldls.map((x) => x.ldl!)} delta={ldls.length > 1 ? ldl - ldls.at(-2)!.ldl! : 0} goodWhenDown />
                  ) : (
                    <VitalTile icon={<Heartbeat size={18} />} label="Diastolic" value={String(v.diastolic)} unit="mmHg" series={me.vitals.map((x) => x.diastolic)} delta={prev ? v.diastolic - prev.diastolic : 0} goodWhenDown />
                  )}
                  <VitalTile icon={<Scales size={18} />} label="Weight" value={v.weight.toFixed(1)} unit="kg" series={me.vitals.map((x) => x.weight)} delta={prev ? +(v.weight - prev.weight).toFixed(1) : 0} goodWhenDown />
                </div>
              ) : (
                <EmptyState icon={<Heartbeat size={26} />} title="No vitals yet" body="Your blood pressure, weight and other readings will appear after your first visit." />
              )}
            </Card>
          </Reveal>

          {/* Labs */}
          <Reveal delay={0.1}>
            <Card>
              <CardHeader title="Recent lab results" action={<Link to="/patient/records?tab=labs" className="text-sm font-medium text-brand-700 hover:underline">All results</Link>} />
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                {recentLabs.length ? recentLabs.map((l) => <LabCard key={l.id} lab={l} compact />) : <EmptyState icon={<Pill size={26} />} title="No lab results yet" body="When your doctor orders tests, results land here automatically." />}
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="flex flex-col gap-5">
          {alerts.length > 0 && (
            <Reveal>
              <Card>
                <CardHeader title="Health reminders" subtitle="Based on your record" />
                <ul className="flex flex-col gap-2 p-5 sm:p-6">
                  {alerts.slice(0, 4).map((a) => (
                    <li key={a.id} className={cn('flex items-start gap-3 rounded-2xl p-3.5', a.tone === 'danger' ? 'bg-danger-soft' : a.tone === 'warn' ? 'bg-warn-soft' : 'bg-brand-50')}>
                      <span className={cn('mt-0.5', a.tone === 'danger' ? 'text-danger' : a.tone === 'warn' ? 'text-warn' : 'text-brand-600')}>
                        {a.id === 'eye' ? <Eye size={18} weight="fill" /> : <Bell size={18} weight="fill" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{a.title}</p>
                        <p className="text-[13px] text-ink-2">{a.detail}</p>
                        {a.id === 'eye' && (
                          <Link to="/patient/appointments?book=1" className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                            Book eye exam <ArrowRight size={12} weight="bold" />
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          )}

          {myDoctor && (
            <Reveal delay={0.05}>
              <Card className="overflow-hidden">
                <div className="flex items-center gap-4 p-5 sm:p-6">
                  <Avatar name={myDoctor.name} src={myDoctor.photo} size="lg" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Your doctor</p>
                    <p className="truncate font-semibold tracking-tight">{myDoctor.name}</p>
                    <p className="truncate text-[13px] text-muted">{myDoctor.specialty}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-sm">
                  <div className="bg-surface px-5 py-3">
                    <dt className="text-xs text-muted">Clinic hours</dt>
                    <dd className="font-medium tabular">
                      {fmtTime(myDoctor.hours[0])} to {fmtTime(myDoctor.hours[1])}
                    </dd>
                  </div>
                  <div className="bg-surface px-5 py-3">
                    <dt className="text-xs text-muted">Location</dt>
                    <dd className="font-medium">{myDoctor.room}</dd>
                  </div>
                </dl>
                <div className="flex gap-2 border-t border-line p-4">
                  <Button variant="soft" size="sm" className="flex-1" to="/patient/messages" icon={<ChatCircleDots size={16} />}>
                    Message
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1" to="/patient/appointments?book=1" icon={<CalendarPlus size={16} />}>
                    Book
                  </Button>
                </div>
              </Card>
            </Reveal>
          )}

          <Reveal delay={0.1}>
            <Card>
              <CardHeader title="Medications" subtitle={`${activeMeds.length} active`} action={<Link to="/patient/records?tab=meds" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
              <ul className="flex flex-col gap-2 p-5 sm:p-6">
                {activeMeds.length === 0 && <li className="text-sm text-muted">No active medicines on file.</li>}
                {activeMeds.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-brand-600 shadow-soft">
                      <Pill size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {m.name} <span className="font-normal text-muted">{m.dose}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{m.frequency}</p>
                    </div>
                    {m.refillsLeft === 0 ? (
                      <button onClick={() => toast({ tone: 'ok', title: 'Refill requested', body: `${m.name} sent to ${m.prescribedBy} for approval.` })} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                        Refill
                      </button>
                    ) : m.refillsLeft !== undefined ? (
                      <span className="text-xs text-muted tabular">{m.refillsLeft} refills</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  )
}

function NextDoctor({ doctorId, mode }: { doctorId: string; mode: string }) {
  const d = useDoctor(doctorId)
  if (!d) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 pr-5 ring-1 ring-white/15 backdrop-blur">
      <Avatar name={d.name} src={d.photo} size="lg" className="ring-white/40" />
      <div>
        <p className="font-semibold">{d.name}</p>
        <p className="text-sm text-brand-100">{d.specialty}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-100">
          {mode === 'Telehealth' ? <VideoCamera size={14} /> : <Buildings size={14} />}
          {mode === 'Telehealth' ? 'Video visit' : d.room}
        </p>
      </div>
    </div>
  )
}

function VitalTile({ icon, label, value, unit, series, delta, goodWhenDown }: { icon: ReactNode; label: string; value: string; unit: string; series: number[]; delta: number; goodWhenDown?: boolean }) {
  const good = goodWhenDown ? delta <= 0 : delta >= 0
  return (
    <div className="flex flex-col rounded-2xl border border-line p-4">
      <div className="flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        {delta !== 0 && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular', good ? 'text-ok' : 'text-danger')}>
            {delta < 0 ? <ArrowDownRight size={12} weight="bold" /> : <ArrowUpRight size={12} weight="bold" />}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tracking-tight tabular">
        {value} <span className="text-xs font-normal text-muted">{unit}</span>
      </p>
      <div className="mt-2">
        <Sparkline data={series} height={32} />
      </div>
    </div>
  )
}

function GettingStarted() {
  const me = useSelf()
  const { upcoming } = useMyAppointments(me.id)
  const confirmed = upcoming.some((a) => a.status === 'confirmed')
  const items = [
    { done: true, label: 'Patient record created', sub: `Patient ID ${me.id}` },
    { done: confirmed, label: confirmed ? 'Consultation confirmed' : 'Consultation requested', sub: confirmed ? 'See you soon' : 'The front desk will confirm shortly' },
    { done: me.insurance.status === 'verified', label: 'Add your insurance', sub: 'So we can check coverage before the visit', to: '/patient/profile' },
    { done: me.medications.length > 0 || me.conditions.length > 0, label: 'Medical history on file', sub: 'Update it any time before your visit', to: '/patient/profile' },
  ]
  return (
    <Card className="mb-5 p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold tracking-tight">Welcome to Himsog</p>
          <p className="text-sm text-muted">A few steps to get your record ready for your first visit.</p>
        </div>
        <StatusBadge status={confirmed ? 'confirmed' : 'requested'} />
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => {
          const body = (
            <>
              {it.done ? <CheckCircle size={22} weight="fill" className="shrink-0 text-brand-600" /> : <Circle size={22} className="shrink-0 text-line-strong" />}
              <span>
                <span className="block text-sm font-semibold text-ink">{it.label}</span>
                <span className="block text-xs text-muted">{it.sub}</span>
              </span>
            </>
          )
          return (
            <li key={it.label}>
              {it.to && !it.done ? (
                <Link to={it.to} className="flex h-full items-start gap-3 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-3.5 transition hover:border-brand-400">
                  {body}
                </Link>
              ) : (
                <div className="flex h-full items-start gap-3 rounded-2xl bg-canvas p-3.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
