import { ArrowsMerge, CheckCircle, Warning } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Field, Input, Modal, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { PageTitle } from '../ClinicShell'
import { findDuplicatePairs, type DuplicatePair } from '../lib/duplicates'
import { ageOf, fmtDay } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { Patient } from '../types'

/** Pairs of records that look like one person: review, merge (nothing is deleted) or dismiss. */
export default function Duplicates() {
  const { data } = useClinic()
  const [params] = useSearchParams()
  const focus = params.get('with')
  const pairs = useMemo(() => findDuplicatePairs(data), [data])
  const [open, setOpen] = useState<DuplicatePair | null>(() => (focus ? (findDuplicatePairs(data).find((p) => p.a.patient_id === focus || p.b.patient_id === focus) ?? null) : null))

  return (
    <div>
      <PageTitle title="Possible duplicates" sub="Records with the same birthdate and sex and a similar name. Merging brings both histories together under one record; nothing is deleted, and a doctor can undo it." />
      {pairs.length === 0 ? (
        <Card className="flex items-center gap-4 p-8">
          <CheckCircle size={36} weight="fill" className="text-ok" />
          <div>
            <p className="text-xl font-semibold">No possible duplicates</p>
            <p className="text-base text-ink-2">Every record has a different birthdate or a clearly different name.</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {pairs.map((p) => (
              <li key={`${p.a.patient_id}|${p.b.patient_id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">
                    {p.personA.full_name} <span className="font-normal text-muted">and</span> {p.personB.full_name}
                  </p>
                  <p className="text-[15px] text-muted">
                    Born {fmtDay(p.personA.birthdate)} · {p.a.patient_no} and {p.b.patient_no}
                    {p.blocked && ' · both on the HR list'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.blocked && <Badge tone="warn">Different employees</Badge>}
                  <Button variant="secondary" icon={<ArrowsMerge size={18} />} onClick={() => setOpen(p)}>
                    Review
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Review pair={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Side({ pt, keep, onKeep, disabled }: { pt: Patient; keep: boolean; onKeep: () => void; disabled?: boolean }) {
  const { data, personOfPatient, employeeOfPerson, staffById } = useClinic()
  const per = personOfPatient(pt.patient_id)!
  const emp = employeeOfPerson(per.person_id)
  const n = (rows: { patient_id: string }[]) => rows.filter((r) => r.patient_id === pt.patient_id).length
  const principal = data.relationships.find((r) => r.related_patient_id === pt.patient_id)
  const dependents = data.relationships.filter((r) => r.patient_id === pt.patient_id).length
  const rows: [string, string][] = [
    ['Name', per.full_name],
    ['Born', `${fmtDay(per.birthdate)} (${ageOf(per.birthdate)} yrs)`],
    ['Record no.', pt.patient_no],
    ['Employee ID', emp ? `${emp.employee_no} · ${emp.office}` : principal ? 'Dependent' : 'Not on the HR list'],
    ['Paper folder', pt.legacy_folder_no ?? 'None recorded'],
    ['Contact', per.contact || 'None'],
    ['PhilHealth', pt.philhealth_pin ?? 'None'],
    ['Created', `${fmtDay(new Date(pt.created_at).toISOString().slice(0, 10))} by ${staffById(pt.created_by)?.name ?? pt.created_by}`],
    ['History', `${n(data.consultations)} consultations · ${n(data.documents) + n(data.prescriptions)} documents · ${n(data.scans)} scans${dependents ? ` · ${dependents} dependents` : ''}`],
  ]
  return (
    <div className={cn('rounded-3xl border-2 p-4', keep ? 'border-brand-500 bg-brand-50/40' : 'border-line')}>
      <dl className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className="text-[15px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <Button variant={keep ? 'primary' : 'secondary'} className="mt-4 w-full" onClick={onKeep} disabled={disabled}>
        {keep ? 'Keeping this record' : 'Keep this one'}
      </Button>
    </div>
  )
}

function Review({ pair, onClose }: { pair: DuplicatePair | null; onClose: () => void }) {
  const { data, mergePatients, markNotDuplicate } = useClinic()
  const toast = useToast()
  const [keepSide, setKeepSide] = useState<'a' | 'b' | null>(null)
  const [reason, setReason] = useState('Same name, birthdate and sex; confirmed with the patient.')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!pair) return null

  const hrA = data.employees.some((e) => e.person_id === pair.a.person_id)
  const hrB = data.employees.some((e) => e.person_id === pair.b.person_id)
  // The HR-listed record has to be the survivor, so the choice is made for the person.
  const forced: 'a' | 'b' | null = hrA && !hrB ? 'a' : hrB && !hrA ? 'b' : null
  const side = forced ?? keepSide ?? pair.suggestKeep

  const merge = async () => {
    setBusy(true)
    setError('')
    const keep = side === 'a' ? pair.a : pair.b
    const dup = side === 'a' ? pair.b : pair.a
    const problem = await mergePatients(keep.patient_id, dup.patient_id, reason)
    setBusy(false)
    if (problem) return setError(problem)
    toast({ tone: 'ok', title: 'Records merged', body: 'Both histories now show under one record.' })
    onClose()
  }

  const different = async () => {
    const problem = await markNotDuplicate(pair.a.patient_id, pair.b.patient_id)
    if (problem) return setError(problem)
    toast({ tone: 'ok', title: 'Marked as different people' })
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Are these the same person?"
      subtitle="Compare the two records. The one you keep stays; the other is folded into it."
      footer={
        <>
          <Button variant="ghost" onClick={different}>
            They are different people
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!pair.blocked && (
            <Button icon={<ArrowsMerge size={18} />} onClick={merge} disabled={busy || reason.trim().length < 3}>
              {busy ? 'Merging…' : 'Merge records'}
            </Button>
          )}
        </>
      }
    >
      {pair.blocked ? (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <span>Both records are on the HR list under different employee numbers. They are different people, or HR has a duplicate to fix. They cannot be merged here.</span>
        </p>
      ) : (
        forced && <p className="mb-4 text-[15px] text-ink-2">The record on the HR list has to be the one kept.</p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Side pt={pair.a} keep={!pair.blocked && side === 'a'} onKeep={() => setKeepSide('a')} disabled={pair.blocked || forced === 'b'} />
        <Side pt={pair.b} keep={!pair.blocked && side === 'b'} onKeep={() => setKeepSide('b')} disabled={pair.blocked || forced === 'a'} />
      </div>
      {!pair.blocked && (
        <div className="mt-4">
          <Field label="Why are these the same person?" hint="Kept in the audit trail with the merge." error={error}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-12 text-base" invalid={!!error} />
          </Field>
          <p className="mt-3 text-sm text-muted">Signed prescriptions and certificates keep the record they were issued under. A doctor can undo the merge later.</p>
        </div>
      )}
      {pair.blocked && error && <p className="mt-3 text-[15px] font-semibold text-danger">{error}</p>}
      <p className="mt-3 text-sm">
        <Link to={`/clinic/patients/${pair.a.patient_id}`} className="font-medium text-brand-700 underline" onClick={onClose}>
          Open the first record
        </Link>
        {' · '}
        <Link to={`/clinic/patients/${pair.b.patient_id}`} className="font-medium text-brand-700 underline" onClick={onClose}>
          Open the second record
        </Link>
      </p>
    </Modal>
  )
}
