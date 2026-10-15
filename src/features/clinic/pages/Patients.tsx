import { ArrowsMerge, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Chip } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { useT } from '../lib/i18n'
import { findDuplicatePairs } from '../lib/duplicates'
import { ageOf, fmtDay, matchScore } from '../lib/helpers'
import { useClinic } from '../store/store'

type Filter = 'all' | 'employees' | 'dependents' | 'others' | 'seniors' | 'pwd' | 'flag' | 'paper'

export default function Patients() {
  const t = useT()
  const { data, online, recent, touch, staffById } = useClinic()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(40)

  const rows = useMemo(() => {
    const lastVisit = new Map<string, string>()
    const lastDoctor = new Map<string, { at: number; id: string }>()
    const doctors = new Map<string, Set<string>>()
    for (const c of data.consultations) {
      if ((lastVisit.get(c.patient_id) ?? '') < c.consult_date) lastVisit.set(c.patient_id, c.consult_date)
      if ((lastDoctor.get(c.patient_id)?.at ?? -1) < c.created_at) lastDoctor.set(c.patient_id, { at: c.created_at, id: c.doctor_id })
      doctors.set(c.patient_id, (doctors.get(c.patient_id) ?? new Set()).add(c.doctor_id))
    }
    const principalOf = new Map(data.relationships.map((r) => [r.related_patient_id, r.patient_id]))
    return data.patients
      .filter((p) => online || recent.includes(p.patient_id))
      .map((pt) => {
        const per = data.persons.find((x) => x.person_id === pt.person_id)!
        const emp = data.employees.find((e) => e.person_id === pt.person_id)
        const principalId = principalOf.get(pt.patient_id)
        const principal = principalId ? data.persons.find((x) => x.person_id === data.patients.find((z) => z.patient_id === principalId)?.person_id) : undefined
        const score = q ? matchScore(q, per.full_name, [emp?.employee_no ?? '', pt.patient_no, pt.legacy_folder_no ?? '']) : 1
        return { pt, per, emp, principal, last: lastVisit.get(pt.patient_id), lastDoctor: lastDoctor.get(pt.patient_id)?.id, doctorIds: [...(doctors.get(pt.patient_id) ?? [])], score }
      })
      .filter((r) => r.score >= 0.45)
      .filter((r) => (filter === 'employees' ? r.emp : filter === 'dependents' ? !r.emp && r.principal : filter === 'others' ? !r.emp && !r.principal : filter === 'seniors' ? ageOf(r.per.birthdate) >= 60 : filter === 'pwd' ? r.pt.pwd_id : filter === 'flag' ? r.pt.hr_flag : filter === 'paper' ? !r.pt.paper_status : true))
      .sort((a, b) => (q ? b.score - a.score : a.per.full_name.localeCompare(b.per.full_name)))
  }, [data, q, filter, online, recent])

  const dupCount = useMemo(() => findDuplicatePairs(data).filter((p) => !p.blocked).length, [data])

  const open = (id: string) => {
    touch(id)
    navigate(`/clinic/patients/${id}`)
  }

  return (
    <div>
      <PageTitle title={t('Patient registry')} sub={`${data.patients.length} patient records · ${data.employees.length} with employee details`} />
      {dupCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warn-soft px-5 py-3">
          <p className="text-base text-warn">
            <b>{dupCount}</b> {dupCount === 1 ? 'pair of records looks' : 'pairs of records look'} like the same person.
          </p>
          <Button variant="secondary" icon={<ArrowsMerge size={18} />} to="/clinic/patients/duplicates">
            Review possible duplicates
          </Button>
        </div>
      )}
      <div className="relative mb-4">
        <MagnifyingGlass size={26} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by name or employee ID')} aria-label={t('Search patients')} className="h-16 w-full rounded-full border-2 border-line-strong bg-surface pl-16 pr-6 text-xl placeholder:text-faint focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </div>
      {!online && <p className="mb-4 rounded-2xl bg-danger-soft px-5 py-3 text-base text-danger">{t('Offline: showing only records opened recently on this computer.')}</p>}
      <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ['all', 'All'],
            ['employees', 'Employees'],
            ['dependents', 'Dependents'],
            ['others', 'Other patients'],
            ['seniors', 'Seniors (60+)'],
            ['pwd', 'PWD'],
            ['flag', 'HR flag'],
            ['paper', 'Paper not checked'],
          ] as [Filter, string][]
        ).map(([f, l]) => (
          <Chip key={f} selected={filter === f} onClick={() => setFilter(f)} className="h-11 text-base">
            {l}
          </Chip>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_0.7fr_1.4fr_1.2fr_auto] gap-4 bg-canvas px-6 py-3 text-[15px] font-medium text-muted lg:grid">
          <span>{t('Full name')}</span>
          <span>{t('Age')}</span>
          <span>{t('Employee')} / {t('Dependent')}</span>
          <span>{t('Last visit')} / {t('Consulted by')}</span>
          <span />
        </div>
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r) => (
            <li key={r.pt.patient_id}>
              <button onClick={() => open(r.pt.patient_id)} className="grid w-full grid-cols-1 items-center gap-1 px-6 py-4 text-left transition hover:bg-brand-50/50 lg:grid-cols-[1.6fr_0.7fr_1.4fr_1.2fr_auto] lg:gap-4">
                <span className="min-w-0">
                  <span className="block break-words text-lg font-semibold">{r.per.full_name}</span>
                  <span className="block text-sm text-muted">
                    {r.pt.patient_no}
                    {r.pt.legacy_folder_no && ` · folder ${r.pt.legacy_folder_no}`}
                    {r.pt.hr_flag && <span className="ml-2 rounded-full bg-danger-soft px-2 font-semibold text-danger">HR flag</span>}
                    {!r.pt.paper_status && <span className="ml-2 rounded-full bg-warn-soft px-2 font-semibold text-warn">{t('Paper not checked')}</span>}
                  </span>
                </span>
                <span className="text-base tabular text-ink-2">
                  {ageOf(r.per.birthdate)} · {r.per.sex[0]} {r.pt.pwd_id && <span className="ml-1 rounded-full bg-brand-50 px-2 text-sm font-semibold text-brand-800">PWD</span>}
                </span>
                <span className="min-w-0 text-base text-ink-2">
                  {r.emp ? (
                    <>
                      <span className="font-mono text-brand-800">{r.emp.employee_no}</span> · <span className="break-words">{r.emp.office}</span>
                    </>
                  ) : r.principal ? (
                    <>
                      {t('Dependent')} of {r.principal.full_name}
                    </>
                  ) : (
                    <span className="text-muted">{t('No employee details')}</span>
                  )}
                </span>
                <span className="min-w-0 text-base text-ink-2">
                  {r.last ? fmtDay(r.last) : '—'}
                  {r.lastDoctor && (
                    <span className="block break-words text-sm text-muted" title={r.doctorIds.map((id) => staffById(id)?.name ?? '').filter(Boolean).join(', ')}>
                      {staffById(r.lastDoctor)?.name ?? ''}
                      {r.doctorIds.length > 1 && ` +${r.doctorIds.length - 1}`}
                    </span>
                  )}
                </span>
                <CaretRight size={20} className="hidden text-faint lg:block" />
              </button>
            </li>
          ))}
        </ul>
        {rows.length > limit && (
          <div className="border-t border-line p-4 text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + 60)}>
              Show more ({rows.length - limit} left)
            </Button>
          </div>
        )}
        {rows.length === 0 && <p className="p-8 text-center text-lg text-ink-2">{t('No records match.')}</p>}
      </Card>
    </div>
  )
}
