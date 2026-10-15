import { ArrowLeft, ArrowRight, LockKey, Monitor } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../../shared/components/Logo'
import { LegalLinks } from '../../../shared/components/Legal'
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
  const accounts = data.staff.filter((s) => s.role === role && s.active !== false)
  const [staffId, setStaffId] = useState(accounts[0]?.staff_id ?? '')
  // Only the demo server fills in the shared demo password; a real clinic server never does.
  const [typed, setPassword] = useState<string | null>(null)
  const password = typed ?? (data.demo ? 'demo-password' : '')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (me) return <Navigate to="/clinic" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Enter your password.')
    const failure = await signIn(staffId, password)
    if (failure) return setError(failure)
    navigate(role === 'doctor' ? '/clinic/doctor' : '/clinic/checkin')
  }

  return (
    <div className="grid min-h-[100dvh] bg-canvas lg:h-[100dvh] lg:grid-cols-[1fr_0.9fr]">
      <div className="flex min-h-0 flex-col px-5 py-4 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-base font-medium text-ink-2 hover:bg-mist">
            <ArrowLeft size={18} /> {t('Back')}
          </Link>
          <div className="flex items-center gap-2">
            <a href="/waiting" target="_blank" rel="noreferrer" title="Open the waiting screen (no sign-in)" className="hidden items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[15px] font-medium text-ink-2 hover:border-brand-300 sm:inline-flex">
              <Monitor size={18} /> Waiting screen
            </a>
            <LanguageSwitch />
            <StatusBadge />
          </div>
        </div>
        <form onSubmit={submit} className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center py-4">
          <div className="flex items-center gap-3">
            <LogoMark className="size-11 rounded-2xl" />
            <div>
              <p className="text-xl font-semibold tracking-[-0.02em]">Gilayon</p>
              <p className="text-sm text-muted">HMO-Clinic digital records</p>
            </div>
          </div>
          <h1 className="mt-5 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em]">{t('Sign in to the clinic')}</h1>
          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-full border border-line bg-surface p-1.5" role="tablist">
            {(['doctor', 'desk', 'nurse'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                onClick={() => {
                  setRole(r)
                  setStaffId(data.staff.find((s) => s.role === r && s.active !== false)?.staff_id ?? '')
                }}
                className={cn('h-11 rounded-full text-[15px] font-semibold transition sm:text-[16px]', role === r ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-mist')}
              >
                {t(r === 'doctor' ? 'Doctor' : r === 'nurse' ? 'Nurse' : 'Receptionist')}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[15px] font-medium text-ink-2">{t('Account')}</p>
          <div className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1 py-0.5">
            {accounts.map((a) => (
              <button
                key={a.staff_id}
                type="button"
                onClick={() => setStaffId(a.staff_id)}
                className={cn('flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition', staffId === a.staff_id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line bg-surface hover:border-brand-200')}
              >
                <Avatar name={a.name} size="sm" />
                <span className="flex-1">
                  <span className="block text-base font-semibold">{a.name}</span>
                  <span className="block text-sm text-muted">
                    {a.title}
                    {a.room ? ` · ${a.room}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Field label={t('Password')} htmlFor="pw" error={error || undefined} className="mt-4">
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-lg" autoComplete="current-password" />
          </Field>
          <Button type="submit" size="lg" className="mt-4 h-13 text-lg" iconRight={<ArrowRight size={20} weight="bold" />}>
            Sign in
          </Button>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <LockKey size={16} className="shrink-0" /> {data.demo ? 'Demo accounts are filled in. ' : ''}Sign-in details are kept apart from license numbers.
          </p>
        </form>
        <div className="flex flex-col items-center gap-2 border-t border-line pt-3 text-sm text-muted sm:flex-row sm:justify-between">
          <a href="/waiting" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-medium text-ink-2 hover:text-brand-700 sm:hidden">
            <Monitor size={18} /> Open the waiting screen (no sign-in)
          </a>
          <p className="hidden sm:block">{t('Records are handled under the Data Privacy Act.')}</p>
          <LegalLinks linkClassName="font-medium text-brand-700" />
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand-600 p-14 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgb(143_176_255/0.5)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative max-w-md">
          <p className="text-3xl font-light leading-tight tracking-[-0.02em]">
            Verified check-in, a fair queue, <span className="font-semibold">signed documents and a report that builds itself.</span>
          </p>
          <ul className="mt-8 space-y-3 text-lg text-brand-100">
            <li>{t('Runs on the clinic\'s own computers')}</li>
            <li>{t('Keeps working with no internet')}</li>
            <li>{t('Every action is written to the audit trail')}</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
