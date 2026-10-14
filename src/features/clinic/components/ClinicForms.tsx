import { Camera, CheckCircle, UploadSimple, Warning } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Button, Chip, Field, Input, Select, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { useT } from '../lib/i18n'
import { ageOf, compressImage, fmtDay, todayKey } from '../lib/helpers'
import { useClinic, type NewPersonInput } from '../store/store'
import type { CivilStatus, RelationshipType, ScanKind, Sex } from '../types'

/** Attach scans of old paper pages to a record, by upload (or the camera on a tablet). */
export function ScanUploader({ patientId, compact }: { patientId: string; compact?: boolean }) {
  const { uploadScan, online } = useClinic()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<ScanKind>('Chart')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    let n = 0
    for (const f of Array.from(files)) {
      try {
        const data = await compressImage(f)
        if (await uploadScan(patientId, data, kind, date || todayKey())) n++
      } catch {
        toast({ tone: 'warn', title: `${f.name} is not an image`, body: 'Scan pages as JPG or PNG.' })
      }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
    if (n) toast({ tone: 'ok', title: `${n} page${n > 1 ? 's' : ''} attached`, body: 'Saved to the record. The paper folder stays until retention rules are confirmed.' })
  }
  return (
    <div className={cn('rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-5', compact && 'p-4')}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Page type" className="min-w-40">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ScanKind)} className="h-12 text-base">
            {(['Chart', 'Prescription', 'Lab result', 'Certificate'] as ScanKind[]).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date on the page" optional className="min-w-44">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
        </Field>
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <Button type="button" size="lg" className="h-12" disabled={busy || !online} icon={<UploadSimple size={20} />} onClick={() => input.current?.click()}>
          {busy ? 'Attaching…' : 'Attach scans'}
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Camera size={16} /> {online ? 'Choose photos or scanner images. On a tablet this opens the camera.' : 'Attaching scans needs the clinic server. Reconnect to upload.'}
      </p>
    </div>
  )
}

/** Create a dependent linked to an employee, with the duplicate-patient warning. */
export function DependentForm({ principalPatientId, onDone, onCancel }: { principalPatientId: string; onDone: (patientId: string) => void; onCancel?: () => void }) {
  const t = useT()
  const { createDependent, findDuplicates, personOfPatient, patientOfPerson, online } = useClinic()
  const toast = useToast()
  const principal = personOfPatient(principalPatientId)
  const surname = principal?.full_name.split(' ').slice(-1)[0] ?? ''
  const [f, setF] = useState<NewPersonInput & { type: RelationshipType; mdr: boolean }>({ full_name: '', birthdate: '', sex: 'Female', contact: principal?.contact ?? '', civil_status: 'Single', philhealth_pin: '', pwd_id: '', type: 'Child', mdr: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ackDup, setAckDup] = useState(false)
  const dups = f.full_name.trim().length > 4 && f.birthdate ? findDuplicates(f.full_name, f.birthdate) : []

  const submit = async () => {
    const e: Record<string, string> = {}
    if (f.full_name.trim().split(' ').length < 2) e.full_name = t('Required field')
    if (!f.birthdate) e.birthdate = t('Required field')
    else if (f.birthdate > todayKey()) e.birthdate = 'Birthdate cannot be in the future'
    setErrors(e)
    if (Object.keys(e).length || (dups.length && !ackDup)) return
    const pt = await createDependent(principalPatientId, f, f.type, f.mdr)
    if (!pt) return toast({ tone: 'warn', title: 'Needs the clinic server', body: 'New records can only be created when this computer is connected.' })
    toast({ tone: 'ok', title: 'Dependent added', body: `${f.full_name} is linked to ${principal?.full_name}.` })
    onDone(pt.patient_id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Full name')} error={errors.full_name} className="sm:col-span-2">
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder={`e.g. Ana ${surname}`} className="h-12 text-base" invalid={!!errors.full_name} />
        </Field>
        <Field label={t('Birthdate')} error={errors.birthdate} hint={f.birthdate && !errors.birthdate ? `${t('Age')}: ${ageOf(f.birthdate)} (calculated)` : undefined}>
          <Input type="date" value={f.birthdate} onChange={(e) => setF({ ...f, birthdate: e.target.value })} className="h-12 text-base" invalid={!!errors.birthdate} />
        </Field>
        <Field label="Relationship to the employee">
          <div className="flex flex-wrap gap-2">
            {(['Spouse', 'Child', 'Parent', 'Sibling'] as RelationshipType[]).map((r) => (
              <Chip key={r} selected={f.type === r} onClick={() => setF({ ...f, type: r })} className="h-11 text-[15px]">
                {r}
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
          <Input value={f.philhealth_pin} onChange={(e) => setF({ ...f, philhealth_pin: e.target.value })} placeholder="12-345678901-2" className="h-12 text-base" />
        </Field>
        <Field label={t('PWD ID')} optional>
          <Input value={f.pwd_id} onChange={(e) => setF({ ...f, pwd_id: e.target.value })} className="h-12 text-base" />
        </Field>
        <label className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-[15px] sm:col-span-2">
          <input type="checkbox" checked={f.mdr} onChange={(e) => setF({ ...f, mdr: e.target.checked })} className="size-5 accent-brand-600" />
          Listed as a dependent on the employee's PhilHealth MDR
        </label>
      </div>
      {dups.length > 0 && (
        <div className="rounded-2xl border border-[#fbe2b0] bg-warn-soft p-4" role="alert">
          <p className="flex items-center gap-2 text-base font-semibold text-warn">
            <Warning size={20} weight="fill" /> {t('Possible duplicate')}: same name and birthdate already on file
          </p>
          {dups.map((d) => (
            <p key={d.person_id} className="mt-1 text-[15px] text-ink-2">
              {d.full_name} · {fmtDay(d.birthdate)} · {patientOfPerson(d.person_id)?.patient_no ?? 'HR list'}
            </p>
          ))}
          <label className="mt-3 flex items-center gap-2 text-[15px] font-medium">
            <input type="checkbox" checked={ackDup} onChange={(e) => setAckDup(e.target.checked)} className="size-5 accent-brand-600" /> I checked an ID: this is a different person
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
