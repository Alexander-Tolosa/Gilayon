import { Flask, Image as ImageIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Badge } from '../../components/ui'
import type { LabOrder, Patient, VitalReading } from '../../data/types'
import { cn, fmtDate, todayISO } from '../../lib/utils'
import { useStore } from '../../store/store'

export function useSelf(): Patient {
  const { session, patients } = useStore()
  return patients.find((p) => p.id === session?.userId) ?? patients[0]
}

export function useMyAppointments(patientId: string) {
  const { appointments } = useStore()
  return useMemo(() => {
    const mine = appointments.filter((a) => a.patientId === patientId)
    const today = todayISO()
    const upcoming = mine
      .filter((a) => a.date >= today && !['completed', 'cancelled', 'no-show'].includes(a.status))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    const past = mine.filter((a) => !upcoming.includes(a)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    return { upcoming, past }
  }, [appointments, patientId])
}

export function trendRows(vitals: VitalReading[]) {
  return vitals.map((v) => ({
    label: fmtDate(v.date, { month: 'short', year: '2-digit' }),
    systolic: v.systolic,
    diastolic: v.diastolic,
    a1c: v.a1c,
    ldl: v.ldl,
    weight: v.weight,
    heartRate: v.heartRate,
  }))
}

export function LabCard({ lab, compact }: { lab: LabOrder; compact?: boolean }) {
  const abnormal = lab.results.filter((r) => r.flag !== 'normal').length
  return (
    <div className="rounded-3xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', lab.kind === 'Imaging' ? 'bg-mist text-brand-800' : 'bg-brand-50 text-brand-600')}>
            {lab.kind === 'Imaging' ? <ImageIcon size={18} /> : <Flask size={18} />}
          </span>
          <div>
            <p className="font-semibold tracking-tight text-ink">{lab.name}</p>
            <p className="text-[13px] text-muted">
              {fmtDate(lab.date)} · {lab.facility}
            </p>
          </div>
        </div>
        {lab.status !== 'resulted' ? (
          <Badge tone="brand">{lab.status === 'ordered' ? 'Ordered' : 'In progress'}</Badge>
        ) : abnormal ? (
          <Badge tone="warn">{abnormal} out of range</Badge>
        ) : (
          <Badge tone="ok">Normal</Badge>
        )}
      </div>
      {lab.status === 'resulted' && !compact && (
        <div className="border-t border-line px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Test</th>
                <th className="py-1.5 font-medium">Result</th>
                <th className="hidden py-1.5 font-medium sm:table-cell">Normal range</th>
              </tr>
            </thead>
            <tbody>
              {lab.results.map((r) => (
                <tr key={r.name}>
                  <td className="py-1.5 text-ink-2">{r.name}</td>
                  <td className={cn('py-1.5 font-semibold tabular', r.flag === 'high' ? 'text-danger' : r.flag === 'low' ? 'text-warn' : 'text-ink')}>
                    {r.value} {r.unit}
                    {r.flag !== 'normal' && <span className="ml-1.5 text-xs font-medium">{r.flag === 'high' ? 'High' : 'Low'}</span>}
                  </td>
                  <td className="hidden py-1.5 text-muted tabular sm:table-cell">{r.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lab.note && <p className="mt-2 text-[13px] text-muted">{lab.note}</p>}
        </div>
      )}
      {lab.status !== 'resulted' && !compact && (
        <p className="border-t border-line px-5 py-3 text-[13px] text-muted">Results will appear here as soon as {lab.facility} sends them. We'll notify you.</p>
      )}
    </div>
  )
}
