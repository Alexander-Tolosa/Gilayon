import { KeyReturn, LockKey, Plus, UserMinus, UserPlus } from '@phosphor-icons/react'
import { useRef, useState, type FormEvent } from 'react'
import { Badge, Button, Card, Field, Input, Modal, Select, useDialogFocus, useToast } from '../../../shared/components/ui'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'
import type { ServiceType, Staff, StaffRole } from '../types'

const ROLE_LABEL: Record<StaffRole, string> = { doctor: 'Doctor', desk: 'Receptionist', nurse: 'Nurse' }
const SERVICES: ServiceType[] = ['Medical', 'Dental', 'Laboratory']

/** A readable temporary password the doctor can read out or write down. */
const tempPassword = () => {
  const words = ['maya', 'lawin', 'tamsi', 'bangka', 'hinog', 'dagat', 'bukid', 'ilaw']
  const pick = () => words[Math.floor(Math.random() * words.length)]
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`
}

/* ----------------------------- Change own password ---------------------------- */

export function ChangePasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { changePassword } = useClinic()
  const toast = useToast()
  const t = useT()
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (f.next !== f.again) return setError(t('The two new passwords are not the same.'))
    setBusy(true)
    const problem = await changePassword(f.current, f.next)
    setBusy(false)
    if (problem) return setError(problem)
    setF({ current: '', next: '', again: '' })
    setError('')
    toast({ tone: 'ok', title: t('Password changed') })
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label={forced ? t('Temporary password you were given') : t('Current password')}>
        <Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} className="h-12 text-base" />
      </Field>
      <Field label={t('New password')} hint={t('At least 8 characters, with letters and a number.')}>
        <Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} className="h-12 text-base" />
      </Field>
      <Field label={t('New password again')} error={error}>
        <Input type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} className="h-12 text-base" invalid={!!error} />
      </Field>
      <Button type="submit" size="lg" disabled={busy || !f.current || !f.next} icon={<LockKey size={18} />}>
        {t('Change password')}
      </Button>
    </form>
  )
}

/** Blocks the clinic screens until a person with a temporary password chooses their own. */
export function ForcePasswordChange() {
  const { me, signOut } = useClinic()
  const t = useT()
  const panel = useRef<HTMLDivElement>(null)
  const forced = !!me?.must_change_password
  useDialogFocus(panel, forced)
  if (!forced || !me) return null
  return (
    <div ref={panel} className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-brand-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('Choose a new password')}>
      <Card className="w-full max-w-md p-6">
        <p className="text-xl font-semibold">{t('Choose your own password')}</p>
        <p className="mb-4 mt-1 text-[15px] text-muted">{t('Hello,')} {me.name}. {t('This account was set up with a temporary password. Pick one only you know before you continue.')}</p>
        <ChangePasswordForm forced />
        <button onClick={signOut} className="mt-4 text-sm font-medium text-ink-2 underline">
          {t('Sign out instead')}
        </button>
      </Card>
    </div>
  )
}

/* ------------------------------ Staff management ------------------------------ */

type Draft = { name: string; role: StaffRole; title: string; license_no: string; ptr_no: string; room: string; services: ServiceType[]; password: string }
const blank = (): Draft => ({ name: '', role: 'desk', title: '', license_no: '', ptr_no: '', room: '', services: [], password: tempPassword() })

export function StaffManager() {
  const { data, me, createStaff, updateStaffDetails, setStaffActive, resetStaffPassword } = useClinic()
  const toast = useToast()
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(blank)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [reset, setReset] = useState<{ staff: Staff; password: string } | null>(null)
  const [shown, setShown] = useState<{ name: string; password: string } | null>(null)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    const base = { name: draft.name, role: draft.role, title: draft.title, license_no: draft.license_no || undefined, ptr_no: draft.ptr_no || undefined, room: draft.room || undefined, services: draft.services }
    const problem = editing ? await updateStaffDetails(editing.staff_id, base) : await createStaff({ ...base, password: draft.password })
    if (problem) return setError(problem)
    if (!editing) setShown({ name: draft.name, password: draft.password })
    else toast({ tone: 'ok', title: t('Staff details saved') })
    setAdding(false)
    setEditing(null)
  }

  const open = (s?: Staff) => {
    setError('')
    setEditing(s ?? null)
    setDraft(s ? { name: s.name, role: s.role, title: s.title, license_no: s.license_no ?? '', ptr_no: s.ptr_no ?? '', room: s.room ?? '', services: s.services ?? [], password: '' } : blank())
    setAdding(true)
  }

  const toggle = async (s: Staff) => {
    const problem = await setStaffActive(s.staff_id, s.active === false)
    toast(problem ? { tone: 'warn', title: problem } : { tone: 'ok', title: s.active === false ? `${s.name} ${t('can sign in again')}` : `${s.name} ${t('was signed out and deactivated')}` })
  }

  const doReset = async () => {
    if (!reset) return
    const problem = await resetStaffPassword(reset.staff.staff_id, reset.password)
    if (problem) return setError(problem)
    setShown({ name: reset.staff.name, password: reset.password })
    setReset(null)
  }

  return (
    <Card className="p-6 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{t('Clinic staff')}</p>
          <p className="text-[15px] text-muted">{t('Accounts are never deleted, so the audit trail stays complete. Deactivate someone who has left.')}</p>
        </div>
        <Button size="lg" icon={<UserPlus size={18} />} onClick={() => open()}>
          {t('Add staff')}
        </Button>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {data.staff.map((s) => (
          <li key={s.staff_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
            <div className="min-w-0">
              <p className="text-base font-semibold">
                {s.name} <span className="font-normal text-muted">· {s.title}</span>
              </p>
              <p className="text-sm text-muted">
                {t(ROLE_LABEL[s.role])}
                {s.role === 'doctor' && ` · PRC ${s.license_no ?? t('not set')}${s.ptr_no ? ` · PTR ${s.ptr_no}` : ''}${s.room ? ` · ${s.room}` : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {s.active === false && <Badge tone="danger">{t('Deactivated')}</Badge>}
              {s.must_change_password && <Badge tone="warn">{t('Temporary password')}</Badge>}
              <Button variant="secondary" onClick={() => open(s)}>
                {t('Edit')}
              </Button>
              <Button variant="secondary" icon={<KeyReturn size={16} />} onClick={() => { setError(''); setReset({ staff: s, password: tempPassword() }) }}>
                {t('Reset password')}
              </Button>
              {s.staff_id !== me?.staff_id && (
                <Button variant={s.active === false ? 'soft' : 'ghost'} icon={s.active === false ? <Plus size={16} /> : <UserMinus size={16} />} onClick={() => toggle(s)}>
                  {s.active === false ? t('Reactivate') : t('Deactivate')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={editing ? `${t('Edit')} ${editing.name}` : t('Add staff member')}
        subtitle={editing ? undefined : t('They will use the temporary password once, then choose their own.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={save} disabled={!draft.name.trim() || !draft.title.trim()}>
              {editing ? t('Save') : t('Create account')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('Full name')} className="sm:col-span-2">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-12 text-base" />
          </Field>
          <Field label={t('Role')}>
            <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })} className="h-12 text-base">
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {t(ROLE_LABEL[r])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Title')}>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-12 text-base" placeholder={t('e.g. Physician')} />
          </Field>
          {draft.role === 'doctor' && (
            <>
              <Field label={t('PRC license no.')}>
                <Input value={draft.license_no} onChange={(e) => setDraft({ ...draft, license_no: e.target.value })} className="h-12 text-base" />
              </Field>
              <Field label={t('PTR no.')} optional>
                <Input value={draft.ptr_no} onChange={(e) => setDraft({ ...draft, ptr_no: e.target.value })} className="h-12 text-base" />
              </Field>
              <Field label={t('Room')} optional>
                <Input value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} className="h-12 text-base" />
              </Field>
              <Field label={t('Services')}>
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map((sv) => (
                    <label key={sv} className="flex items-center gap-2 rounded-full bg-mist px-3 py-2 text-sm font-medium">
                      <input type="checkbox" checked={draft.services.includes(sv)} onChange={(e) => setDraft({ ...draft, services: e.target.checked ? [...draft.services, sv] : draft.services.filter((x) => x !== sv) })} />
                      {sv}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}
          {!editing && (
            <Field label={t('Temporary password')} hint={t('Write it down or read it out. It is shown once.')} className="sm:col-span-2">
              <Input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className="h-12 font-mono text-base" />
            </Field>
          )}
        </div>
        {error && <p className="mt-3 text-[15px] font-semibold text-danger">{error}</p>}
      </Modal>

      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title={`${t('Reset password for')} ${reset?.staff.name ?? ''}`}
        subtitle={t('They are signed out everywhere and must choose a new password at next sign-in.')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReset(null)}>
              {t('Cancel')}
            </Button>
            <Button onClick={doReset}>{t('Reset password')}</Button>
          </>
        }
      >
        <Field label={t('Temporary password')} error={error}>
          <Input value={reset?.password ?? ''} onChange={(e) => reset && setReset({ ...reset, password: e.target.value })} className="h-12 font-mono text-base" />
        </Field>
      </Modal>

      <Modal open={!!shown} onClose={() => setShown(null)} title={t('Give this to the staff member')} footer={<Button onClick={() => setShown(null)}>{t('Done')}</Button>}>
        <p className="text-base text-ink-2">
          {t('Temporary password for')} <b>{shown?.name}</b>:
        </p>
        <p className="mt-2 rounded-2xl bg-canvas px-4 py-3 font-mono text-xl font-semibold tracking-wide">{shown?.password}</p>
        <p className="mt-3 text-sm text-muted">{t('It cannot be shown again. They will be asked to choose their own at first sign-in.')}</p>
      </Modal>
    </Card>
  )
}
