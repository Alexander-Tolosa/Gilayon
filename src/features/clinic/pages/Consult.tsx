import { ArrowLeft, CheckCircle, CloudArrowUp, FileText, Plus, Printer, Robot, Signature, Trash, Warning, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Field, Input, Textarea, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { AgeSex, LaneBadge, PinModal } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { ageOf, fmtDay, todayKey, uuid } from '../lib/helpers'
import { ALLERGY_CLASS, COMPLAINTS, DRUGS, FREQUENCIES, LAB_TESTS } from '../data/reference'
import { useClinic, type ConsultInput } from '../store/store'
import type { ServiceType } from '../types'
import { VisitHistory } from '../components/History'
import { ScanUploader } from '../components/ClinicForms'

type RxRow = { drug_name: string; dose: string; frequency: string; quantity: number; ack?: boolean }
type CertType = 'Medical certificate' | 'Dental report'
type Cert = { on: boolean; type?: CertType; purpose: string; findings: string; rest_days: number; remarks: string }
type Vitals = { bp: string; temperature: string; pulse: string; respiration: string; height: string; weight: string }

/**
 * What the doctor has typed but not saved, kept in this tab (sessionStorage) per doctor, patient and visit.
 * An idle sign-out, a reload or a stray click away no longer loses a half-written note; it is removed
 * once the consultation is saved. It never leaves this tab and is gone when the tab closes.
 */
type ConsultDraft = { at: number; service: ServiceType; complaint: string; notes: string; vitals: Vitals; dx: { description: string; icd10_code: string }[]; labs: string[]; rx: RxRow[]; cert: Cert }
const draftKey = (staffId: string, patientId: string, visit: string) => `himsog-consult-draft:${staffId}:${patientId}:${visit}`
function readDraft(key: string): ConsultDraft | null {
  try {
    const v = sessionStorage.getItem(key)
    return v ? (JSON.parse(v) as ConsultDraft) : null
  } catch {
    return null
  }
}
function writeDraft(key: string, d: ConsultDraft | null) {
  try {
    if (d) sessionStorage.setItem(key, JSON.stringify(d))
    else sessionStorage.removeItem(key)
  } catch {
    /* storage full or blocked: the form still works, it just is not kept */
  }
}

export default function Consult() {
  const { patientId = '' } = useParams()
  const [params] = useSearchParams()
  const ticketId = params.get('ticket') ?? undefined
  const correctId = params.get('correct') ?? undefined
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const { data, me, patient, personOfPatient, employeeOfPerson, principalOf, saveConsultation, signDocuments, online } = useClinic()
  const pt = patient(patientId)
  const p = personOfPatient(patientId)
  const ticket = data.tickets.find((x) => x.ticket_id === ticketId)
  const original = data.consultations.find((c) => c.consultation_id === correctId)
  const allergies = data.allergies.filter((a) => a.patient_id === patientId)
  const key = draftKey(me?.staff_id ?? '', patientId, ticketId ?? (correctId ? `correct-${correctId}` : 'walk-in'))
  const [restored, setRestored] = useState<ConsultDraft | null>(() => readDraft(key))
  const d0 = restored

  const [service, setService] = useState<ServiceType>(d0?.service ?? ticket?.service_type ?? original?.service_type ?? (me?.services?.[0] ?? 'Medical'))
  const [complaint, setComplaint] = useState(d0?.complaint ?? original?.chief_complaint ?? ticket?.reason ?? '')
  const [notes, setNotes] = useState(d0?.notes ?? original?.treatment_notes ?? '')
  // A correction starts from the original's vitals, like its complaint and notes.
  // A new visit starts from the vital signs the front desk took at check-in.
  // Opened without a queue link (from the record): use the patient's open ticket from today, if there is one.
  const openTicket = ticket ?? data.tickets.find((x) => x.patient_id === patientId && x.day === todayKey() && ['waiting', 'called', 'in_consult'].includes(x.status))
  const base = original?.vitals ?? openTicket?.vitals
  const startVitals: Vitals = { bp: base?.bp ?? '', temperature: base?.temperature ?? '', pulse: base?.pulse ?? '', respiration: base?.respiration ?? '', height: base?.height ?? '', weight: base?.weight ?? '' }
  const [vitals, setVitals] = useState<Vitals>(d0?.vitals ?? startVitals)
  const [dx, setDx] = useState<{ description: string; icd10_code: string }[]>(d0?.dx ?? (original ? data.diagnoses.filter((d) => d.consultation_id === original.consultation_id).map(({ description, icd10_code }) => ({ description, icd10_code })) : []))
  const [dxQuery, setDxQuery] = useState('')
  const [labQuery, setLabQuery] = useState('')
  const [labs, setLabs] = useState<string[]>(d0?.labs ?? [])
  const [rx, setRx] = useState<RxRow[]>(d0?.rx ?? [])
  const [cert, setCert] = useState<Cert>(d0?.cert ?? { on: false, purpose: 'Excuse from work', findings: '', rest_days: 1, remarks: '' })
  const [errors, setErrors] = useState<string[]>([])
  const [recap, setRecap] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [saved, setSaved] = useState<{ input: ConsultInput; result: 'saved' | 'local'; signed: boolean } | null>(null)

  // Keep what has been typed so far; forget it once the consultation is saved.
  // A dental visit issues a dental report by default; the doctor can switch to a medical certificate.
  const certType: CertType = cert.type ?? (service === 'Dental' ? 'Dental report' : 'Medical certificate')
  const dentalReport = certType === 'Dental report'
  const typed = notes.trim().length > 0 || rx.some((r) => r.drug_name.trim()) || dx.length > 0 || labs.length > 0 || cert.findings.trim().length > 0
  useEffect(() => {
    if (saved) return writeDraft(key, null)
    if (typed) writeDraft(key, { at: Date.now(), service, complaint, notes, vitals, dx, labs, rx, cert })
  }, [key, saved, typed, service, complaint, notes, vitals, dx, labs, rx, cert])
  // Closing or reloading the tab with an unsaved note asks first.
  useEffect(() => {
    if (saved || !typed) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saved, typed])

  const conflicts = (drug: string) => {
    const d = drug.toLowerCase()
    return allergies.filter((a) => {
      const s = a.substance.toLowerCase()
      if (d && (s.includes(d) || d.includes(s.split(' ')[0]))) return true
      return Object.entries(ALLERGY_CLASS).some(([cls, drugs]) => s.includes(cls) && drugs.some((x) => x.toLowerCase() === d))
    })
  }

  if (!pt || !p || !me) {
    return (
      <Card className="p-8 text-center">
        <p className="text-xl font-semibold">{t('Patient not found')}</p>
        <Button to="/clinic/doctor" className="mt-4">
          {t('My queue')}
        </Button>
      </Card>
    )
  }
  const emp = employeeOfPerson(p.person_id)
  const principal = principalOf(patientId)

  const build = (): ConsultInput | null => {
    const e: string[] = []
    if (complaint.trim().length < 3) e.push('Chief complaint is required.')
    if (notes.trim().length < 10) e.push('Treatment notes are required (at least a sentence).')
    if (!dx.length) e.push('Add at least one diagnosis.')
    const filled = rx.filter((r) => r.drug_name.trim())
    if (filled.some((r) => !r.dose.trim() || !r.frequency.trim() || !r.quantity)) e.push('Each prescription item needs a dose, how often, and a quantity.')
    if (filled.some((r) => conflicts(r.drug_name).length && !r.ack)) e.push('Resolve the allergy warning on the prescription.')
    if (cert.on && (!cert.purpose.trim() || !cert.findings.trim())) e.push(`The ${certType.toLowerCase()} needs a ${dentalReport ? 'procedure' : 'purpose'} and findings.`)
    setErrors(e)
    if (e.length) return null
    return {
      consultation_id: uuid(),
      patient_id: patientId,
      ticket_id: ticketId,
      service_type: service,
      chief_complaint: complaint.trim(),
      treatment_notes: notes.trim(),
      vitals: service === 'Dental' || !Object.values(vitals).some(Boolean) ? undefined : vitals,
      diagnoses: dx,
      rx: filled.map(({ drug_name, dose, frequency, quantity }) => ({ drug_name, dose, frequency, quantity })),
      certificate: cert.on ? { doc_type: certType, purpose: cert.purpose, findings: cert.findings, rest_days: dentalReport ? undefined : cert.rest_days, remarks: cert.remarks || undefined } : undefined,
      labs,
      correction_of: correctId,
      rx_id: uuid(),
      doc_id: uuid(),
      lab_ids: labs.map(() => uuid()),
    }
  }

  const save = async (thenSign: boolean) => {
    const input = build()
    if (!input) return window.scrollTo({ top: 0, behavior: 'smooth' })
    let result: 'saved' | 'local'
    try {
      result = await saveConsultation(input)
    } catch {
      return // the store already told the doctor why it was not saved
    }
    setSaved({ input, result, signed: false })
    const hasDocs = input.rx.length > 0 || !!input.certificate
    if (result === 'local') toast({ tone: 'warn', title: 'Saved on this computer', body: 'It syncs when the clinic server is reachable. Documents stay drafts marked "not yet signed".' })
    else if (thenSign && hasDocs) setPinOpen(true)
    else toast({ tone: 'ok', title: 'Consultation saved', body: 'Added to the patient history.' })
  }

  const signRefs = saved ? [...(saved.input.rx.length ? [{ kind: 'rx' as const, id: saved.input.rx_id }] : []), ...(saved.input.certificate ? [{ kind: 'doc' as const, id: saved.input.doc_id }] : [])] : []

  if (saved) {
    const rxRow = data.prescriptions.find((r) => r.prescription_id === saved.input.rx_id)
    const mcRow = data.documents.find((d) => d.document_id === saved.input.doc_id)
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-8">
          <div className="flex items-center gap-4">
            <span className={cn('grid size-16 place-items-center rounded-full', saved.result === 'local' ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>{saved.result === 'local' ? <CloudArrowUp size={34} /> : <CheckCircle size={36} weight="fill" />}</span>
            <div>
              <p className="text-2xl font-semibold">{saved.result === 'local' ? 'Saved on this computer' : 'Consultation saved'}</p>
              <p className="text-base text-ink-2">
                {p.full_name} · {saved.result === 'local' ? 'waiting to sync with the clinic server' : 'added to the patient history'}
              </p>
            </div>
          </div>
          <ul className="mt-6 flex flex-col gap-3">
            {rxRow && (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas p-4">
                <span className="text-lg font-medium">
                  {t('Prescription')} · {rxRow.items.length} item{rxRow.items.length > 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-2">
                  {rxRow.document_no ? <span className="font-mono text-base font-semibold text-danger">{rxRow.document_no}</span> : <Badge tone="warn">{t('Not yet signed')}</Badge>}
                  <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.open(`/print/rx/${rxRow.prescription_id}`, '_blank')}>
                    {t('Print')}
                  </Button>
                </span>
              </li>
            )}
            {mcRow && (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas p-4">
                <span className="text-lg font-medium">{t(mcRow.doc_type)}</span>
                <span className="flex items-center gap-2">
                  {mcRow.document_no ? <span className="font-mono text-base font-semibold text-danger">{mcRow.document_no}</span> : <Badge tone="warn">{t('Not yet signed')}</Badge>}
                  <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.open(`/print/mc/${mcRow.document_id}`, '_blank')}>
                    {t('Print')}
                  </Button>
                </span>
              </li>
            )}
            {(rxRow?.status === 'signed' || mcRow?.status === 'signed') && (
              <li className="flex items-center gap-2 rounded-2xl bg-ok-soft p-4 text-base font-medium text-ok">
                <CheckCircle size={20} weight="fill" /> Sent to the front desk to be stamped and given to the patient.
              </li>
            )}
            {saved.result === 'local' && (rxRow || mcRow || saved.input.rx.length > 0 || saved.input.certificate) && <li className="rounded-2xl bg-danger-soft p-4 text-base text-danger">A computer that cannot reach the server cannot issue a valid signed document. Sign from Documents once it reconnects.</li>}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            {saved.result === 'saved' && signRefs.some((r) => (r.kind === 'rx' ? rxRow?.status === 'draft' : mcRow?.status === 'draft')) && (
              <Button size="lg" icon={<Signature size={20} />} onClick={() => setPinOpen(true)}>
                {t('Sign')}
              </Button>
            )}
            <Button size="lg" variant="secondary" icon={<Printer size={20} />} onClick={() => window.open(`/print/summary/${patientId}`, '_blank')}>
              {t('Print patient summary')}
            </Button>
            <Button size="lg" variant="soft" onClick={() => navigate('/clinic/doctor')}>
              {t('Next patient')}
            </Button>
          </div>
        </Card>
        <PinModal open={pinOpen} onClose={() => setPinOpen(false)} title={`${t('Sign')}: ${signRefs.length} document${signRefs.length > 1 ? 's' : ''}`} onSubmit={(pin) => signDocuments(signRefs, pin)}>
          <p className="text-center text-base text-ink-2">Your stored signature, license and PTR numbers and a document number are applied. Signed documents cannot be edited.</p>
        </PinModal>
      </div>
    )
  }

  // Diagnoses are typed by the doctor. Ones used before at this clinic are offered as suggestions.
  const pastDiagnoses = [...new Set(data.diagnoses.map((d) => d.description.trim()).filter(Boolean))].sort().slice(0, 200)
  const labSuggestions = [...new Set([...LAB_TESTS, ...data.labs.map((l) => l.test_name.trim())].filter(Boolean))].sort()
  const addLab = () => {
    const test = labQuery.trim()
    if (test && !labs.some((x) => x.toLowerCase() === test.toLowerCase())) setLabs([...labs, test])
    setLabQuery('')
  }
  const addDiagnosis = () => {
    const description = dxQuery.trim()
    if (description && !dx.some((x) => x.description.toLowerCase() === description.toLowerCase())) setDx([...dx, { description, icd10_code: '' }])
    setDxQuery('')
  }

  return (
    <div>
      <Link to="/clinic/doctor" className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={18} /> {t('My queue')}
      </Link>
      {/* Patient header */}
      <Card className="mb-5 flex flex-col gap-3 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[1.75rem] font-semibold leading-tight">{p.full_name}</p>
            {ticket && <LaneBadge category={ticket.category_id} />}
          </div>
          <p className="text-base text-ink-2">
            <AgeSex birthdate={p.birthdate} sex={p.sex} /> · {pt.patient_no} · {emp ? `${emp.employee_no}, ${emp.office}` : principal ? `${principal.type} of ${personOfPatient(principal.principal.patient_id)?.full_name}` : ''}
            {pt.philhealth_pin && ` · PhilHealth ${pt.philhealth_pin}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allergies.length ? (
            allergies.map((a) => (
              <span key={a.allergy_id} className="inline-flex items-center gap-1.5 rounded-full bg-danger px-4 py-2 text-base font-semibold text-white">
                <Warning size={18} weight="fill" /> {a.substance}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-ok-soft px-4 py-2 text-base font-semibold text-ok">{t('No known allergies')}</span>
          )}
        </div>
      </Card>

      {original && (
        <p className="mb-5 rounded-2xl bg-brand-50 px-5 py-4 text-base text-brand-900">
          Adding a correction to the visit on <b>{fmtDay(original.consult_date)}</b>. The original entry is kept unchanged; this saves as a new entry linked to it.
        </p>
      )}
      {restored && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-5 py-4 text-base text-brand-800">
          <span>
            {t('Restored the note you were writing at')} {new Date(restored.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. {t('It is not saved to the record yet.')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeDraft(key, null)
              setRestored(null)
              setService(ticket?.service_type ?? original?.service_type ?? (me.services?.[0] ?? 'Medical'))
              setComplaint(original?.chief_complaint ?? ticket?.reason ?? '')
              setNotes(original?.treatment_notes ?? '')
              setVitals(startVitals)
              setDx(original ? data.diagnoses.filter((d) => d.consultation_id === original.consultation_id).map(({ description, icd10_code }) => ({ description, icd10_code })) : [])
              setLabs([])
              setRx([])
              setCert({ on: false, purpose: 'Excuse from work', findings: '', rest_days: 1, remarks: '' })
            }}
          >
            {t('Start over')}
          </Button>
        </div>
      )}
      {!online && <p className="mb-5 rounded-2xl bg-danger-soft px-5 py-4 text-base text-danger">Offline: the consultation will be saved on this computer and synced later. Documents stay drafts until signed on a connected computer.</p>}
      {errors.length > 0 && (
        <div className="mb-5 rounded-2xl border border-[#f8cfd1] bg-danger-soft p-5" role="alert">
          {errors.map((e) => (
            <p key={e} className="flex items-center gap-2 text-base font-medium text-danger">
              <Warning size={18} weight="fill" /> {e}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* History */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:pb-4 scroll-thin">
          <div className="flex items-center justify-between">
            <p className="text-xl font-semibold">{t('Consultations')}</p>
            <Button size="sm" variant="soft" icon={<Robot size={16} />} onClick={() => setRecap((r) => !r)}>
              {t('Recap')}
            </Button>
          </div>
          <AnimatePresence>{recap && <Recap patientId={patientId} onDraft={(text) => setCert({ ...cert, on: true, findings: text })} onClose={() => setRecap(false)} />}</AnimatePresence>
          <FamilyLine patientId={patientId} />
          <VisitHistory patientId={patientId} compact />
          <OutsideRecords patientId={patientId} />
        </div>

        {/* Consultation form on one screen */}
        <Card className="p-6">
          <div className="grid grid-cols-1 gap-5">
            <div className="grid grid-cols-3 gap-2">
              {(['Medical', 'Dental', 'Laboratory'] as ServiceType[]).map((s) => (
                <button key={s} onClick={() => setService(s)} className={cn('h-12 rounded-2xl border-2 text-base font-semibold transition', service === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-300')}>
                  {t(s)}
                </button>
              ))}
            </div>
            <Field label={`${t('Chief complaint')} *`}>
              <Input value={complaint} onChange={(e) => setComplaint(e.target.value)} list="complaints" className="h-14 text-lg" />
              <datalist id="complaints">
                {COMPLAINTS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            {service !== 'Dental' && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">{t('Vital signs')}</p>
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['bp', 'Blood pressure (mmHg)', '120/80'],
                      ['temperature', 'Body temp (°C)', '36.8'],
                      ['pulse', 'Pulse rate (bpm)', '78'],
                      ['respiration', 'Respiration rate (/min)', '16'],
                      ['height', 'Height (cm)', '165'],
                      ['weight', 'Weight (kg)', '62'],
                    ] as const
                  ).map(([k, l]) => (
                    <Field key={k} label={l}>
                      <Input value={vitals[k]} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })} className="h-12 text-base" inputMode="decimal" />
                    </Field>
                  ))}
                </div>
              </div>
            )}
            <Field label={`${t('Treatment notes')} *`}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-28 text-base" />
            </Field>

            <Field label={`${t('Diagnosis')} *`}>
              <div className="flex flex-wrap gap-2">
                {dx.map((d) => (
                  <span key={d.description} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 py-1.5 pl-4 pr-2 text-base font-medium text-white">
                    {d.icd10_code ? `${d.icd10_code} ` : ''}
                    {d.description}
                    <button aria-label={`Remove ${d.description}`} onClick={() => setDx(dx.filter((x) => x !== d))} className="-my-1.5 -mr-1.5 grid size-10 place-items-center rounded-full hover:bg-white/20">
                      <X size={14} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
              {/* Typed by the doctor in their own words. Past diagnoses from this clinic are only offered as suggestions. */}
              <div className="flex gap-2">
                <Input
                  value={dxQuery}
                  onChange={(e) => setDxQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addDiagnosis()
                    }
                  }}
                  list="diagnoses"
                  placeholder={t('Type the diagnosis')}
                  className="h-12 text-base"
                />
                <datalist id="diagnoses">
                  {pastDiagnoses.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <Button type="button" variant="soft" className="h-12 shrink-0" icon={<Plus size={16} weight="bold" />} disabled={!dxQuery.trim()} onClick={addDiagnosis}>
                  {t('Add')}
                </Button>
              </div>
            </Field>

            {/* Prescription */}
            <div className="rounded-3xl border border-line p-5">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">{t('Prescription')}</p>
                <Button size="sm" variant="soft" icon={<Plus size={14} weight="bold" />} onClick={() => setRx([...rx, { drug_name: '', dose: '', frequency: '', quantity: 0 }])}>
                  Add drug
                </Button>
              </div>
              {rx.length === 0 && <p className="mt-2 text-base text-muted">{t('No medicines. Add a drug.')}</p>}
              <datalist id="drugs">
                {DRUGS.map((d) => (
                  <option key={d.name} value={d.name} />
                ))}
              </datalist>
              <datalist id="freqs">
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <ul className="mt-3 flex flex-col gap-3">
                {rx.map((r, i) => {
                  const hits = conflicts(r.drug_name)
                  const doses = DRUGS.find((d) => d.name === r.drug_name)?.doses ?? []
                  const set = (patch: Partial<RxRow>) => setRx(rx.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return (
                    <li key={i} className={cn('rounded-2xl p-3', hits.length ? 'bg-danger-soft' : 'bg-canvas')}>
                      <div className="grid grid-cols-[1fr_1fr_5.5rem_auto] gap-2">
                        <Input value={r.drug_name} onChange={(e) => set({ drug_name: e.target.value, ack: false })} list="drugs" placeholder="Drug" aria-label="Drug" className="col-span-4 h-12 text-base font-semibold" />
                        <Input value={r.dose} onChange={(e) => set({ dose: e.target.value })} list={`dose-${i}`} placeholder="Dose" aria-label="Dose" className="h-12 text-base" />
                        <datalist id={`dose-${i}`}>
                          {doses.map((d) => (
                            <option key={d} value={d} />
                          ))}
                        </datalist>
                        <Input value={r.frequency} onChange={(e) => set({ frequency: e.target.value })} list="freqs" placeholder="How often" aria-label="How often" className="h-12 text-base" />
                        <Input type="number" min={1} value={r.quantity || ''} onChange={(e) => set({ quantity: Number(e.target.value) })} placeholder="Qty" aria-label="Quantity" className="h-12 text-base" />
                        <button onClick={() => setRx(rx.filter((_, j) => j !== i))} aria-label="Remove drug" className="grid size-12 place-items-center rounded-xl text-ink-2 hover:bg-danger-soft hover:text-danger">
                          <Trash size={20} />
                        </button>
                      </div>
                      {hits.length > 0 && (
                        <label className="mt-2 flex items-start gap-2 text-base text-danger">
                          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
                          <span className="flex-1">
                            <b>Allergy warning:</b> patient is allergic to {hits.map((h) => `${h.substance} (${h.reaction.toLowerCase()})`).join(', ')}.
                            <span className="mt-1 flex items-center gap-2 font-medium text-ink">
                              <input type="checkbox" checked={!!r.ack} onChange={(e) => set({ ack: e.target.checked })} className="size-5 accent-danger" /> Prescribe anyway, I have reviewed this
                            </span>
                          </span>
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Labs */}
            <div className="rounded-3xl border border-line p-5">
              <p className="text-lg font-semibold">{t('Lab requests')}</p>
              {labs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {labs.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 py-1.5 pl-4 pr-2 text-base font-medium text-white">
                      {l}
                      <button type="button" aria-label={`Remove ${l}`} onClick={() => setLabs(labs.filter((x) => x !== l))} className="-my-1.5 -mr-1.5 grid size-10 place-items-center rounded-full hover:bg-white/20">
                        <X size={14} weight="bold" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Typed by the doctor. Common tests and ones requested before are only suggestions. */}
              <div className="mt-3 flex gap-2">
                <Input
                  value={labQuery}
                  onChange={(e) => setLabQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLab()
                    }
                  }}
                  list="lab-tests"
                  aria-label={t('Lab test')}
                  placeholder={t('Type the lab test')}
                  className="h-12 text-base"
                />
                <datalist id="lab-tests">
                  {labSuggestions.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                <Button type="button" variant="soft" className="h-12 shrink-0" icon={<Plus size={16} weight="bold" />} disabled={!labQuery.trim()} onClick={addLab}>
                  {t('Add')}
                </Button>
              </div>
            </div>

            {/* Certificate */}
            <div className="rounded-3xl border border-line p-5">
              <label className="flex items-center gap-3 text-lg font-semibold">
                <input type="checkbox" checked={cert.on} onChange={(e) => setCert({ ...cert, on: e.target.checked, findings: cert.findings || dx[0]?.description || '' })} className="size-6 accent-brand-600" />
                <FileText size={22} className="text-brand-600" /> Issue a {dentalReport ? 'dental report' : t('Medical certificate').toLowerCase()}
              </label>
              {cert.on && (
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Document type">
                  {(['Medical certificate', 'Dental report'] as CertType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={certType === k}
                      onClick={() => setCert({ ...cert, type: k, purpose: cert.purpose === 'Excuse from work' || cert.purpose === 'Dental procedure' || !cert.purpose ? (k === 'Dental report' ? 'Dental procedure' : 'Excuse from work') : cert.purpose })}
                      className={cn('h-11 rounded-full border-2 px-5 text-base font-semibold transition', certType === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-300')}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}
              {cert.on && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={dentalReport ? 'Procedure' : 'Purpose'}>
                    <Input value={cert.purpose} onChange={(e) => setCert({ ...cert, purpose: e.target.value })} list="purposes" className="h-12 text-base" />
                    <datalist id="purposes">
                      {['Excuse from work', 'Fit to work', 'Annual physical examination requirement', 'Dental procedure', 'Sick leave application'].map((x) => (
                        <option key={x} value={x} />
                      ))}
                    </datalist>
                  </Field>
                  {!dentalReport && (
                    <Field label="Rest days">
                      <Input type="number" min={0} value={cert.rest_days} onChange={(e) => setCert({ ...cert, rest_days: Number(e.target.value) })} className="h-12 text-base" />
                    </Field>
                  )}
                  <Field label={dentalReport ? 'Findings (teeth and condition)' : 'Findings'} className="sm:col-span-2">
                    <Textarea value={cert.findings} onChange={(e) => setCert({ ...cert, findings: e.target.value })} className="min-h-20 text-base" />
                  </Field>
                  <Field label={dentalReport ? 'Recommendations' : 'Remarks'} optional className="sm:col-span-2">
                    <Input value={cert.remarks} onChange={(e) => setCert({ ...cert, remarks: e.target.value })} className="h-12 text-base" />
                  </Field>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-4 mt-6 flex flex-col gap-2 rounded-3xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur sm:flex-row sm:justify-end">
            <Button size="lg" variant="secondary" className="h-14" onClick={() => save(false)}>
              {t('Save consultation')}
            </Button>
            <Button size="lg" className="h-14 px-8 text-lg" icon={<Signature size={22} />} onClick={() => save(true)}>
              {online ? t('Save and sign') : t('Save consultation')}
            </Button>
          </div>
        </Card>
      </div>
      <p className="mt-3 text-center text-sm text-faint">Consultations are only added, never overwritten. Patient {ageOf(p.birthdate)} years old as of today.</p>
    </div>
  )
}

/** Lab results, prescriptions or certificates the patient brings from another doctor or clinic: scanned and filed here. */
function OutsideRecords({ patientId }: { patientId: string }) {
  const t = useT()
  const { data } = useClinic()
  const pages = data.scans.filter((s) => s.patient_id === patientId).sort((a, b) => b.uploaded_at - a.uploaded_at)
  const outside = pages.filter((s) => s.category === 'Outside report')
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <p className="text-lg font-semibold">{t('Records from other clinics')}</p>
      <p className="mb-3 text-base text-ink-2">{t('Scan lab results, prescriptions or certificates the patient brought, and they are filed to this record.')}</p>
      <ScanUploader patientId={patientId} compact defaultCategory="Outside report" />
      {outside.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {outside.slice(0, 4).map((s) => (
            <li key={s.page_id} className="rounded-xl bg-canvas px-4 py-2 text-[15px]">
              <b>{t(s.kind)}</b> · {s.source_clinic ?? t('Other clinic')} <span className="text-muted">· {fmtDay(s.page_date)}</span>
            </li>
          ))}
        </ul>
      )}
      {pages.length > 0 && (
        <Link to={`/clinic/patients/${patientId}`} className="mt-3 inline-block text-base font-semibold text-brand-700 underline underline-offset-4">
          {t('Open all attached pages')} ({pages.length})
        </Link>
      )}
    </div>
  )
}

function FamilyLine({ patientId }: { patientId: string }) {
  const t = useT()
  const { data } = useClinic()
  const fh = data.familyHistory.filter((h) => h.patient_id === patientId)
  if (!fh.length) return null
  return (
    <p className="rounded-2xl bg-surface px-4 py-3 text-base text-ink-2 ring-1 ring-line">
      <b className="text-ink">{t('Family history')}:</b> {fh.map((h) => `${h.relative.toLowerCase()}, ${h.condition.toLowerCase()}`).join('; ')}
    </p>
  )
}

/**
 * History recap (build-if-time feature). In the real system a small local model on the clinic server
 * summarises one patient's records, read-only. In this prototype the draft is built from the record by
 * rules, standing in for the model; every line links to its source and is labeled AI-generated.
 */
function Recap({ patientId, onDraft, onClose }: { patientId: string; onDraft: (text: string) => void; onClose: () => void }) {
  const { data, personOfPatient, employeeOfPerson, staffById } = useClinic()
  const p = personOfPatient(patientId)!
  const lines = useMemo(() => {
    const out: { text: string; source?: string; label: string }[] = []
    const consults = data.consultations.filter((c) => c.patient_id === patientId).sort((a, b) => b.created_at - a.created_at)
    const emp = employeeOfPerson(p.person_id)
    out.push({ text: `${ageOf(p.birthdate)}-year-old ${p.sex.toLowerCase()}, ${emp ? `employee at the ${emp.office}` : 'dependent of an IPG employee'}.`, label: 'record' })
    const allergies = data.allergies.filter((a) => a.patient_id === patientId)
    out.push({ text: allergies.length ? `Allergies: ${allergies.map((a) => `${a.substance} (${a.reaction.toLowerCase()}, ${a.severity.toLowerCase()})`).join('; ')}.` : 'No known allergies recorded.', label: 'allergies' })
    const dxCount = new Map<string, { n: number; first: string; id: string }>()
    for (const c of consults) for (const d of data.diagnoses.filter((x) => x.consultation_id === c.consultation_id)) {
      const cur = dxCount.get(d.description)
      dxCount.set(d.description, { n: (cur?.n ?? 0) + 1, first: c.consult_date, id: c.consultation_id })
    }
    const repeated = [...dxCount.entries()].filter(([, v]) => v.n > 1)
    if (repeated.length) out.push({ text: `Recurring diagnoses: ${repeated.map(([k, v]) => `${k} (${v.n} visits since ${fmtDay(v.first)})`).join('; ')}.`, source: repeated[0][1].id, label: 'visits' })
    const last = consults[0]
    if (last) {
      const rx = data.prescriptions.find((r) => r.consultation_id === last.consultation_id)
      out.push({ text: `Last visit ${fmtDay(last.consult_date)} with ${staffById(last.doctor_id)?.name}: ${last.chief_complaint.toLowerCase()}${rx ? `; given ${rx.items.map((i) => i.drug_name).join(', ')}` : ''}.`, source: last.consultation_id, label: 'last visit' })
    }
    const labs = data.labs.filter((l) => l.patient_id === patientId && l.status === 'resulted').slice(-2)
    for (const l of labs) out.push({ text: `${l.test_name}: ${l.result}`, source: l.consultation_id, label: 'lab' })
    const fh = data.familyHistory.filter((h) => h.patient_id === patientId)
    if (fh.length) out.push({ text: `Family history of ${fh.map((h) => h.condition.toLowerCase()).join(', ')}.`, label: 'family history' })
    const scans = data.scans.filter((s) => s.patient_id === patientId).length
    if (scans) out.push({ text: `${scans} scanned page${scans > 1 ? 's' : ''} from the old paper folder are attached; their text is not included in this recap.`, label: 'scans' })
    return out
  }, [data, patientId, p, employeeOfPerson, staffById])

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-base font-semibold text-brand-900">
          <Robot size={20} weight="fill" /> AI-generated draft · read-only · one patient
        </p>
        <button onClick={onClose} aria-label="Close recap" className="grid size-11 place-items-center rounded-full hover:bg-white">
          <X size={16} />
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {lines.map((l, i) => (
          <li key={i} className="text-base leading-relaxed text-ink">
            {l.text}{' '}
            {l.source ? (
              <a href={`#entry-${l.source}`} className="whitespace-nowrap text-sm font-semibold text-brand-700 underline underline-offset-2">
                source: {l.label}
              </a>
            ) : (
              <span className="whitespace-nowrap text-sm text-muted">source: {l.label}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{data.demo ? 'Demo note: this' : 'This'} preview is generated from the record by rules, standing in for the local model. It never suggests a diagnosis or treatment and cannot change the record. Review before use.</p>
      <Button size="sm" variant="soft" className="mt-3" onClick={() => onDraft(lines.slice(0, 4).map((l) => l.text).join(' '))}>
        Use as certificate findings draft
      </Button>
    </motion.div>
  )
}
