import { ArrowLeft, Flag, LockKey, PencilSimple, Plus, Printer, Warning, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, Chip, Field, Input, KeyValue, Modal, Select, Tabs, Textarea, useDialogFocus, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { AgeSex, ScanImage } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { ageOf, fmtDay, fmtStampOf, matchScore } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { CivilStatus, Sex } from '../types'
import { VisitHistory } from '../components/History'
import { DependentForm, ScanUploader } from '../components/ClinicForms'

type Tab = 'overview' | 'visits' | 'family' | 'scans' | 'labs' | 'changes'

export default function PatientRecord() {
  const { id = '' } = useParams()
  const t = useT()
  const { data, me, patient, personOfPatient, employeeOfPerson, principalOf, staffById, touch, isReturning, unmergePatient } = useClinic()
  const toastMsg = useToast()
  const [undo, setUndo] = useState<{ patient_id: string; full_name: string } | null>(null)
  const [undoReason, setUndoReason] = useState('')
  const [undoError, setUndoError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [edit, setEdit] = useState(false)
  const navigate = useNavigate()
  const pt = patient(id)
  const p = personOfPatient(id)
  useEffect(() => {
    if (pt) touch(pt.patient_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (!pt || !p) {
    return (
      <Card className="p-8 text-center">
        <p className="text-xl font-semibold">{t('Record not found')}</p>
        <p className="mt-1 text-base text-ink-2">{t('It may not be cached on this computer while offline.')}</p>
        <Button to="/clinic/patients" className="mt-5">
          {t('Patient registry')}
        </Button>
      </Card>
    )
  }
  const doctor = me?.role === 'doctor'
  const emp = employeeOfPerson(p.person_id)
  const principal = principalOf(id)
  const allergies = data.allergies.filter((a) => a.patient_id === id)
  const dups = data.persons.filter((x) => x.person_id !== p.person_id && x.birthdate === p.birthdate && matchScore(p.full_name, x.full_name, []) >= 0.75)
  const changes = data.audit.filter((a) => a.record_id === id || a.record_id === p.person_id)
  const scans = data.scans.filter((s) => s.patient_id === id)
  const labs = data.labs.filter((l) => l.patient_id === id)
  const creator = staffById(pt.created_by)

  return (
    <div>
      <Modal
        open={!!undo}
        onClose={() => setUndo(null)}
        title={`Undo the merge of ${undo?.full_name ?? ''}?`}
        subtitle="The record comes back as its own patient with its own history. Nothing was moved, so nothing is lost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndo(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={undoReason.trim().length < 3}
              onClick={async () => {
                if (!undo) return
                const problem = await unmergePatient(undo.patient_id, undoReason)
                if (problem) return setUndoError(problem)
                toastMsg({ tone: 'ok', title: 'Merge undone' })
                setUndo(null)
              }}
            >
              Undo merge
            </Button>
          </>
        }
      >
        <Field label="Why is the merge being undone?" error={undoError}>
          <Input value={undoReason} onChange={(e) => setUndoReason(e.target.value)} className="h-12 text-base" invalid={!!undoError} />
        </Field>
      </Modal>
      <Link to="/clinic/patients" className="mb-4 inline-flex items-center gap-2 text-base font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={18} /> {t('Patient registry')}
      </Link>
      <Card className="mb-5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.025em]">{p.full_name}</h1>
              {emp ? <Badge tone="brand">{t('Employee')}</Badge> : <Badge>{t('Dependent')}</Badge>}
              {ageOf(p.birthdate) >= 60 && <Badge tone="brand">{t('Senior')}</Badge>}
              {pt.pwd_id && <Badge tone="brand">PWD</Badge>}
              {!isReturning(id) && <Badge tone="warn">{t('New record')}</Badge>}
            </div>
            <p className="mt-1 text-lg text-ink-2">
              <AgeSex birthdate={p.birthdate} sex={p.sex} /> · born {fmtDay(p.birthdate)} · {pt.patient_no}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {allergies.length ? (
                allergies.map((a) => (
                  <span key={a.allergy_id} className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-base font-semibold text-danger">
                    <Warning size={16} weight="fill" /> {a.substance} ({a.severity.toLowerCase()})
                  </span>
                ))
              ) : (
                <span className="text-base text-muted">{t('No known allergies')}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="lg" icon={<PencilSimple size={20} />} onClick={() => setEdit(true)}>
              {t('Edit details')}
            </Button>
            <Button variant="secondary" size="lg" icon={<Printer size={20} />} onClick={() => window.open(`/print/summary/${id}`, '_blank')}>
              {t('Print patient summary')}
            </Button>
          </div>
        </div>
        {pt.hr_flag && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-base text-danger">
            <Flag size={18} weight="fill" /> HR flag: {pt.hr_flag}
          </p>
        )}
        {data.mergedRecords.filter((m) => m.into === pt.patient_id).length > 0 && (
          <div className="mt-4 rounded-2xl bg-canvas px-4 py-3">
            <p className="text-[15px] font-semibold">{t('Includes records merged into this one')}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {data.mergedRecords
                .filter((m) => m.into === pt.patient_id)
                .map((m) => (
                  <li key={m.patient_id} className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-ink-2">
                    <span>
                      {m.full_name} · {m.patient_no}
                      {m.merged_at ? ` · merged ${fmtDay(new Date(m.merged_at).toISOString().slice(0, 10))}` : ''}
                      {m.merged_by ? ` by ${staffById(m.merged_by)?.name ?? m.merged_by}` : ''}
                    </span>
                    {doctor && (
                      <Button variant="ghost" onClick={() => { setUndoError(''); setUndoReason(''); setUndo({ patient_id: m.patient_id, full_name: m.full_name }) }}>
                        Undo merge
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {dups.length > 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-base text-warn">
            <Warning size={18} weight="fill" /> {t('Possible duplicate')}: {dups.map((d) => d.full_name).join(', ')} has the same birthdate and a similar name.
            <Link to={`/clinic/patients/duplicates?with=${id}`} className="ml-auto shrink-0 font-semibold underline">
              Review and merge
            </Link>
          </p>
        )}
      </Card>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: t('Overview') },
          { value: 'visits', label: t('Consultations'), count: data.consultations.filter((c) => c.patient_id === id).length },
          { value: 'family', label: t('Family') },
          { value: 'scans', label: t('Old paper records'), count: scans.length },
          ...(doctor ? [{ value: 'labs' as Tab, label: t('Lab results'), count: labs.length }] : []),
          { value: 'changes', label: 'History of changes' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card className="p-6">
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <KeyValue k={t('Age')} v={`${ageOf(p.birthdate)} (calculated from the birthdate)`} />
              <KeyValue k={t('Sex')} v={t(p.sex)} />
              <KeyValue k={t('Civil status')} v={t(pt.civil_status)} />
              <KeyValue k={t('Contact')} v={p.contact || '—'} />
              {emp ? (
                <>
                  <KeyValue k={t('Employee ID')} v={<span className="font-mono text-brand-800">{emp.employee_no}</span>} />
                  <KeyValue k={t('Office')} v={emp.office} />
                  <KeyValue k={t('Position')} v={emp.position} />
                </>
              ) : (
                <KeyValue k="Dependent of" v={principal ? `${personOfPatient(principal.principal.patient_id)?.full_name} (${principal.type.toLowerCase()})` : '—'} />
              )}
              <KeyValue k={t('PhilHealth PIN')} v={pt.philhealth_pin ?? '—'} />
              <KeyValue k={t('PWD ID')} v={pt.pwd_id ?? '—'} />
              <KeyValue
                k="Paper folder"
                v={pt.paper_status === 'on_file' ? `On file${pt.paper_checked_at ? ` · checked ${fmtStampOf(pt.paper_checked_at)}` : ''}` : pt.paper_status === 'none' ? 'No folder' : 'Not checked yet'}
              />
              <KeyValue k={t('Old folder no.')} v={pt.legacy_folder_no ?? '—'} />
              <KeyValue k="Record created" v={`${fmtStampOf(pt.created_at)} by ${pt.created_by === 'import' ? 'HR list import' : creator?.name ?? '—'}`} />
            </dl>
          </Card>
          <AllergyCard patientId={id} />
        </div>
      )}

      {tab === 'visits' &&
        (doctor ? (
          <VisitHistory patientId={id} onCorrect={(c) => navigate(`/clinic/consult/${id}?correct=${c.consultation_id}`)} />
        ) : (
          <Card className="p-6">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <LockKey size={22} weight="fill" className="text-brand-600" /> Consultation notes are for doctors
            </p>
            <p className="mt-1 text-base text-ink-2">The front desk sees visit dates and services only. Signing and editing notes are doctor actions.</p>
            <ul className="mt-4 flex flex-col gap-2">
              {data.consultations
                .filter((c) => c.patient_id === id)
                .sort((a, b) => b.created_at - a.created_at)
                .map((c) => (
                  <li key={c.consultation_id} className="flex justify-between rounded-2xl bg-canvas px-4 py-3 text-base">
                    <span>{fmtDay(c.consult_date)}</span>
                    <span className="text-ink-2">
                      {t(c.service_type)} · {staffById(c.doctor_id)?.name}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}

      {tab === 'family' && <FamilyTab patientId={id} isEmployee={!!emp} />}

      {tab === 'scans' && (
        <div className="flex flex-col gap-5">
          <ScanUploader patientId={id} />
          <ScanGrid patientId={id} />
        </div>
      )}

      {tab === 'labs' && doctor && <LabsTab patientId={id} />}

      {tab === 'changes' && (
        <Card className="p-6">
          <p className="text-base text-ink-2">Every entry shows who made it and when. Edits keep both versions here.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {changes.length === 0 && <li className="text-base text-muted">{t('No changes recorded.')}</li>}
            {changes.map((a) => (
              <li key={a.log_id} className="rounded-2xl bg-canvas px-4 py-3">
                <p className="text-base font-medium">{a.summary}</p>
                {a.detail && <p className="mt-1 font-mono text-sm text-ink-2">{a.detail}</p>}
                <p className="text-sm text-muted">
                  {staffById(a.staff_id)?.name ?? 'System'} · {fmtStampOf(a.logged_at)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EditModal open={edit} onClose={() => setEdit(false)} patientId={id} />
    </div>
  )
}

function AllergyCard({ patientId }: { patientId: string }) {
  const t = useT()
  const { data, addAllergy } = useClinic()
  const [f, setF] = useState({ substance: '', reaction: '', severity: 'Moderate' as 'Mild' | 'Moderate' | 'Severe' })
  const list = data.allergies.filter((a) => a.patient_id === patientId)
  return (
    <Card className="h-fit p-6">
      <p className="text-lg font-semibold">{t('Allergies')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {list.length === 0 && <li className="text-base text-muted">{t('No known allergies')}</li>}
        {list.map((a) => (
          <li key={a.allergy_id} className="rounded-2xl bg-danger-soft px-4 py-3 text-base">
            <b className="text-danger">{a.substance}</b> · {a.reaction} · {a.severity}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input value={f.substance} onChange={(e) => setF({ ...f, substance: e.target.value })} placeholder="Substance" aria-label="Substance" className="h-12 text-base" />
        <Input value={f.reaction} onChange={(e) => setF({ ...f, reaction: e.target.value })} placeholder="Reaction" aria-label="Reaction" className="h-12 text-base" />
        <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as typeof f.severity })} aria-label="Severity" className="h-12 text-base">
          <option>Mild</option>
          <option>Moderate</option>
          <option>Severe</option>
        </Select>
      </div>
      <Button
        variant="soft"
        className="mt-3"
        icon={<Plus size={16} weight="bold" />}
        disabled={f.substance.trim().length < 2}
        onClick={() => {
          addAllergy(patientId, f.substance.trim(), f.reaction.trim() || 'Not specified', f.severity)
          setF({ substance: '', reaction: '', severity: 'Moderate' })
        }}
      >
        Add allergy
      </Button>
    </Card>
  )
}

function FamilyTab({ patientId, isEmployee }: { patientId: string; isEmployee: boolean }) {
  const t = useT()
  const { data, personOfPatient, addFamilyHistory, principalOf } = useClinic()
  const [addDep, setAddDep] = useState(false)
  const [fh, setFh] = useState({ relative: 'Mother', condition: '', notes: '' })
  const deps = data.relationships.filter((r) => r.patient_id === patientId)
  const principal = principalOf(patientId)
  const history = data.familyHistory.filter((h) => h.patient_id === patientId)
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card className="p-6">
        <p className="text-lg font-semibold">{t('Relatives')}</p>
        <p className="text-[15px] text-muted">Linked patient to patient. MDR marks dependents declared on the PhilHealth Member Data Record.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {principal && (
            <li>
              <Link to={`/clinic/patients/${principal.principal.patient_id}`} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3 text-base hover:bg-brand-50">
                <span className="font-semibold">{personOfPatient(principal.principal.patient_id)?.full_name}</span>
                <span className="text-ink-2">Employee · this patient is their {principal.type.toLowerCase()}</span>
              </Link>
            </li>
          )}
          {deps.map((d) => {
            const per = personOfPatient(d.related_patient_id)
            return (
              <li key={d.relationship_id}>
                <Link to={`/clinic/patients/${d.related_patient_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3 text-base hover:bg-brand-50">
                  <span className="font-semibold">{per?.full_name}</span>
                  <span className="flex items-center gap-2 text-ink-2">
                    {d.relationship_type} · {per ? ageOf(per.birthdate) : ''} {t('yrs')}
                    {d.listed_in_mdr && <Badge tone="brand">MDR</Badge>}
                  </span>
                </Link>
              </li>
            )
          })}
          {!principal && deps.length === 0 && <li className="text-base text-muted">{t('No relatives linked.')}</li>}
        </ul>
        {isEmployee &&
          (addDep ? (
            <div className="mt-4 rounded-3xl border border-line p-5">
              <DependentForm principalPatientId={patientId} onDone={() => setAddDep(false)} onCancel={() => setAddDep(false)} />
            </div>
          ) : (
            <Button variant="secondary" className="mt-4" icon={<Plus size={16} weight="bold" />} onClick={() => setAddDep(true)}>
              {t('Add dependent')}
            </Button>
          ))}
      </Card>
      <Card className="p-6">
        <p className="text-lg font-semibold">{t('Family history')}</p>
        <p className="text-[15px] text-muted">Conditions in relatives, who may not be patients themselves.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {history.length === 0 && <li className="text-base text-muted">{t('None recorded.')}</li>}
          {history.map((h) => (
            <li key={h.history_id} className="rounded-2xl bg-canvas px-4 py-3 text-base">
              <b>{h.relative}</b>: {h.condition}
              {h.notes && <span className="text-ink-2"> · {h.notes}</span>}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={fh.relative} onChange={(e) => setFh({ ...fh, relative: e.target.value })} aria-label="Relative" className="h-12 text-base">
            {['Mother', 'Father', 'Sibling', 'Grandparent', 'Child', 'Spouse'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Input value={fh.condition} onChange={(e) => setFh({ ...fh, condition: e.target.value })} placeholder="Condition, e.g. Hypertension" aria-label="Condition" className="h-12 text-base" list="fh-conditions" />
          <datalist id="fh-conditions">
            {['Hypertension', 'Type 2 diabetes', 'Asthma', 'Stroke', 'Heart disease', 'Cancer', 'Kidney disease', 'Tuberculosis'].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Input value={fh.notes} onChange={(e) => setFh({ ...fh, notes: e.target.value })} placeholder="Notes (optional)" aria-label="Notes" className="h-12 text-base sm:col-span-2" />
        </div>
        <Button
          variant="soft"
          className="mt-3"
          disabled={fh.condition.trim().length < 3}
          onClick={() => {
            addFamilyHistory(patientId, fh.relative, fh.condition.trim(), fh.notes.trim() || undefined)
            setFh({ relative: 'Mother', condition: '', notes: '' })
          }}
        >
          Add to family history
        </Button>
      </Card>
    </div>
  )
}

function ScanGrid({ patientId }: { patientId: string }) {
  const { data, staffById } = useClinic()
  const [open, setOpen] = useState<string | null>(null)
  const scans = data.scans.filter((s) => s.patient_id === patientId).sort((a, b) => b.page_date.localeCompare(a.page_date))
  const current = scans.find((s) => s.page_id === open)
  if (!scans.length) return <p className="rounded-3xl bg-surface p-6 text-base text-ink-2">No pages attached yet. Old folders are scanned when the patient visits, not retyped.</p>
  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {scans.map((s) => (
          <li key={s.page_id}>
            <button onClick={() => setOpen(s.page_id)} className="block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:border-brand-300 hover:shadow-soft">
              <ScanImage file={s.file} className="aspect-[3/4] w-full bg-[#f4efe2]" />
              <span className="block px-3 py-2 text-[15px]">
                <b>{s.kind}</b>
                {s.category === 'Outside report' && <span className="block text-sm font-medium text-brand-700">Outside report{s.source_clinic ? ` · ${s.source_clinic}` : ''}</span>}
                <span className="block text-sm text-muted">
                  {fmtDay(s.page_date)} · by {staffById(s.uploaded_by)?.name.split(' ')[0]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <ScanLightbox onClose={() => setOpen(null)}>
          <button className="absolute right-6 top-6 grid size-12 place-items-center rounded-full bg-white" aria-label="Close">
            <X size={22} />
          </button>
          <ScanImage file={current.file} className="max-h-[85dvh] w-auto max-w-full rounded-xl bg-[#f4efe2]" />
        </ScanLightbox>
      )}
    </>
  )
}

/** Full-screen scan viewer: Escape or a click closes it, Tab stays on the close button, focus returns to the thumbnail. */
function ScanLightbox({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-label="Scanned page" className="fixed inset-0 z-50 grid place-items-center bg-brand-950/70 p-6" onClick={onClose}>
      {children}
    </div>
  )
}

function LabsTab({ patientId }: { patientId: string }) {
  const { data, addLabResult, staffById } = useClinic()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const labs = data.labs.filter((l) => l.patient_id === patientId).sort((a, b) => b.requested_at - a.requested_at)
  return (
    <Card className="p-6">
      <ul className="flex flex-col gap-3">
        {labs.length === 0 && <li className="text-base text-muted">No lab requests.</li>}
        {labs.map((l) => (
          <li key={l.lab_id} className="rounded-2xl bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-semibold">{l.test_name}</p>
              <span className="text-sm text-muted">
                Requested {fmtStampOf(l.requested_at)} by {staffById(l.requested_by)?.name}
              </span>
            </div>
            {l.status === 'resulted' ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-base text-ink-2">
                  {l.result} <span className="text-sm text-muted">· {l.result_date && fmtDay(l.result_date)}</span>
                </p>
                <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.open(`/print/lab/${l.lab_id}`, '_blank')}>
                  Print result
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Input value={draft[l.lab_id] ?? ''} onChange={(e) => setDraft({ ...draft, [l.lab_id]: e.target.value })} placeholder="Enter the result" className="h-12 text-base" />
                <Button disabled={!(draft[l.lab_id] ?? '').trim()} onClick={() => addLabResult(l.lab_id, draft[l.lab_id].trim())}>
                  Save result
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function EditModal({ open, onClose, patientId }: { open: boolean; onClose: () => void; patientId: string }) {
  const t = useT()
  const { patient, personOfPatient, employeeOfPerson, completeRecord, setEmployeeInfo, online } = useClinic()
  const toast = useToast()
  const pt = patient(patientId)!
  const p = personOfPatient(patientId)!
  const emp = employeeOfPerson(p.person_id)
  const [f, setF] = useState({ full_name: p.full_name, birthdate: p.birthdate, sex: p.sex, contact: p.contact, civil_status: pt.civil_status, philhealth_pin: pt.philhealth_pin ?? '', pwd_id: pt.pwd_id ?? '', legacy_folder_no: pt.legacy_folder_no ?? '', employee_no: emp?.employee_no ?? '', office: emp?.office ?? '', position: emp?.position ?? '', reason: '' })
  const empNo = f.employee_no.trim().toUpperCase()
  const empChanged = !!empNo && (empNo !== (emp?.employee_no ?? '') || f.office.trim() !== (emp?.office ?? '') || f.position.trim() !== (emp?.position ?? ''))
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('Edit details')}
      subtitle="Edits are logged with the old and new values. The later edit wins."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!online || f.reason.trim().length < 3}
            onClick={async () => {
              completeRecord(patientId, { full_name: f.full_name, birthdate: f.birthdate, sex: f.sex, contact: f.contact, civil_status: f.civil_status, philhealth_pin: f.philhealth_pin || undefined, pwd_id: f.pwd_id || undefined, legacy_folder_no: f.legacy_folder_no || undefined }, f.reason.trim())
              if (empChanged) {
                const err = await setEmployeeInfo(patientId, { employee_no: empNo, office: f.office, position: f.position }, f.reason.trim())
                if (err) return toast({ tone: 'warn', title: 'Employee details not saved', body: err })
              }
              toast({ tone: 'ok', title: 'Details updated', body: 'Both versions are in the history of changes.' })
              onClose()
            }}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Full name')} className="sm:col-span-2">
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('Birthdate')} hint={`${t('Age')}: ${ageOf(f.birthdate)} (calculated)`}>
          <Input type="date" value={f.birthdate} onChange={(e) => setF({ ...f, birthdate: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('Sex')}>
          <div className="flex gap-2">
            {(['Female', 'Male'] as Sex[]).map((s) => (
              <Chip key={s} selected={f.sex === s} onClick={() => setF({ ...f, sex: s })} className="h-11 flex-1 justify-center">
                {t(s)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={t('Civil status')}>
          <Select value={f.civil_status} onChange={(e) => setF({ ...f, civil_status: e.target.value as CivilStatus })} className="h-12 text-base">
            {(['Single', 'Married', 'Widowed', 'Separated'] as CivilStatus[]).map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Contact')}>
          <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PhilHealth PIN')}>
          <Input value={f.philhealth_pin} onChange={(e) => setF({ ...f, philhealth_pin: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PWD ID')}>
          <Input value={f.pwd_id} onChange={(e) => setF({ ...f, pwd_id: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('Old folder no.')}>
          <Input value={f.legacy_folder_no} onChange={(e) => setF({ ...f, legacy_folder_no: e.target.value })} className="h-12 text-base" />
        </Field>
        <p className="text-base font-semibold text-ink-2 sm:col-span-2">{t('Employee details (optional)')}</p>
        <Field label={t('Employee ID')}>
          <Input value={f.employee_no} onChange={(e) => setF({ ...f, employee_no: e.target.value })} placeholder="IPG-0000-0000" className="h-12 font-mono text-base uppercase" />
        </Field>
        <Field label={t('Office')}>
          <Input value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('Position')} className="sm:col-span-2">
          <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label="Why are you changing this?" className={cn('sm:col-span-2')}>
          <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Checked the patient's PhilHealth ID" className="min-h-16 text-base" />
        </Field>
      </div>
    </Modal>
  )
}

