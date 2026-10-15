import { ArrowLeft, ArrowRight, CheckCircle, Flag, FolderOpen, IdentificationCard, MagnifyingGlass, Printer, ShieldCheck, Sparkle, UserPlus, Warning, XCircle } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Chip, Field, Input, Select, Textarea, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { PageTitle } from '../ClinicShell'
import { AgeSex, LaneBadge, TicketNo } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { ageOf, fmtDay, rankOf, rankTickets, todayKey } from '../lib/helpers'
import { useClinic, type SearchHit } from '../store/store'
import type { CategoryKey, CivilStatus, QueueTicket, ServiceType } from '../types'
import { DependentForm, ScanUploader } from '../components/ClinicForms'

type Step = 'search' | 'verify' | 'record' | 'priority' | 'done' | 'notlisted'

const STEPS: { key: Step; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'verify', label: 'Verify identity' },
  { key: 'record', label: 'Past patient with records?' },
  { key: 'priority', label: 'Priority lane' },
  { key: 'done', label: 'Queue number' },
]

export default function CheckIn() {
  const t = useT()
  const [step, setStep] = useState<Step>('search')
  const [personId, setPersonId] = useState<string | null>(null)
  const [ticket, setTicket] = useState<QueueTicket | null>(null)
  const { patientOfPerson } = useClinic()
  const patientId = personId ? patientOfPerson(personId)?.patient_id : undefined

  const restart = () => {
    setStep('search')
    setPersonId(null)
    setTicket(null)
  }

  const idx = STEPS.findIndex((s) => s.key === step)
  return (
    <div>
      <PageTitle title={t('Check-in')} sub="Nobody gets a queue number until their identity is checked against the HR list." />
      {step !== 'notlisted' && (
        <ol className="mb-6 grid grid-cols-5 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-col gap-2">
              <span className={cn('h-2 rounded-full transition-colors duration-500', i <= idx ? 'bg-brand-600' : 'bg-line')} />
              <span className={cn('hidden text-[15px] md:block', i === idx ? 'font-semibold text-brand-800' : 'text-muted')}>
                {i + 1}. {t(s.label)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {step === 'search' && (
            <SearchStep
              onPick={(id) => {
                setPersonId(id)
                setStep('verify')
              }}
              onNotListed={() => setStep('notlisted')}
            />
          )}
          {step === 'notlisted' && (
            <NotListed
              onBack={() => setStep('search')}
              onCreated={(pid) => {
                setPersonId(pid)
                setStep('record')
              }}
            />
          )}
          {step === 'verify' && personId && <VerifyStep personId={personId} onBack={restart} onOk={() => setStep('record')} />}
          {step === 'record' && patientId && <RecordStep patientId={patientId} onBack={() => setStep('verify')} onNext={() => setStep('priority')} />}
          {step === 'priority' && patientId && (
            <PriorityStep
              patientId={patientId}
              onBack={() => setStep('record')}
              onIssued={(tk) => {
                setTicket(tk)
                setStep('done')
              }}
            />
          )}
          {step === 'done' && ticket && <DoneStep ticket={ticket} onNext={restart} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------- Search --------------------------------- */

function HitRow({ hit, onPick }: { hit: SearchHit; onPick: () => void }) {
  const t = useT()
  const { isReturning, employeeOfPerson } = useClinic()
  const returning = hit.patient && isReturning(hit.patient.patient_id)
  const principalEmp = hit.principal && employeeOfPerson(hit.principal.person_id)
  return (
    <button onClick={onPick} className="grid w-full grid-cols-1 items-center gap-3 rounded-3xl border border-line bg-surface p-5 text-left transition hover:border-brand-300 hover:shadow-soft sm:grid-cols-[1.5fr_1fr_1.3fr_auto]">
      <div className="min-w-0">
        <p className="break-words text-xl font-semibold">{hit.person.full_name}</p>
        <p className="text-[15px] text-ink-2">
          <AgeSex birthdate={hit.person.birthdate} sex={hit.person.sex} />
        </p>
      </div>
      <div>
        <p className="text-sm text-muted">{t('Birthdate')}</p>
        <p className="text-[17px] font-medium tabular">{fmtDay(hit.person.birthdate)}</p>
      </div>
      <div className="min-w-0">
        {hit.employee ? (
          <>
            <p className="font-mono text-[17px] font-semibold text-brand-800">{hit.employee.employee_no}</p>
            <p className="break-words text-[15px] text-muted">{hit.employee.office}</p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-medium">
              {t('Dependent')} of {hit.principal?.full_name ?? '—'}
            </p>
            <p className="font-mono text-[15px] text-muted">{principalEmp?.employee_no}</p>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {hit.patient?.hr_flag && <span className="rounded-full bg-danger-soft px-3 py-1 text-sm font-semibold text-danger">HR flag</span>}
        <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', returning ? 'bg-ok-soft text-ok' : 'bg-brand-50 text-brand-800')}>{returning ? t('Has records') : t('New record')}</span>
      </div>
    </button>
  )
}

function SearchStep({ onPick, onNotListed }: { onPick: (personId: string) => void; onNotListed: () => void }) {
  const t = useT()
  const { data, search, online, recent, personOfPatient } = useClinic()
  const [q, setQ] = useState('')
  const hits = useMemo(() => search(q, 8), [q, search])
  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <MagnifyingGlass size={28} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Search by name or employee ID')}
          aria-label={t('Search by name or employee ID')}
          className="h-16 w-full rounded-full border-2 border-line-strong bg-surface pl-16 pr-6 text-lg text-ink sm:h-20 sm:text-2xl placeholder:text-faint focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </div>
      {!online && <p className="rounded-2xl bg-danger-soft px-5 py-3 text-base text-danger">This computer is offline, so search only covers recently opened records. Queue numbers need the clinic server.</p>}
      {!q && (
        <Card className="p-6">
          {/* Sample searches exist only on the demo server; a real clinic sees the search tips alone. */}
          <p className="text-lg font-semibold">{data.demo ? 'Try the demo' : 'Find a patient'}</p>
          {data.demo && (
            <div className="mt-3 flex flex-wrap gap-2">
              {['Maria Lourdes Villanueva', 'IPG-2004-0318', 'jose dlacruz', 'Carlo Sorongon', 'Kristine Villanueva'].map((s) => (
                <Chip key={s} onClick={() => setQ(s)} className="h-11 text-base">
                  {s}
                </Chip>
              ))}
            </div>
          )}
          <p className="mt-3 text-[15px] text-muted">Search tolerates typos and shows birthdate and employee ID side by side, so people with similar names are easy to tell apart.</p>
          {recent.length > 0 && (
            <>
              <p className="mt-5 text-base font-semibold">{t('Recently opened')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.slice(0, 6).map((id) => {
                  const p = personOfPatient(id)
                  return p ? (
                    <Chip key={id} onClick={() => setQ(p.full_name)} className="h-11 text-base">
                      {p.full_name}
                    </Chip>
                  ) : null
                })}
              </div>
            </>
          )}
        </Card>
      )}
      {q && (
        <div className="flex flex-col gap-3">
          {hits.map((h) => (
            <HitRow key={h.person.person_id} hit={h} onPick={() => onPick(h.person.person_id)} />
          ))}
          {hits.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-lg text-ink-2">No one on the employee list or in the records matches “{q}”.</p>}
        </div>
      )}
      <button onClick={onNotListed} className="flex items-center gap-3 self-start rounded-full border-2 border-dashed border-line-strong px-6 py-4 text-lg font-medium text-ink-2 transition hover:border-brand-400 hover:text-brand-800">
        <UserPlus size={24} /> {t('Not on the employee list?')}
      </button>
    </div>
  )
}

/* ------------------------------- Not listed -------------------------------- */

function NotListed({ onBack, onCreated }: { onBack: () => void; onCreated: (personId: string) => void }) {
  const t = useT()
  const { search, flagForHR, personOfPatient } = useClinic()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [principal, setPrincipal] = useState<string | null>(null)
  const [hrName, setHrName] = useState('')
  const hits = useMemo(() => search(q, 6).filter((h) => h.employee), [q, search])
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={18} /> {t('Back')}
        </button>
        <h2 className="text-2xl font-semibold tracking-tight">Create a dependent linked to an employee</h2>
        <p className="mt-1 text-base text-ink-2">Spouses, children and parents are patients too. Find the employee first.</p>
        {!principal ? (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee's name or employee ID" className="mt-5 h-14 text-lg" autoFocus />
            <div className="mt-3 flex flex-col gap-2">
              {hits.map((h) => (
                <button key={h.person.person_id} onClick={() => setPrincipal(h.patient!.patient_id)} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4 text-left hover:border-brand-300">
                  <span>
                    <span className="block text-lg font-semibold">{h.person.full_name}</span>
                    <span className="block text-[15px] text-muted">
                      {fmtDay(h.person.birthdate)} · {h.employee!.office}
                    </span>
                  </span>
                  <span className="font-mono text-base text-brand-800">{h.employee!.employee_no}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5">
            <p className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-base">
              Employee: <b>{personOfPatient(principal)?.full_name}</b>{' '}
              <button className="ml-2 font-semibold text-brand-700 underline" onClick={() => setPrincipal(null)}>
                change
              </button>
            </p>
            <DependentForm
              principalPatientId={principal}
              onCancel={() => setPrincipal(null)}
              onDone={(pid) => {
                const per = personOfPatient(pid)
                if (per) onCreated(per.person_id)
              }}
            />
          </div>
        )}
      </Card>
      <Card className="h-fit p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Flag size={22} className="text-danger" /> Or flag it for HR
        </h2>
        <p className="mt-1 text-base text-ink-2">For an employee who is missing from the HR list. No queue number is issued until HR resolves it.</p>
        <Field label="Name and what is wrong" className="mt-4">
          <Textarea value={hrName} onChange={(e) => setHrName(e.target.value)} placeholder="e.g. Rodel Gaitan, new hire at PEO, not yet on the list" className="text-base" />
        </Field>
        <Button
          variant="danger"
          size="lg"
          className="mt-4"
          disabled={hrName.trim().length < 5}
          onClick={() => {
            flagForHR('not-on-list', hrName.trim())
            toast({ tone: 'warn', title: 'Flagged for HR', body: 'Logged in the audit trail. Ask the patient to return once HR updates the list.' })
            setHrName('')
          }}
        >
          Flag for HR
        </Button>
      </Card>
    </div>
  )
}

/* --------------------------------- Verify ---------------------------------- */

function VerifyStep({ personId, onBack, onOk }: { personId: string; onBack: () => void; onOk: () => void }) {
  const t = useT()
  const { data, person, employeeOfPerson, patientOfPerson, verify, flagForHR, principalOf } = useClinic()
  const toast = useToast()
  const p = person(personId)!
  const emp = employeeOfPerson(personId)
  const pt = patientOfPerson(personId)
  const principal = pt && !emp ? principalOf(pt.patient_id) : undefined
  const principalEmp = principal && employeeOfPerson(principal.principal.person_id)
  const [name, setName] = useState(p.full_name)
  const [birth, setBirth] = useState('')
  const [empNo, setEmpNo] = useState('')
  const [result, setResult] = useState<{ ok: boolean; mismatches: string[] } | null>(null)

  const run = () => {
    const r = verify(personId, { full_name: name, birthdate: birth, employee_no: emp ? empNo : undefined, principal_no: emp ? undefined : empNo })
    setResult(r)
    if (r.ok) setTimeout(onOk, 650)
  }
  const fillFromId = () => {
    setName(p.full_name)
    setBirth(p.birthdate)
    setEmpNo(emp?.employee_no ?? principalEmp?.employee_no ?? '')
    setResult(null)
  }
  const row = (label: string, entered: string, onFile: string) => {
    const bad = result && !result.ok && result.mismatches.some((m) => m.startsWith(label))
    const good = result && !bad
    return (
      <div className={cn('grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl px-4 py-3', bad ? 'bg-danger-soft' : good ? 'bg-ok-soft' : 'bg-canvas')}>
        <div>
          <p className="text-sm text-muted">{t(label)}</p>
          <p className="text-[17px] font-medium">{entered || '—'}</p>
          {result && <p className="text-sm text-muted">HR list: {onFile}</p>}
        </div>
        {bad ? <XCircle size={28} weight="fill" className="text-danger" /> : good ? <CheckCircle size={28} weight="fill" className="text-ok" /> : null}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Card className="p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={18} /> {t('Back')}
        </button>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IdentificationCard size={28} className="text-brand-600" /> {t('Verify identity')}
        </h2>
        <p className="mt-1 text-base text-ink-2">Ask the patient, or read their ID. Type what they give you; the system compares it with the HR list.</p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('Full name')} className="sm:col-span-2">
            <Input value={name} onChange={(e) => (setName(e.target.value), setResult(null))} className="h-14 text-lg" />
          </Field>
          <Field label={t('Birthdate')}>
            <Input type="date" value={birth} onChange={(e) => (setBirth(e.target.value), setResult(null))} className="h-14 text-lg" />
          </Field>
          <Field label={emp ? t('Employee ID') : "Employee ID of the employee they are under"}>
            <Input value={empNo} onChange={(e) => (setEmpNo(e.target.value), setResult(null))} placeholder="IPG-0000-0000" className="h-14 font-mono text-lg uppercase" />
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" className="h-14 px-8 text-lg" onClick={run} disabled={!name || !birth || !empNo} icon={<ShieldCheck size={22} weight="fill" />}>
            {t('Verify')}
          </Button>
          {data.demo && (
            <button onClick={fillFromId} className="inline-flex items-center gap-1.5 rounded-full px-4 py-3 text-base font-medium text-brand-700 hover:bg-brand-50">
              <Sparkle size={18} weight="fill" /> Demo: fill from ID
            </button>
          )}
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-6">
          <p className="text-base font-semibold text-ink-2">Checking against the HR list</p>
          <div className="mt-4 flex flex-col gap-2">
            {row('Full name', name, p.full_name)}
            {row('Birthdate', birth ? fmtDay(birth) : '', fmtDay(p.birthdate))}
            {row(emp ? 'Employee ID' : 'Employee ID of the principal', empNo.toUpperCase(), emp?.employee_no ?? principalEmp?.employee_no ?? 'not on file')}
          </div>
          {result?.ok && (
            <p className="mt-4 flex items-center gap-2 text-lg font-semibold text-ok">
              <CheckCircle size={24} weight="fill" /> {t('Matches the HR list')}
            </p>
          )}
        </Card>
        {result && !result.ok && (
          <Card className="border-[#f8cfd1] bg-danger-soft p-6" as="div">
            <p className="flex items-center gap-2 text-lg font-semibold text-danger">
              <Warning size={24} weight="fill" /> {t('Does not match the HR list')}
            </p>
            <p className="mt-1 text-base text-ink-2">{result.mismatches.join(', ')} did not match. No queue number until this is resolved: check an ID, then re-enter, or flag the HR list.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setResult(null)}>
                Re-enter
              </Button>
              <Button
                variant="danger"
                icon={<Flag size={18} />}
                onClick={() => {
                  flagForHR(personId, `${result.mismatches.join(', ')} on the HR list may be wrong for ${p.full_name}`)
                  toast({ tone: 'warn', title: 'Flagged for HR', body: 'The record shows an HR flag until it is fixed.' })
                }}
              >
                Flag the HR list
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ Record step -------------------------------- */

function RecordStep({ patientId, onBack, onNext }: { patientId: string; onBack: () => void; onNext: () => void }) {
  const t = useT()
  const { data, patient, personOfPatient, employeeOfPerson, isReturning, completeRecord, touch } = useClinic()
  const pt = patient(patientId)!
  const p = personOfPatient(patientId)!
  const emp = employeeOfPerson(p.person_id)
  const systemSays = isReturning(patientId)
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const consults = data.consultations.filter((c) => c.patient_id === patientId)
  const lastVisit = consults.sort((a, b) => b.created_at - a.created_at)[0]
  const allergies = data.allergies.filter((a) => a.patient_id === patientId)
  const scans = data.scans.filter((s) => s.patient_id === patientId)
  const dependents = data.relationships.filter((r) => r.patient_id === patientId)
  const [form, setForm] = useState({ civil_status: pt.civil_status, philhealth_pin: pt.philhealth_pin ?? '', pwd_id: pt.pwd_id ?? '', contact: p.contact })
  const [addDep, setAddDep] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={18} /> {t('Back')}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{p.full_name}</p>
            <p className="text-base text-ink-2">
              <AgeSex birthdate={p.birthdate} sex={p.sex} /> · {pt.patient_no}
              {emp && ` · ${emp.employee_no} · ${emp.office}`}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-ok-soft px-4 py-2 text-base font-semibold text-ok">
            <CheckCircle size={20} weight="fill" /> Identity verified
          </span>
        </div>
        <h2 className="mt-6 text-xl font-semibold">{t('Past patient with records?')}</h2>
        <p className="text-base text-ink-2">Ask the patient. The system found {systemSays ? `${consults.length} digital visit${consults.length === 1 ? '' : 's'}${pt.legacy_folder_no ? ` and old paper folder ${pt.legacy_folder_no}` : ''}.` : 'no visits and no paper folder.'}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => setAnswer('yes')} className={cn('flex items-center gap-4 rounded-3xl border-2 p-5 text-left transition', answer === 'yes' ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300')}>
            <FolderOpen size={32} className="text-brand-600" />
            <span>
              <span className="block text-lg font-semibold">{t('Yes, open the record')}</span>
              <span className="block text-[15px] text-muted">Full history loads. Scan the old folder this visit.</span>
            </span>
          </button>
          <button onClick={() => setAnswer('no')} className={cn('flex items-center gap-4 rounded-3xl border-2 p-5 text-left transition', answer === 'no' ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300')}>
            <UserPlus size={32} className="text-brand-600" />
            <span>
              <span className="block text-lg font-semibold">{t('No, new to the clinic')}</span>
              <span className="block text-[15px] text-muted">Start from the HR list and link dependents.</span>
            </span>
          </button>
        </div>
        {answer === 'no' && systemSays && <p className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-base text-warn">The system already has records for this person. Open them instead of starting over, so the history stays in one place.</p>}
      </Card>

      {answer === 'yes' && (
        <Card className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-sm text-muted">Last visit</p>
              <p className="text-lg font-semibold">{lastVisit ? `${fmtDay(lastVisit.consult_date)} · ${lastVisit.chief_complaint}` : 'No digital visit yet'}</p>
            </div>
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-sm text-muted">{t('Allergies')}</p>
              <p className={cn('text-lg font-semibold', allergies.length > 0 && 'text-danger')}>{allergies.length ? allergies.map((a) => a.substance).join(', ') : t('No known allergies')}</p>
            </div>
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-sm text-muted">{t('Old paper records')}</p>
              <p className="text-lg font-semibold">
                {pt.legacy_folder_no ?? 'No folder'} · {scans.length} page{scans.length === 1 ? '' : 's'} scanned
              </p>
            </div>
          </div>
          {pt.legacy_folder_no && (
            <div className="mt-5">
              <p className="mb-2 text-lg font-semibold">Old paper folder? Scan it this visit.</p>
              <ScanUploader patientId={patientId} compact />
            </div>
          )}
          <Link to={`/clinic/patients/${patientId}`} onClick={() => touch(patientId)} className="mt-4 inline-block text-base font-semibold text-brand-700 underline underline-offset-4">
            {t('Open record')} in full
          </Link>
        </Card>
      )}

      {answer === 'no' && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold">Complete the record from the HR list</h3>
          <p className="text-base text-ink-2">Name, birthdate, sex and office come from HR. Fill in the rest.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('Civil status')}>
              <Select value={form.civil_status} onChange={(e) => setForm({ ...form, civil_status: e.target.value as CivilStatus })} className="h-12 text-base">
                {(['Single', 'Married', 'Widowed', 'Separated'] as CivilStatus[]).map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Contact')}>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="h-12 text-base" />
            </Field>
            <Field label={t('PhilHealth PIN')} optional>
              <Input value={form.philhealth_pin} onChange={(e) => setForm({ ...form, philhealth_pin: e.target.value })} className="h-12 text-base" />
            </Field>
            <Field label={t('PWD ID')} optional>
              <Input value={form.pwd_id} onChange={(e) => setForm({ ...form, pwd_id: e.target.value })} className="h-12 text-base" />
            </Field>
          </div>
          {emp && (
            <div className="mt-5">
              <p className="text-lg font-semibold">{t('Relatives')}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {dependents.map((d) => (
                  <li key={d.relationship_id} className="rounded-full bg-brand-50 px-4 py-2 text-base text-brand-800">
                    {personOfPatient(d.related_patient_id)?.full_name} · {d.relationship_type}
                    {d.listed_in_mdr && ' · MDR'}
                  </li>
                ))}
                {!dependents.length && <li className="text-base text-muted">No dependents linked yet.</li>}
              </ul>
              {addDep ? (
                <div className="mt-4 rounded-3xl border border-line p-5">
                  <DependentForm principalPatientId={patientId} onDone={() => setAddDep(false)} onCancel={() => setAddDep(false)} />
                </div>
              ) : (
                <Button variant="secondary" className="mt-3" icon={<UserPlus size={18} />} onClick={() => setAddDep(true)}>
                  {t('Add dependent')}
                </Button>
              )}
            </div>
          )}
          <div className="mt-5">
            <Button
              variant="soft"
              onClick={() => completeRecord(patientId, { civil_status: form.civil_status, philhealth_pin: form.philhealth_pin || undefined, pwd_id: form.pwd_id || undefined, contact: form.contact })}
            >
              {t('Save')}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button size="lg" className="h-14 px-8 text-lg" disabled={!answer} onClick={onNext} iconRight={<ArrowRight size={22} weight="bold" />}>
          {t('Next')}: {t('Priority lane')}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ Priority step ------------------------------ */

const REASONS = ['Consultation', 'Follow-up', 'Blood pressure check', 'Medical certificate', 'Toothache', 'Dental cleaning', 'Laboratory tests']

function PriorityStep({ patientId, onBack, onIssued }: { patientId: string; onBack: () => void; onIssued: (t: QueueTicket) => void }) {
  const t = useT()
  const { data, patient, personOfPatient, issueTicket, online } = useClinic()
  const toast = useToast()
  const pt = patient(patientId)!
  const p = personOfPatient(patientId)!
  const senior = ageOf(p.birthdate) >= 60
  const [urgent, setUrgent] = useState(false)
  const [pregnant, setPregnant] = useState(false)
  const [pwd, setPwd] = useState(!!pt.pwd_id)
  const [service, setService] = useState<ServiceType>('Medical')
  const [reason, setReason] = useState('')
  const cats: CategoryKey[] = [...(urgent ? (['urgent'] as const) : []), ...(pregnant ? (['pregnant'] as const) : []), ...(pwd ? (['pwd'] as const) : []), ...(senior ? (['senior'] as const) : [])]
  const lane: CategoryKey = cats.length ? [...cats].sort((a, b) => rankOf(a, data.categories) - rankOf(b, data.categories))[0] : 'regular'
  const ahead = data.tickets.filter((x) => x.day === todayKey() && x.status === 'waiting' && rankOf(x.category_id, data.categories) <= rankOf(lane, data.categories)).length

  const toggle = (label: string, on: boolean, set: (v: boolean) => void, note: string, disabled?: boolean) => (
    <button disabled={disabled} onClick={() => set(!on)} aria-pressed={on} className={cn('flex items-center justify-between gap-3 rounded-3xl border-2 p-5 text-left transition disabled:cursor-default', on ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300', disabled && !on && 'opacity-50')}>
      <span>
        <span className="block text-xl font-semibold">{t(label)}</span>
        <span className="block text-[15px] text-muted">{note}</span>
      </span>
      <span className={cn('grid size-9 place-items-center rounded-full border-2', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong')}>{on && <CheckCircle size={22} weight="fill" />}</span>
    </button>
  )

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Card className="p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={18} /> {t('Back')}
        </button>
        <h2 className="text-2xl font-semibold tracking-tight">{t('Priority lane')}</h2>
        <p className="text-base text-ink-2">Urgent, pregnant, PWD and senior patients go first. If more than one applies, the highest-ranked lane is used.</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {toggle('Urgent', urgent, setUrgent, 'Flagged by staff. Goes to the top of the queue.')}
          {toggle('Pregnant', pregnant, setPregnant, p.sex === 'Female' ? 'Marked at check-in, since it changes over time.' : 'Not applicable', p.sex !== 'Female')}
          {toggle('PWD', pwd, setPwd, pt.pwd_id ? `PWD ID on record: ${pt.pwd_id}` : 'Add the PWD ID to the record after checking it.')}
          {toggle('Senior', senior, () => {}, senior ? `Age ${ageOf(p.birthdate)}, calculated from the birthdate.` : `Age ${ageOf(p.birthdate)}. Senior is 60 or older.`, true)}
        </div>
        <h3 className="mt-7 text-xl font-semibold">{t('Service')}</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {(['Medical', 'Dental', 'Laboratory'] as ServiceType[]).map((s) => (
            <button key={s} onClick={() => setService(s)} className={cn('h-16 rounded-2xl border-2 text-lg font-semibold transition', service === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-300')}>
              {t(s)}
            </button>
          ))}
        </div>
        <Field label={t('Reason') + ' (optional)'} className="mt-6">
          <div className="mb-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Chip key={r} selected={reason === r} onClick={() => setReason(r)} className="h-11 text-[15px]">
                {r}
              </Chip>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-12 text-base" />
        </Field>
      </Card>
      <Card className="flex h-fit flex-col gap-4 p-6">
        <p className="text-base font-semibold text-ink-2">This ticket</p>
        <div className="flex items-center gap-3">
          <LaneBadge category={lane} className="px-4 py-2 text-lg" />
          <span className="text-base text-muted">rank {rankOf(lane, data.categories)}</span>
        </div>
        <p className="text-lg">
          <b className="tabular">{ahead}</b> {ahead === 1 ? 'person' : 'people'} ahead in this lane or higher.
        </p>
        {!online && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-base text-danger">Only the clinic server issues queue numbers. Reconnect this computer first.</p>}
        <Button
          size="lg"
          className="h-16 text-xl"
          disabled={!online}
          onClick={async () => {
            const tk = await issueTicket(patientId, cats, service, reason)
            if (tk) onIssued(tk)
            else toast({ tone: 'warn', title: 'Needs the clinic server' })
          }}
        >
          {t('Issue queue number')}
        </Button>
      </Card>
    </div>
  )
}

/* ---------------------------------- Done ----------------------------------- */

function DoneStep({ ticket, onNext }: { ticket: QueueTicket; onNext: () => void }) {
  const t = useT()
  const { data, personOfPatient } = useClinic()
  const p = personOfPatient(ticket.patient_id)!
  const waiting = rankTickets(
    data.tickets.filter((x) => x.day === todayKey() && x.status === 'waiting'),
    data.categories,
  )
  const position = waiting.findIndex((x) => x.ticket_id === ticket.ticket_id) + 1
  const navigate = useNavigate()
  return (
    <Card className="mx-auto max-w-2xl p-8 text-center">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
        <TicketNo ticket={ticket} size="xl" />
      </motion.div>
      <p className="mt-6 text-2xl font-semibold">{p.full_name}</p>
      <div className="mt-2 flex items-center justify-center gap-2">
        <LaneBadge category={ticket.category_id} />
        <span className="text-lg text-ink-2">
          {t(ticket.service_type)} · #{position} in line
        </span>
      </div>
      <p className="mt-4 text-lg text-ink-2">{t('Please wait for your number to be called.')}</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button size="lg" variant="secondary" className="h-14 text-lg" icon={<Printer size={22} />} onClick={() => window.open(`/print/ticket/${ticket.ticket_id}`, '_blank')}>
          {t('Print slip')}
        </Button>
        <Button size="lg" className="h-14 text-lg" onClick={onNext} iconRight={<ArrowRight size={22} weight="bold" />}>
          {t('Check in next patient')}
        </Button>
      </div>
      <button onClick={() => navigate('/clinic/queue')} className="mt-5 text-base font-semibold text-brand-700 underline underline-offset-4">
        {t('Queue board')}
      </button>
    </Card>
  )
}
