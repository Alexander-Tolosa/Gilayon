import {
  CaretDown,
  DownloadSimple,
  FileText,
  Flask,
  Heartbeat,
  PaperPlaneTilt,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Warning,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendChart } from '../../components/charts'
import { Badge, Button, Card, CardHeader, Chip, EmptyState, PageHeader, Tabs, useToast } from '../../components/ui'
import { DOCTORS } from '../../data/seed'
import type { Patient } from '../../data/types'
import { cn, dayOffset, downloadCSV, fmtDate } from '../../lib/utils'
import { LabCard, trendRows, useSelf } from './shared'

type Tab = 'timeline' | 'trends' | 'labs' | 'meds' | 'visits' | 'allergies'

export default function PatientRecords() {
  const me = useSelf()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'timeline'
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const toast = useToast()

  const exportRecord = () => {
    downloadCSV(`${me.id}-health-record.csv`, [
      ...me.labs.flatMap((l) => l.results.map((r) => ({ type: 'Lab', date: l.date, item: `${l.name}: ${r.name}`, value: `${r.value} ${r.unit}`, note: r.flag }))),
      ...me.medications.map((m) => ({ type: 'Medication', date: m.since, item: m.name, value: `${m.dose} ${m.frequency}`, note: m.status })),
      ...me.visits.map((v) => ({ type: 'Visit', date: v.date, item: v.type, value: v.diagnoses.join('; '), note: v.summary })),
    ])
    toast({ tone: 'ok', title: 'Record downloaded', body: 'A copy of your record was saved as CSV.' })
  }

  return (
    <div>
      <PageHeader
        title="Health record"
        subtitle={`${me.name} · ${me.id} · ${me.age} years · Blood type ${me.bloodType}`}
        actions={
          <Button variant="secondary" icon={<DownloadSimple size={18} />} onClick={exportRecord}>
            Download my record
          </Button>
        }
      />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'timeline', label: 'Timeline' },
          { value: 'trends', label: 'Trends' },
          { value: 'labs', label: 'Labs & imaging', count: me.labs.length },
          { value: 'meds', label: 'Medications', count: me.medications.filter((m) => m.status === 'active').length },
          { value: 'visits', label: 'Visit summaries', count: me.visits.length },
          { value: 'allergies', label: 'Allergies & vaccines' },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {tab === 'timeline' && <Timeline me={me} />}
          {tab === 'trends' && <Trends me={me} />}
          {tab === 'labs' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {me.labs.length ? [...me.labs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => <LabCard key={l.id} lab={l} />) : (
                <Card className="lg:col-span-2">
                  <EmptyState icon={<Flask size={26} />} title="No lab results yet" body="Tests your doctor orders will appear here with normal ranges." />
                </Card>
              )}
            </div>
          )}
          {tab === 'meds' && <Meds me={me} />}
          {tab === 'visits' && <Visits me={me} />}
          {tab === 'allergies' && <Allergies me={me} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------- Timeline --------------------------------- */

type Event = { date: string; icon: ReactNode; tone: string; title: string; detail: string; tag?: ReactNode }

function Timeline({ me }: { me: Patient }) {
  const events = useMemo<Event[]>(() => {
    const ev: Event[] = []
    for (const v of me.visits) {
      ev.push({ date: v.date, icon: <Stethoscope size={16} />, tone: 'bg-brand-600 text-white', title: v.type, detail: `${DOCTORS.find((d) => d.id === v.doctorId)?.name} · ${v.diagnoses.join(', ')}` })
    }
    for (const l of me.labs) {
      const abn = l.results.filter((r) => r.flag !== 'normal').length
      ev.push({ date: l.date, icon: <Flask size={16} />, tone: 'bg-brand-50 text-brand-700', title: l.name, detail: `${l.kind} · ${l.facility}`, tag: l.status !== 'resulted' ? <Badge tone="brand">Pending</Badge> : abn ? <Badge tone="warn">{abn} flagged</Badge> : <Badge tone="ok">Normal</Badge> })
    }
    for (const r of me.referrals) {
      ev.push({ date: r.date, icon: <PaperPlaneTilt size={16} />, tone: 'bg-mist text-brand-800', title: `Referral to ${r.specialty}`, detail: `${r.to} · ${r.reason}`, tag: <Badge tone={r.status === 'completed' ? 'neutral' : 'brand'}>{r.status}</Badge> })
    }
    for (const m of me.medications) {
      ev.push({ date: m.since, icon: <Pill size={16} />, tone: 'bg-mist text-brand-800', title: `Started ${m.name} ${m.dose}`, detail: `Prescribed by ${m.prescribedBy}`, tag: m.status === 'stopped' ? <Badge>Stopped</Badge> : undefined })
    }
    for (const i of me.immunizations) {
      ev.push({ date: i.date, icon: <Syringe size={16} />, tone: 'bg-mist text-brand-800', title: i.name, detail: 'Vaccine given' })
    }
    if (me.isNew || me.createdAt) ev.push({ date: me.createdAt, icon: <ShieldCheck size={16} />, tone: 'bg-ok-soft text-ok', title: 'Record created', detail: 'Joined Himsog' })
    return ev.sort((a, b) => b.date.localeCompare(a.date))
  }, [me])

  const byYear = useMemo(() => {
    const groups: Record<string, Event[]> = {}
    for (const e of events) (groups[e.date.slice(0, 4)] ??= []).push(e)
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [events])

  return (
    <Card className="p-5 sm:p-8">
      {byYear.map(([year, list]) => (
        <div key={year} className="mb-8 last:mb-0">
          <p className="mb-4 text-sm font-semibold text-brand-700">{year}</p>
          <ol className="relative ml-4 border-l border-line">
            {list.map((e, i) => (
              <li key={i} className="relative mb-5 pl-8 last:mb-0">
                <span className={cn('absolute -left-4 grid size-8 place-items-center rounded-full ring-4 ring-surface', e.tone)}>{e.icon}</span>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">{e.title}</p>
                    <p className="text-[13px] text-muted">{e.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.tag}
                    <span className="text-xs text-faint tabular">{fmtDate(e.date, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Card>
  )
}

/* --------------------------------- Trends ---------------------------------- */

function Trends({ me }: { me: Patient }) {
  const [range, setRange] = useState<'1y' | '3y'>('3y')
  const cutoff = dayOffset(range === '1y' ? -366 : -1200)
  const rows = trendRows(me.vitals.filter((v) => v.date >= cutoff))
  if (me.vitals.length < 2) {
    return (
      <Card>
        <EmptyState icon={<Heartbeat size={26} />} title="Trends need a few readings" body="After two or more visits, your blood pressure and lab trends will be graphed here." />
      </Card>
    )
  }
  const hasA1c = me.vitals.some((v) => v.a1c)
  const hasLdl = me.vitals.some((v) => v.ldl)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Chip selected={range === '1y'} onClick={() => setRange('1y')}>Last 12 months</Chip>
        <Chip selected={range === '3y'} onClick={() => setRange('3y')}>Last 3 years</Chip>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Blood pressure" subtitle="Goal below 130/80 mmHg" action={<Legend items={[['Systolic', 'bg-brand-600'], ['Diastolic', 'bg-sky-soft']]} />} />
          <div className="p-4 sm:p-6">
            <TrendChart data={rows} unit="mmHg" goal={{ value: 130, label: 'Goal 130' }} series={[{ key: 'systolic', name: 'Systolic' }, { key: 'diastolic', name: 'Diastolic' }]} height={260} />
          </div>
        </Card>
        {hasA1c && (
          <Card>
            <CardHeader title="HbA1c" subtitle="Average blood sugar over 3 months. Goal below 7%" />
            <div className="p-4 sm:p-6">
              <TrendChart data={rows} unit="%" goal={{ value: 7, label: 'Goal 7%' }} series={[{ key: 'a1c', name: 'HbA1c' }]} domain={[6, 9]} />
            </div>
          </Card>
        )}
        {hasLdl && (
          <Card>
            <CardHeader title="LDL cholesterol" subtitle="Goal below 100 mg/dL" />
            <div className="p-4 sm:p-6">
              <TrendChart data={rows} unit="mg/dL" goal={{ value: 100, label: 'Goal 100' }} series={[{ key: 'ldl', name: 'LDL' }]} />
            </div>
          </Card>
        )}
        <Card className={cn(!hasA1c && !hasLdl && 'lg:col-span-2')}>
          <CardHeader title="Weight" subtitle="Kilograms" />
          <div className="p-4 sm:p-6">
            <TrendChart data={rows} unit="kg" series={[{ key: 'weight', name: 'Weight' }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Resting heart rate" subtitle="Beats per minute" />
          <div className="p-4 sm:p-6">
            <TrendChart data={rows} unit="bpm" series={[{ key: 'heartRate', name: 'Heart rate' }]} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="hidden gap-3 sm:flex">
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5 text-xs text-muted">
          <span className={cn('size-2 rounded-full', c)} /> {l}
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------- Meds ----------------------------------- */

function Meds({ me }: { me: Patient }) {
  const toast = useToast()
  const active = me.medications.filter((m) => m.status === 'active')
  const past = me.medications.filter((m) => m.status === 'stopped')
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Active medications" subtitle="Sent electronically to your pharmacy" />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
          {active.length === 0 && <p className="text-sm text-muted">No active medications.</p>}
          {active.map((m) => (
            <div key={m.id} className="flex flex-col rounded-2xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Pill size={20} />
                  </span>
                  <div>
                    <p className="font-semibold">
                      {m.name} <span className="font-normal text-muted">{m.dose}</span>
                    </p>
                    <p className="text-[13px] text-ink-2">{m.frequency}</p>
                  </div>
                </div>
                {m.refillsLeft === 0 ? <Badge tone="warn">No refills</Badge> : m.refillsLeft !== undefined ? <Badge tone="ok">{m.refillsLeft} refills</Badge> : null}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>
                  {m.prescribedBy} · since {fmtDate(m.since, { month: 'short', year: 'numeric' })}
                </span>
                <button onClick={() => toast({ tone: 'ok', title: 'Refill requested', body: `${m.name} request sent to ${m.prescribedBy}.` })} className="font-semibold text-brand-700 hover:underline">
                  Request refill
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {past.length > 0 && (
        <Card>
          <CardHeader title="Past medications" />
          <ul className="divide-y divide-line px-5 pb-3 pt-2 sm:px-6">
            {past.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-ink-2">
                  {m.name} {m.dose}
                </span>
                <Badge>Stopped</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* --------------------------------- Visits ---------------------------------- */

function Visits({ me }: { me: Patient }) {
  const [open, setOpen] = useState<string | null>(me.visits[0]?.id ?? null)
  if (!me.visits.length) {
    return (
      <Card>
        <EmptyState icon={<FileText size={26} />} title="No visits yet" body="After each consultation your doctor's summary and plan will appear here." />
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {me.visits.map((v) => {
        const d = DOCTORS.find((x) => x.id === v.doctorId)
        const isOpen = open === v.id
        return (
          <Card key={v.id} className="overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : v.id)} className="flex w-full items-center gap-4 p-5 text-left sm:p-6" aria-expanded={isOpen}>
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-center">
                <span className="text-[11px] font-medium uppercase text-brand-700">{fmtDate(v.date, { month: 'short' })}</span>
                <span className="-mt-1 text-lg font-semibold text-brand-800 tabular">{fmtDate(v.date, { day: 'numeric' })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold tracking-tight">{v.type}</p>
                <p className="truncate text-[13px] text-muted">
                  {d?.name} · {d?.specialty}
                </p>
              </div>
              <CaretDown size={18} className={cn('shrink-0 text-muted transition', isOpen && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-1 gap-5 border-t border-line p-5 sm:p-6 lg:grid-cols-[1.3fr_1fr]">
                    <div>
                      <p className="text-xs font-medium text-muted">Summary from your doctor</p>
                      <p className="mt-2 rounded-2xl bg-brand-50 p-4 text-[15px] leading-relaxed text-ink">{v.summary}</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {Object.entries(v.notes).map(([k, val]) => (
                          <div key={k} className="rounded-2xl border border-line p-3.5">
                            <p className="text-xs font-semibold text-brand-700">{k}</p>
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <Block title="Diagnoses" items={v.diagnoses} />
                      <Block title="Prescriptions" items={v.prescriptions} empty="No changes" />
                      <Block title="Tests ordered" items={v.orders} empty="None" />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        )
      })}
    </div>
  )
}

function Block({ title, items, empty = 'None' }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length ? items.map((i) => <Badge key={i} tone="brand">{i}</Badge>) : <span className="text-sm text-faint">{empty}</span>}
      </div>
    </div>
  )
}

/* -------------------------------- Allergies -------------------------------- */

function Allergies({ me }: { me: Patient }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Allergies" subtitle="Shown to every clinician before prescribing" />
        <div className="flex flex-wrap gap-2 p-5 sm:p-6">
          {me.allergies.length ? (
            me.allergies.map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3.5 py-1.5 text-sm font-medium text-danger">
                <Warning size={14} weight="fill" /> {a}
              </span>
            ))
          ) : (
            <p className="text-sm text-muted">No known allergies.</p>
          )}
        </div>
        <CardHeader title="Conditions" className="pt-2" />
        <div className="flex flex-wrap gap-2 p-5 sm:p-6">
          {me.conditions.length ? me.conditions.map((c) => <Badge key={c} tone="brand">{c}</Badge>) : <p className="text-sm text-muted">None recorded.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Immunizations" />
        <ul className="flex flex-col gap-2 p-5 sm:p-6">
          {me.immunizations.length === 0 && <li className="text-sm text-muted">No vaccines recorded yet.</li>}
          {me.immunizations.map((i) => (
            <li key={i.name} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
              <span className="flex items-center gap-3 text-sm font-medium">
                <Syringe size={18} className="text-brand-600" /> {i.name}
              </span>
              <span className="text-xs text-muted tabular">{fmtDate(i.date)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
