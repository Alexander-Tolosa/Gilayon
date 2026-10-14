import { CheckCircle, IdentificationCard, PencilSimple, Plus, ShieldCheck, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { Badge, Button, Card, CardHeader, Chip, Field, Input, KeyValue, PageHeader, useToast } from '../../components/ui'
import { COMMON_ALLERGIES, COMMON_CONDITIONS } from '../../data/clinical'
import { cn, fmtDate, fmtStamp, todayISO, uid } from '../../lib/utils'
import { useStore } from '../../store/store'
import { useSelf } from './shared'

export default function PatientProfile() {
  const me = useSelf()
  const { updatePatient, audit } = useStore()
  const toast = useToast()
  const [conditions, setConditions] = useState(me.conditions)
  const [allergies, setAllergies] = useState(me.allergies)
  const [med, setMed] = useState({ name: '', dose: '', frequency: '' })
  const [ins, setIns] = useState({ provider: me.insurance.provider === 'Not provided' ? '' : me.insurance.provider, memberId: me.insurance.memberId === 'n/a' ? '' : me.insurance.memberId })
  const [editingIns, setEditingIns] = useState(me.insurance.status !== 'verified')
  const myLog = audit.filter((a) => a.target.includes(me.id) || a.target.includes(me.name) || a.actor === me.name).slice(0, 8)

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const dirty = conditions.join() !== me.conditions.join() || allergies.join() !== me.allergies.join()

  return (
    <div>
      <PageHeader title="Profile" subtitle="Keep your details and history current before each visit" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Pre-visit check-in" subtitle="Update your history so your doctor sees it before you arrive" />
            <div className="flex flex-col gap-6 p-5 sm:p-6">
              <Field label="Conditions">
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...COMMON_CONDITIONS, ...conditions])].map((c) => (
                    <Chip key={c} selected={conditions.includes(c)} onClick={() => toggle(conditions, setConditions, c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Allergies">
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...COMMON_ALLERGIES, ...allergies])].map((c) => (
                    <Chip key={c} selected={allergies.includes(c)} onClick={() => toggle(allergies, setAllergies, c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Add a medicine you take" hint="Over-the-counter medicines and supplements count too">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <Input value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} placeholder="Medicine" aria-label="Medicine name" />
                  <Input value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} placeholder="Dose" aria-label="Dose" />
                  <Input value={med.frequency} onChange={(e) => setMed({ ...med, frequency: e.target.value })} placeholder="How often" aria-label="How often" />
                  <Button
                    variant="soft"
                    icon={<Plus size={16} weight="bold" />}
                    disabled={!med.name.trim()}
                    onClick={() => {
                      updatePatient(me.id, { medications: [{ id: uid('m'), name: med.name.trim(), dose: med.dose, frequency: med.frequency, prescribedBy: 'Self-reported', since: todayISO(), status: 'active' }, ...me.medications] })
                      setMed({ name: '', dose: '', frequency: '' })
                      toast({ tone: 'ok', title: 'Medicine added', body: 'Your doctor will review it at your next visit.' })
                    }}
                  >
                    Add
                  </Button>
                </div>
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-canvas p-4">
                <p className="text-sm text-muted">{dirty ? 'You have unsaved changes.' : 'Your history is up to date.'}</p>
                <Button
                  disabled={!dirty}
                  onClick={() => {
                    updatePatient(me.id, { conditions, allergies })
                    toast({ tone: 'ok', title: 'History updated', body: 'Your care team can see the changes now.' })
                  }}
                >
                  Save changes
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Who viewed my record" subtitle="Every access is logged automatically" />
            <ul className="flex flex-col gap-2 p-5 sm:p-6">
              {myLog.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
              {myLog.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.action}</p>
                    <p className="truncate text-xs text-muted">{a.actor}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted tabular">{fmtStamp(a.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Personal details" />
            <dl className="grid grid-cols-2 gap-4 p-5 sm:p-6">
              <KeyValue k="Full name" v={me.name} className="col-span-2" />
              <KeyValue k="Patient ID" v={<span className="font-mono text-brand-700">{me.id}</span>} />
              <KeyValue k="Date of birth" v={fmtDate(me.dob)} />
              <KeyValue k="Sex" v={me.sex} />
              <KeyValue k="Blood type" v={me.bloodType} />
              <KeyValue k="Mobile" v={me.phone} className="col-span-2" />
              <KeyValue k="Email" v={me.email} className="col-span-2" />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Insurance"
              action={
                me.insurance.status === 'verified' ? (
                  <Badge tone="ok" icon={<CheckCircle size={12} weight="fill" />}>Verified</Badge>
                ) : me.insurance.status === 'expired' ? (
                  <Badge tone="danger">Expired</Badge>
                ) : (
                  <Badge tone="warn">Not verified</Badge>
                )
              }
            />
            <div className="p-5 sm:p-6">
              {!editingIns ? (
                <div className="relative overflow-hidden rounded-2xl bg-brand-950 p-5 text-white">
                  <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-brand-600/50 blur-2xl" />
                  <IdentificationCard size={26} className="relative text-brand-300" />
                  <p className="relative mt-6 text-lg font-semibold">{me.insurance.provider}</p>
                  <p className="relative font-mono text-sm tracking-wider text-brand-200">{me.insurance.memberId}</p>
                  <button onClick={() => setEditingIns(true)} className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20">
                    <PencilSimple size={12} /> Edit
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Field label="Insurance provider" htmlFor="ins-p">
                    <Input id="ins-p" value={ins.provider} onChange={(e) => setIns({ ...ins, provider: e.target.value })} placeholder="e.g. BlueCross PPO" />
                  </Field>
                  <Field label="Member ID" htmlFor="ins-m">
                    <Input id="ins-m" value={ins.memberId} onChange={(e) => setIns({ ...ins, memberId: e.target.value })} placeholder="ABC-123-4567" />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      disabled={!ins.provider || !ins.memberId}
                      onClick={() => {
                        updatePatient(me.id, { insurance: { provider: ins.provider, memberId: ins.memberId, status: 'pending' } })
                        setEditingIns(false)
                        toast({ tone: 'ok', title: 'Insurance saved', body: 'The front desk will verify coverage before your visit.' })
                      }}
                    >
                      Save insurance
                    </Button>
                    {me.insurance.memberId !== 'n/a' && (
                      <Button variant="ghost" icon={<X size={14} />} onClick={() => setEditingIns(false)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className={cn('p-5 sm:p-6')}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={18} weight="fill" className="text-brand-600" /> Your privacy
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Your record is encrypted and only shared with your care team. You can download a full copy from the Health record page at any time.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
