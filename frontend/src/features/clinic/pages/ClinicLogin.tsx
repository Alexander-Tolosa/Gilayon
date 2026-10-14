import { ArrowLeft, ArrowRight, LockKey, Monitor } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../../shared/components/Logo'
import { Avatar, Button, Field, Input } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { useClinicScale } from '../ClinicShell'
import { LanguageSwitch, StatusBadge } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'
import type { StaffRole } from '../types'

export default function ClinicLogin() {
  useClinicScale()
  const t = useT()
  const { data, me, signIn } = useClinic()
  const [params] = useSearchParams()
  const roleParam = params.get('role')
  const initialRole: StaffRole = roleParam === 'doctor' ? 'doctor' : roleParam === 'nurse' ? 'nurse' : 'desk'
  const [role, setRole] = useState<StaffRole>(initialRole)
  const accounts = data.staff.filter((s) => s.role === role)
  const [staffId, setStaffId] = useState(accounts[0]?.staff_id ?? '')
  const [password, setPassword] = useState('demo-password')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (me) return <Navigate to="/clinic" replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Enter your password.')
    signIn(staffId)
    navigate(role === 'doctor' ? '/clinic/doctor' : '/clinic/checkin')
  }

  return (
    <div className="grid min-h-[100dvh] bg-canvas lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-base font-medium text-ink-2 hover:bg-mist">
            <ArrowLeft size={18} /> {t('Back')}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <StatusBadge />
          </div>
        </div>
        <form onSubmit={submit} className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10">
          <div className="flex items-center gap-3">
            <LogoMark className="size-12 rounded-2xl" />
            <div>
              <p className="text-2xl font-semibold tracking-[-0.02em]">himsog</p>
              <p className="text-[15px] text-muted">HMO-Clinic digital records</p>
            </div>
          </div>
          <h1 className="mt-10 text-[2.1rem] font-semibold leading-tight tracking-[-0.03em]">Sign in to the clinic</h1>
          <div className="mt-6 grid grid-cols-3 gap-1.5 rounded-full border border-line bg-surface p-1.5" role="tablist">
            {(['doctor', 'desk', 'nurse'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                onClick={() => {
                  setRole(r)
                  setStaffId(data.staff.find((s) => s.role === r)?.staff_id ?? '')
                }}
                className={cn('h-12 rounded-full text-[15px] font-semibold transition sm:text-[16px]', role === r ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-mist')}
              >
                {t(r === 'doctor' ? 'Doctor' : r === 'nurse' ? 'Nurse' : 'Receptionist')}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-6 text-[15px] font-medium text-ink-2">Account</p>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <button
                key={a.staff_id}
                type="button"
                onClick={() => setStaffId(a.staff_id)}
                className={cn('flex items-center gap-4 rounded-2xl border p-4 text-left transition', staffId === a.staff_id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line bg-surface hover:border-brand-200')}
              >
                <Avatar name={a.name} size="md" />
                <span className="flex-1">
                  <span className="block text-[17px] font-semibold">{a.name}</span>
                  <span className="block text-[15px] text-muted">
                    {a.title}
                    {a.room ? ` · ${a.room}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Field label="Password" htmlFor="pw" error={error || undefined} className="mt-5">
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-14 text-lg" autoComplete="current-password" />
          </Field>
          <Button type="submit" size="lg" className="mt-6 h-14 text-lg" iconRight={<ArrowRight size={20} weight="bold" />}>
            Sign in
          </Button>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <LockKey size={16} /> Demo accounts are filled in. Sign-in details are kept apart from license numbers.
          </p>
        </form>
        <a href="/waiting" target="_blank" rel="noreferrer" className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-3 text-base font-medium text-ink-2 hover:border-brand-300">
          <Monitor size={20} /> Open the waiting screen (no sign-in)
        </a>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand-950 p-14 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgb(143_176_255/0.5)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative max-w-md">
          <p className="text-3xl font-light leading-tight tracking-[-0.02em]">
            Verified check-in, a fair queue, <span className="font-semibold">signed documents and a report that builds itself.</span>
          </p>
          <ul className="mt-8 space-y-3 text-lg text-brand-100">
            <li>Runs on the clinic's own computers</li>
            <li>Keeps working with no internet</li>
            <li>Every action is written to the audit trail</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
