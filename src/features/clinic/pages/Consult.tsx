import { ArrowLeft, CheckCircle, CloudArrowUp, FileText, Plus, Printer, Robot, Signature, Trash, Warning, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Chip, Field, Input, Textarea, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { AgeSex, LaneBadge, PinModal } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { ageOf, fmtDay, uuid } from '../lib/helpers'
import { ALLERGY_CLASS, COMPLAINTS, DRUGS, FREQUENCIES, ICD10, LAB_TESTS, TEMPLATES } from '../data/reference'
import { useClinic, type ConsultInput } from '../store/store'
import type { ServiceType } from '../types'
import { VisitHistory } from '../components/History'

type RxRow = { drug_name: string; dose: string; frequency: string; quantity: number; ack?: boolean }

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

  const [service, setService] = useState<ServiceType>(ticket?.service_type ?? original?.service_type ?? (me?.services?.[0] ?? 'Medical'))
  const [complaint, setComplaint] = useState(original?.chief_complaint ?? ticket?.reason ?? '')
  const [notes, setNotes] = useState(original?.treatment_notes ?? '')
  const [vitals, setVitals] = useState({ bp: '', temperature: '', pulse: '', weight: '' })
  const [dx, setDx] = useState<{ description: string; icd10_code: string }[]>(original ? data.diagnoses.filter((d) => d.consultation_id === original.consultation_id).map(({ description, icd10_code }) => ({ description, icd10_code })) : [])
  const [dxQuery, setDxQuery] = useState('')
  const [labs, setLabs] = useState<string[]>([])
  const [rx, setRx] = useState<RxRow[]>([])
  const [cert, setCert] = useState<{ on: boolean; purpose: string; findings: string; rest_days: number; remarks: string }>({ on: false, purpose: 'Excuse from work', findings: '', rest_days: 1, remarks: '' })
  const [errors, setErrors] = useState<string[]>([])
  const [recap, setRecap] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [saved, setSaved] = useState<{ input: ConsultInput; result: 'saved' | 'local'; signed: boolean } | null>(null)

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

  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES.find((x) => x.key === key)!
    setService(tpl.service)
    setComplaint(tpl.complaint)
    setNotes(tpl.notes)
    setDx([tpl.diagnosis])
    setRx(tpl.rx.map((r) => ({ ...r })))
    setLabs(tpl.labs ?? [])
    setCert(tpl.certificate ? { on: tpl.certificate.rest_days > 0 || tpl.key === 'pe', purpose: tpl.certificate.purpose, findings: tpl.diagnosis.description, rest_days: tpl.certificate.rest_days, remarks: '' } : { ...cert, on: false })
  }

  const build = (): ConsultInput | null => {
    const e: string[] = []
    if (complaint.trim().length < 3) e.push('Chief complaint is required.')
    if (notes.trim().length < 10) e.push('Treatment notes are required (at least a sentence).')
    if (!dx.length) e.push('Add at least one diagnosis.')
    const filled = rx.filter((r) => r.drug_name.trim())
    if (filled.some((r) => !r.dose.trim() || !r.frequency.trim() || !r.quantity)) e.push('Each prescription item needs a dose, how often, and a quantity.')
    if (filled.some((r) => conflicts(r.drug_name).length && !r.ack)) e.push('Resolve the allergy warning on the prescription.')
    if (cert.on && (!cert.purpose.trim() || !cert.findings.trim())) e.push('The medical certificate needs a purpose and findings.')
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
      certificate: cert.on ? { purpose: cert.purpose, findings: cert.findings, rest_days: cert.rest_days, remarks: cert.remarks || undefined } : undefined,
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
                <span className="text-lg font-medium">{t('Medical certificate')}</span>
                <span className="flex items-center gap-2">
                  {mcRow.document_no ? <span className="font-mono text-base font-semibold text-danger">{mcRow.document_no}</span> : <Badge tone="warn">{t('Not yet signed')}</Badge>}
                  <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.open(`/print/mc/${mcRow.document_id}`, '_blank')}>
                    {t('Print')}
                  </Button>
                </span>
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

  const icdHits = dxQuery.trim() ? ICD10.filter((d) => `${d.icd10_code} ${d.description}`.toLowerCase().includes(dxQuery.toLowerCase())).slice(0, 6) : []

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
        </div>

        {/* Consultation form on one screen */}
        <Card className="p-6">
          <p className="text-base font-semibold text-ink-2">{t('Templates')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEMPLATES.filter((x) => (me.services ?? []).includes(x.service)).map((x) => (
              <Chip key={x.key} onClick={() => applyTemplate(x.key)} className="h-11 text-[15px]">
                {x.label}
              </Chip>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5">
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ['bp', 'BP (mmHg)', '120/80'],
                      ['temperature', 'Temp (°C)', '36.8'],
                      ['pulse', 'Pulse (bpm)', '78'],
                      ['weight', 'Weight (kg)', '62'],
                    ] as const
                  ).map(([k, l, ph]) => (
                    <Field key={k} label={l}>
                      <Input value={vitals[k]} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })} placeholder={ph} className="h-12 text-base" inputMode="decimal" />
                    </Field>
                  ))}
                </div>
              </div>
            )}
            <Field label={`${t('Treatment notes')} *`}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-28 text-base" />
            </Field>

            <Field label={`${t('Diagnosis')} (ICD-10) *`}>
              <div className="flex flex-wrap gap-2">
                {dx.map((d) => (
                  <span key={d.icd10_code + d.description} className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 py-1.5 pl-4 pr-2 text-base font-medium text-white">
                    {d.icd10_code} {d.description}
                    <button aria-label={`Remove ${d.description}`} onClick={() => setDx(dx.filter((x) => x !== d))} className="grid size-7 place-items-center rounded-full hover:bg-white/20">
                      <X size={14} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <Input value={dxQuery} onChange={(e) => setDxQuery(e.target.value)} placeholder="Search ICD-10, e.g. hypertension or I10" className="h-12 text-base" />
                {icdHits.length > 0 && (
                  <ul className="absolute inset-x-0 top-14 z-10 rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                    {icdHits.map((h) => (
                      <li key={h.icd10_code}>
                        <button
                          onClick={() => {
                            if (!dx.some((x) => x.icd10_code === h.icd10_code)) setDx([...dx, h])
                            setDxQuery('')
                          }}
                          className="w-full rounded-xl px-3 py-2.5 text-left text-base hover:bg-mist"
                        >
                          <b className="font-mono">{h.icd10_code}</b> {h.description}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
              {rx.length === 0 && <p className="mt-2 text-base text-muted">{t('No medicines. Add a drug or use a template.')}</p>}
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
              <div className="mt-3 flex flex-wrap gap-2">
                {LAB_TESTS.map((l) => (
                  <Chip key={l} selected={labs.includes(l)} onClick={() => setLabs(labs.includes(l) ? labs.filter((x) => x !== l) : [...labs, l])} className="h-11 text-[15px]">
                    {l}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Certificate */}
            <div className="rounded-3xl border border-line p-5">
              <label className="flex items-center gap-3 text-lg font-semibold">
                <input type="checkbox" checked={cert.on} onChange={(e) => setCert({ ...cert, on: e.target.checked, findings: cert.findings || dx[0]?.description || '' })} className="size-6 accent-brand-600" />
                <FileText size={22} className="text-brand-600" /> Issue a {t('Medical certificate').toLowerCase()}
              </label>
              {cert.on && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Purpose">
                    <Input value={cert.purpose} onChange={(e) => setCert({ ...cert, purpose: e.target.value })} list="purposes" className="h-12 text-base" />
                    <datalist id="purposes">
                      {['Excuse from work', 'Fit to work', 'Annual physical examination requirement', 'Dental procedure', 'Sick leave application'].map((x) => (
                        <option key={x} value={x} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Rest days">
                    <Input type="number" min={0} value={cert.rest_days} onChange={(e) => setCert({ ...cert, rest_days: Number(e.target.value) })} className="h-12 text-base" />
                  </Field>
                  <Field label="Findings" className="sm:col-span-2">
                    <Textarea value={cert.findings} onChange={(e) => setCert({ ...cert, findings: e.target.value })} className="min-h-20 text-base" />
                  </Field>
                  <Field label="Remarks" optional className="sm:col-span-2">
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
        <button onClick={onClose} aria-label="Close recap" className="grid size-9 place-items-center rounded-full hover:bg-white">
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
