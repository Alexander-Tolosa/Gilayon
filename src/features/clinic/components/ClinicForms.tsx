import { Camera, CheckCircle, Scan, UploadSimple, Warning } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Field, Input, Select, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { useT } from '../lib/i18n'
import { ageOf, compressImage, fmtDay, todayKey } from '../lib/helpers'
import { useClinic, type NewPersonInput, type UnlistedInput } from '../store/store'
import type { CivilStatus, RelationshipType, ScanCategory, ScanKind, Sex, Vitals } from '../types'

/** Attach scans of old paper pages to a record, by upload (or the camera on a tablet). */
export function ScanUploader({ patientId, compact, returnTo, defaultCategory = 'Old folder' }: { patientId: string; compact?: boolean; returnTo?: string; defaultCategory?: ScanCategory }) {
  const { uploadScan, scanFolderForm, online } = useClinic()
  const toast = useToast()
  const t = useT()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const aiInput = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<ScanKind>('Chart')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<ScanCategory>(defaultCategory)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const outside = category === 'Outside report'
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    if (outside && !source.trim()) {
      toast({ tone: 'warn', title: 'Name the clinic or hospital', body: 'Outside reports are filed with the place they came from.' })
      return
    }
    setBusy(true)
    let n = 0
    for (const f of Array.from(files)) {
      try {
        const data = await compressImage(f)
        if (await uploadScan(patientId, data, kind, date || todayKey(), { category, source_clinic: outside ? source.trim() : undefined, report_date: outside ? date || undefined : undefined })) n++
      } catch {
        toast({ tone: 'warn', title: `${f.name} ${t('is not an image')}`, body: t('Scan pages as JPG or PNG.') })
      }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
    if (n) toast({ tone: 'ok', title: `${n} ${n > 1 ? t('pages attached') : t('page attached')}`, body: t('Saved to the record. The paper folder stays until retention rules are confirmed.') })
  }
  /** Read one photographed form with the clinic server's OCR (and Ollama when it runs), then hand it to Scan old folder to verify. */
  const scanWithAi = async (files: FileList | null) => {
    const f = files?.[0]
    if (aiInput.current) aiInput.current.value = ''
    if (!f) return
    setBusy(true)
    try {
      const image = await compressImage(f, 2000, 0.85)
      const out = await scanFolderForm(image)
      if (out.error || !out.reading) {
        toast({ tone: 'warn', title: t('The scan could not be read.'), body: out.error ?? t('Retake it flat, in good light, with the whole form in view.') })
      } else {
        navigate('/clinic/scan', { state: { image, reading: out.reading, patientId, returnTo } })
      }
    } catch {
      toast({ tone: 'warn', title: `${f.name} ${t('is not an image')}`, body: t('Scan pages as JPG or PNG.') })
    }
    setBusy(false)
  }
  return (
    <div className={cn('rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-5', compact && 'p-4')}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Filed as')} className="min-w-44">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ScanCategory)} className="h-12 text-base">
            <option value="Old folder">Old folder page</option>
            <option value="Outside report">Outside clinic report</option>
          </Select>
        </Field>
        {outside && (
          <Field label={t('From which clinic or hospital?')} className="min-w-56 flex-1">
            <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} className="h-12 text-base" />
          </Field>
        )}
        <Field label={t('Page type')} className="min-w-40">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ScanKind)} className="h-12 text-base">
            {(['Chart', 'Prescription', 'Lab result', 'Certificate', 'Dental'] as ScanKind[]).map((k) => (
              <option key={k} value={k}>{t(k)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('Date on the page')} optional className="min-w-44">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
        </Field>
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <Button type="button" size="lg" className="h-12" disabled={busy || !online} icon={<UploadSimple size={20} />} onClick={() => input.current?.click()}>
          {busy ? t('Attaching…') : t('Attach scans')}
        </Button>
        <input ref={aiInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanWithAi(e.target.files)} />
        <Button type="button" size="lg" variant="secondary" className="h-12" disabled={busy || !online} icon={<Scan size={20} />} onClick={() => aiInput.current?.click()}>
          {t('Scan with AI')}
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Camera size={16} /> {online ? t('Choose photos or scanner images. On a tablet this opens the camera. Scan with AI reads an intake form for you to check before it is saved.') : t('Attaching scans needs the clinic server. Reconnect to upload.')}
      </p>
    </div>
  )
}

/** Vital signs taken at the front desk. Optional: the doctor sees them already filled in. */
export function VitalsFields({ vitals, onChange, className }: { vitals: Vitals; onChange: (v: Vitals) => void; className?: string }) {
  const t = useT()
  const fields = [
    ['bp', 'Blood pressure (mmHg)', '120/80'],
    ['temperature', 'Body temp (°C)', '36.8'],
    ['pulse', 'Pulse rate (bpm)', '78'],
    ['respiration', 'Respiration rate (/min)', '16'],
    ['height', 'Height (cm)', '165'],
    ['weight', 'Weight (kg)', '62'],
  ] as const
  return (
    <div className={className ?? 'mt-5'}>
      <p className="text-lg font-semibold">{t('Vital signs')}</p>
      <p className="text-base text-ink-2">{t('Taken at the front desk for this visit. The doctor starts from these.')}</p>
      <div className="mt-3 grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
        {fields.map(([k, label]) => (
          <Field key={k} label={label}>
            <Input value={vitals[k] ?? ''} onChange={(e) => onChange({ ...vitals, [k]: e.target.value })} className="h-12 text-base" inputMode={k === 'bp' ? 'text' : 'decimal'} maxLength={k === 'bp' ? 20 : 10} />
          </Field>
        ))}
      </div>
    </div>
  )
}

/** Create a dependent linked to an employee, with the duplicate-patient warning. */
export function DependentForm({ principalPatientId, onDone, onCancel, vitals, onVitals }: { principalPatientId: string; onDone: (patientId: string) => void; onCancel?: () => void; vitals?: Vitals; onVitals?: (v: Vitals) => void }) {
  const t = useT()
  const { createDependent, findDuplicates, personOfPatient, patientOfPerson, online } = useClinic()
  const toast = useToast()
  const principal = personOfPatient(principalPatientId)
  const [f, setF] = useState<NewPersonInput & { type: RelationshipType; mdr: boolean }>({ full_name: '', birthdate: '', sex: 'Female', contact: principal?.contact ?? '', civil_status: 'Single', philhealth_pin: '', pwd_id: '', type: 'Child', mdr: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ackDup, setAckDup] = useState(false)
  const dups = f.full_name.trim().length > 4 && f.birthdate ? findDuplicates(f.full_name, f.birthdate) : []

  const submit = async () => {
    const e: Record<string, string> = {}
    if (f.full_name.trim().split(' ').length < 2) e.full_name = t('Required field')
    if (!f.birthdate) e.birthdate = t('Required field')
    else if (f.birthdate > todayKey()) e.birthdate = t('Birthdate cannot be in the future')
    setErrors(e)
    if (Object.keys(e).length || (dups.length && !ackDup)) return
    const pt = await createDependent(principalPatientId, f, f.type, f.mdr, dups.length > 0 && ackDup)
    if (!pt) return toast({ tone: 'warn', title: t('Needs the clinic server'), body: t('New records can only be created when this computer is connected.') })
    toast({ tone: 'ok', title: t('Dependent added'), body: `${f.full_name} ${t('is linked to')} ${principal?.full_name}.` })
    onDone(pt.patient_id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Full name')} error={errors.full_name} className="sm:col-span-2">
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} className="h-12 text-base" invalid={!!errors.full_name} />
        </Field>
        <Field label={t('Birthdate')} error={errors.birthdate} hint={f.birthdate && !errors.birthdate ? `${t('Age')}: ${ageOf(f.birthdate)} ${t('calculated')})` : undefined}>
          <Input type="date" value={f.birthdate} onChange={(e) => setF({ ...f, birthdate: e.target.value })} className="h-12 text-base" invalid={!!errors.birthdate} />
        </Field>
        <Field label={t('Relationship to the employee')}>
          <div className="flex flex-wrap gap-2">
            {(['Spouse', 'Child', 'Parent', 'Sibling'] as RelationshipType[]).map((r) => (
              <Chip key={r} selected={f.type === r} onClick={() => setF({ ...f, type: r })} className="h-11 text-[15px]">
                {t(r)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={t('Sex')}>
          <div className="flex gap-2">
            {(['Female', 'Male'] as Sex[]).map((s) => (
              <Chip key={s} selected={f.sex === s} onClick={() => setF({ ...f, sex: s })} className="h-11 flex-1 justify-center text-[15px]">
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
        <Field label={t('Contact')} optional>
          <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PhilHealth PIN')} optional>
          <Input value={f.philhealth_pin} onChange={(e) => setF({ ...f, philhealth_pin: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PWD ID')} optional>
          <Input value={f.pwd_id} onChange={(e) => setF({ ...f, pwd_id: e.target.value })} className="h-12 text-base" />
        </Field>
        {vitals && onVitals && <VitalsFields vitals={vitals} onChange={onVitals} className="sm:col-span-2" />}
        <label className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-[15px] sm:col-span-2">
          <input type="checkbox" checked={f.mdr} onChange={(e) => setF({ ...f, mdr: e.target.checked })} className="size-5 accent-brand-600" />
          {t("Listed as a dependent on the employee's PhilHealth MDR")}
        </label>
      </div>
      {dups.length > 0 && (
        <div className="rounded-2xl border border-[#fbe2b0] bg-warn-soft p-4" role="alert">
          <p className="flex items-center gap-2 text-base font-semibold text-warn">
            <Warning size={20} weight="fill" /> {t('Possible duplicate')}: {t('same name and birthdate already on file')}
          </p>
          {dups.map((d) => (
            <p key={d.person_id} className="mt-1 text-[15px] text-ink-2">
              {d.full_name} · {fmtDay(d.birthdate)} · {patientOfPerson(d.person_id)?.patient_no ?? t('HR list')}
            </p>
          ))}
          <label className="mt-3 flex items-center gap-2 text-[15px] font-medium">
            <input type="checkbox" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} className="size-5 accent-brand-600" /> {t('I checked an ID: this is a different person')}
          </label>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        )}
        <Button size="lg" onClick={submit} disabled={!online || (dups.length > 0 && !ackDup)} icon={<CheckCircle size={20} weight="fill" />}>
          {t('Add dependent')}
        </Button>
      </div>
    </div>
  )
}

/** For someone who is not in the system yet: a paper-only past patient or a walk-in. Employee details are optional. */
export function UnlistedForm({ onDone, onCancel, vitals, onVitals }: { onDone: (patientId: string, personId: string) => void; onCancel?: () => void; vitals?: Vitals; onVitals?: (v: Vitals) => void }) {
  const t = useT()
  const { registerUnlisted, online } = useClinic()
  const toast = useToast()
  const [f, setF] = useState<UnlistedInput>({ full_name: '', birthdate: '', sex: 'Female', contact: '', civil_status: 'Single', philhealth_pin: '', pwd_id: '', employee_no: '', office: '', position: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dupMessage, setDupMessage] = useState<string | null>(null)
  const [ackDup, setAckDup] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const e: Record<string, string> = {}
    if (f.full_name.trim().split(/\s+/).length < 2) e.full_name = t('Required field')
    if (!f.birthdate) e.birthdate = t('Required field')
    else if (f.birthdate > todayKey()) e.birthdate = t('Birthdate cannot be in the future')
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setServerError(null)
    const r = await registerUnlisted(f, ackDup)
    setBusy(false)
    if (r.patient) {
      toast({ tone: 'ok', title: t('Record created'), body: f.full_name })
      onDone(r.patient.patient_id, r.patient.person_id)
    } else if (r.duplicate) {
      setDupMessage(r.error ?? null)
    } else setServerError(r.error ?? null)
  }
  const edit = (patch: Partial<UnlistedInput>) => {
    setF({ ...f, ...patch })
    setDupMessage(null)
    setAckDup(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Full name')} error={errors.full_name} className="sm:col-span-2">
          <Input value={f.full_name} onChange={(e) => edit({ full_name: e.target.value })} className="h-12 text-base" invalid={!!errors.full_name} />
        </Field>
        <Field label={t('Birthdate')} error={errors.birthdate} hint={f.birthdate && !errors.birthdate ? `${t('Age')}: ${ageOf(f.birthdate)} ${t('calculated')})` : undefined}>
          <Input type="date" value={f.birthdate} onChange={(e) => edit({ birthdate: e.target.value })} className="h-12 text-base" invalid={!!errors.birthdate} />
        </Field>
        <Field label={t('Sex')}>
          <div className="flex gap-2">
            {(['Female', 'Male'] as Sex[]).map((s) => (
              <Chip key={s} selected={f.sex === s} onClick={() => edit({ sex: s })} className="h-11 flex-1 justify-center text-[15px]">
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
        <Field label={t('Contact')} optional>
          <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PhilHealth PIN')} optional>
          <Input value={f.philhealth_pin} onChange={(e) => setF({ ...f, philhealth_pin: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('PWD ID')} optional>
          <Input value={f.pwd_id} onChange={(e) => setF({ ...f, pwd_id: e.target.value })} className="h-12 text-base" />
        </Field>
        {vitals && onVitals && <VitalsFields vitals={vitals} onChange={onVitals} className="sm:col-span-2" />}
        <p className="text-base font-semibold text-ink-2 sm:col-span-2">{t('Works for the partner company? (optional)')}</p>
        <Field label={t('Employee ID')} optional>
          <Input value={f.employee_no} onChange={(e) => setF({ ...f, employee_no: e.target.value })} className="h-12 font-mono text-base uppercase" />
        </Field>
        <Field label={t('Office')} optional>
          <Input value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label={t('Position')} optional className="sm:col-span-2">
          <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} className="h-12 text-base" />
        </Field>
      </div>
      {dupMessage && (
        <div className="rounded-2xl border border-[#fbe2b0] bg-warn-soft p-4" role="alert">
          <p className="flex items-center gap-2 text-base font-semibold text-warn">
            <Warning size={20} weight="fill" /> {t('Possible duplicate')}
          </p>
          <p className="mt-1 text-[15px] text-ink-2">{dupMessage}</p>
          <label className="mt-3 flex items-center gap-2 text-[15px] font-medium">
            <input type="checkbox" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} className="size-5 accent-brand-600" /> {t('I checked an ID: this is a different person')}
          </label>
        </div>
      )}
      {serverError && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-base text-danger">{serverError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {t('Cancel')}
          </Button>
        )}
        <Button size="lg" onClick={submit} disabled={!online || busy || (!!dupMessage && !ackDup)} icon={<CheckCircle size={20} weight="fill" />}>
          {t('Register person')}
        </Button>
      </div>
    </div>
  )
}
