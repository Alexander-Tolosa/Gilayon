import { Printer } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, Input } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { useT } from '../lib/i18n'
import { dayKeyOffset, fmtDay, fmtMinutes, minutesBetween, todayKey } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { CategoryKey } from '../types'

export function useDailyReport(day: string) {
  const { data } = useClinic()
  return useMemo(() => {
    const tickets = data.tickets.filter((t) => t.day === day)
    const seen = tickets.filter((t) => t.status === 'done')
    const waits = tickets.filter((t) => t.called_at).map((t) => minutesBetween(t.checked_in_at, t.called_at!))
    const byLane = (['urgent', 'pregnant', 'pwd', 'senior', 'regular'] as CategoryKey[]).map((c) => ({ lane: c, count: tickets.filter((t) => t.category_id === c).length }))
    const consults = data.consultations.filter((c) => c.consult_date === day)
    const complaints = new Map<string, number>()
    for (const c of consults) complaints.set(c.chief_complaint, (complaints.get(c.chief_complaint) ?? 0) + 1)
    const diagnoses = new Map<string, number>()
    for (const d of data.diagnoses.filter((x) => consults.some((c) => c.consultation_id === x.consultation_id))) diagnoses.set(`${d.icd10_code} ${d.description}`, (diagnoses.get(`${d.icd10_code} ${d.description}`) ?? 0) + 1)
    const inDay = (ts?: number) => !!ts && todayKeyOf(ts) === day
    const rxIssued = data.prescriptions.filter((r) => r.status !== 'draft' && inDay(r.issued_at)).length
    const mcIssued = data.documents.filter((d) => d.status !== 'draft' && inDay(d.issued_at)).length
    const voided = data.audit.filter((a) => a.action === 'void' && todayKeyOf(a.logged_at) === day).length
    const byService = (['Medical', 'Dental', 'Laboratory'] as const).map((s) => ({ service: s, count: tickets.filter((t) => t.service_type === s).length }))
    const byDoctor = data.staff.filter((s) => s.role === 'doctor').map((d) => ({ name: d.name, count: seen.filter((t) => t.doctor_id === d.staff_id).length }))
    return {
      visits: tickets.length,
      seen: seen.length,
      returning: tickets.filter((t) => t.is_returning).length,
      newPatients: tickets.filter((t) => !t.is_returning).length,
      left: tickets.filter((t) => t.status === 'left').length,
      stillWaiting: tickets.filter((t) => t.status === 'waiting').length,
      avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
      maxWait: waits.length ? Math.max(...waits) : 0,
      byLane,
      byService,
      byDoctor,
      complaints: [...complaints.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      diagnoses: [...diagnoses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      rxIssued,
      mcIssued,
      voided,
    }
  }, [data, day])
}

function todayKeyOf(ts: number) {
  return todayKey(new Date(ts))
}

export default function DailyReport() {
  const t = useT()
  const [day, setDay] = useState(todayKey())
  const r = useDailyReport(day)
  const { data } = useClinic()
  const week = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => dayKeyOffset(i - 13))
        .map((d) => ({ d, n: data.tickets.filter((t) => t.day === d).length }))
        .filter((x) => x.n > 0)
        .map((x) => ({ label: fmtDay(x.d).replace(/, \d{4}$/, ''), visits: x.n })),
    [data.tickets],
  )
  const laneLabel: Record<CategoryKey, string> = { urgent: 'Urgent', pregnant: 'Pregnant', pwd: 'PWD', senior: 'Senior', regular: 'Regular' }

  return (
    <div>
      <PageTitle
        title={t('Daily report')}
        sub="Builds itself from the day's check-ins and consultations. Printable for the Hospital Management Officer."
        actions={
          <>
            <Input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value || todayKey())} className="h-12 w-48 text-base" aria-label="Report date" />
            <Button size="lg" icon={<Printer size={20} />} onClick={() => window.open(`/print/report/${day}`, '_blank')}>
              {t('Print')} PDF
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t('Visits today'), r.visits, `${r.seen} seen · ${r.stillWaiting} still waiting`],
          [t('Average wait'), fmtMinutes(r.avgWait), `Longest ${fmtMinutes(r.maxWait)}, check-in to being called`],
          [`${t('New patients')} / ${t('Returning patients').toLowerCase()}`, `${r.newPatients} / ${r.returning}`, `${t('Left without being seen')}: ${r.left}`],
          [t('Documents issued'), r.rxIssued + r.mcIssued, `${r.rxIssued} prescription${r.rxIssued === 1 ? '' : 's'} · ${r.mcIssued} certificate${r.mcIssued === 1 ? '' : 's'} · ${r.voided} voided`],
        ].map(([k, v, s]) => (
          <Card key={String(k)} className="p-5">
            <p className="text-base text-ink-2">{k}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular">{v}</p>
            <p className="mt-1 text-sm text-muted">{s}</p>
          </Card>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-lg font-semibold">Visits by priority lane</p>
          <ul className="mt-4 flex flex-col gap-3">
            {r.byLane.map((l) => (
              <li key={l.lane} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-base">
                <span>{t(laneLabel[l.lane])}</span>
                <span className="h-3 rounded-full bg-brand-600" style={{ width: `${r.visits ? Math.max(2, (l.count / r.visits) * 100) : 0}%` }} />
                <span className="text-right font-semibold tabular">{l.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {r.byService.map((s) => (
              <div key={s.service} className="rounded-2xl bg-canvas p-4">
                <p className="text-sm text-muted">{t(s.service)}</p>
                <p className="text-2xl font-semibold tabular">{s.count}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">Visits, last two weeks</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#e3eaf6" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#eef3fc' }} />
                <Bar dataKey="visits" fill="#2350d6" radius={[6, 6, 6, 6]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">{t('Common complaints')}</p>
          <ol className="mt-3 flex flex-col gap-2">
            {r.complaints.length === 0 && <li className="text-base text-muted">No consultations recorded.</li>}
            {r.complaints.map(([c, n]) => (
              <li key={c} className="flex justify-between rounded-2xl bg-canvas px-4 py-3 text-base">
                <span>{c}</span>
                <b className="tabular">{n}</b>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">Common diagnoses</p>
          <ol className="mt-3 flex flex-col gap-2">
            {r.diagnoses.length === 0 && <li className="text-base text-muted">No diagnoses recorded.</li>}
            {r.diagnoses.map(([c, n]) => (
              <li key={c} className="flex justify-between rounded-2xl bg-canvas px-4 py-3 text-base">
                <span>{c}</span>
                <b className="tabular">{n}</b>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-lg font-semibold">Seen by doctor</p>
          <ul className="mt-2 flex flex-col gap-2">
            {r.byDoctor.map((d) => (
              <li key={d.name} className="flex justify-between text-base">
                <span>{d.name}</span>
                <b className="tabular">{d.count}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
