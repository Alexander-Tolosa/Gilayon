import { ArrowLeft, ArrowRight, CheckCircle, Eye, EyeSlash, LockKey, Monitor, WarningCircle } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../../shared/components/Logo'
import { LegalLinks } from '../../../shared/components/Legal'
import { Avatar, Button, Input } from '../../../shared/components/ui'
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
  const [show, setShow] = useState(false)

  if (me) return <Navigate to="/clinic" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Enter your password.')
    const failure = await signIn(staffId, password)
    if (failure) return setError(failure)
    navigate(role === 'doctor' ? '/clinic/doctor' : '/clinic/checkin')
  }

  const roleName = (r: StaffRole) => t(r === 'doctor' ? 'Doctor' : r === 'nurse' ? 'Nurse' : 'Receptionist')
  const step = 'mb-3 text-xl font-semibold text-ink'

  return (
    <div className="min-h-[100dvh] bg-canvas px-5 py-4 sm:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-lg font-medium text-ink-2 hover:bg-mist">
            <ArrowLeft size={22} /> {t('Back')}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch showNames />
            <StatusBadge />
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col py-6">
          <div className="flex items-center gap-3">
            <LogoMark className="size-12 rounded-2xl" />
            <div className="leading-tight">
              <p className="text-2xl font-semibold tracking-[-0.02em]">Gilayon</p>
              <p className="text-base text-ink-2">HMO-Clinic digital records</p>
            </div>
          </div>
          <h1 className="mb-6 mt-5 text-[2rem] font-semibold leading-tight tracking-[-0.03em]">{t('Sign in to the clinic')}</h1>

          {/* Two columns on a wide screen so nothing needs scrolling: who you are on the left, the password on the right. */}
          <div className="grid gap-x-12 lg:grid-cols-2">
          <div>
          <p className={step}>1. {t('I am a')}</p>
          <div className="mb-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-3" role="radiogroup" aria-label={t('I am a')}>
            {(['doctor', 'desk', 'nurse'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => {
                  setRole(r)
                  setStaffId(data.staff.find((x) => x.role === r && x.active !== false)?.staff_id ?? '')
                }}
                className={cn('relative flex min-h-16 items-center justify-center rounded-2xl border-2 px-4 py-2 text-center text-lg font-semibold leading-tight transition', role === r ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-surface text-ink hover:border-brand-300')}
              >
                {role === r && <CheckCircle size={18} weight="fill" aria-hidden className="absolute right-1.5 top-1.5" />}
                {roleName(r)}
              </button>
            ))}
          </div>

          <p className={step}>2. {t('Who is signing in?')}</p>
          <div role="radiogroup" aria-label={t('Account')} className="mb-6 flex flex-col gap-3">
            {accounts.map((a) => {
              const on = staffId === a.staff_id
              return (
                <button
                  key={a.staff_id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStaffId(a.staff_id)}
                  className={cn('flex min-h-[4.5rem] items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition', on ? 'border-brand-600 bg-brand-50' : 'border-line-strong bg-surface hover:border-brand-300')}
                >
                  <Avatar name={a.name} size="md" />
                  <span className="flex-1">
                    <span className="block text-xl font-semibold">{a.name}</span>
                    <span className="block text-base text-ink-2">
                      {a.title}
                      {a.room ? ` · ${a.room}` : ''}
                    </span>
                  </span>
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border-2', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong')}>{on && <CheckCircle size={22} weight="fill" aria-hidden />}</span>
                </button>
              )
            })}
          </div>

          </div>
          <div>
          <label htmlFor="pw" className={cn(step, "block")}>
            3. {t('Password')}
          </label>
          <div className="relative">
            <Input
              id="pw"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => (setPassword(e.target.value), setError(''))}
              className="h-16 pr-28 text-xl"
              autoComplete="current-password"
              aria-describedby={error ? 'pw-error' : undefined}
              invalid={!!error}
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="absolute right-2 top-1/2 inline-flex min-h-12 -translate-y-1/2 items-center gap-2 rounded-full px-4 text-lg font-semibold text-brand-700 hover:bg-brand-50">
              {show ? <EyeSlash size={22} /> : <Eye size={22} />}
              {show ? t('Hide') : t('Show')}
            </button>
          </div>
          {error && (
            <p id="pw-error" role="alert" className="mt-2 flex items-start gap-2 text-lg font-medium text-danger">
              <WarningCircle size={22} weight="fill" className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-6 h-16 w-full text-xl shadow-none" iconRight={<ArrowRight size={24} weight="bold" />}>
            {t('Sign in')}
          </Button>
          {data.demo && (
            <p className="mt-3 flex items-start gap-2 text-base text-ink-2">
              <LockKey size={20} className="mt-0.5 shrink-0" /> Demo accounts are filled in. Sign-in details are kept apart from license numbers.
            </p>
          )}
          </div>
          </div>
        </form>
        <div className="flex flex-col gap-3 border-t border-line pt-4 text-base text-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <a href="/waiting" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 font-medium text-brand-700 hover:underline">
            <Monitor size={22} /> {t('Waiting screen')} <span className="text-ink-2">(no sign-in)</span>
          </a>
          <LegalLinks linkClassName="font-medium text-brand-700" />
        </div>
      </div>
    </div>
  )
}
