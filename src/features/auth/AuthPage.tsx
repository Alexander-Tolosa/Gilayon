import { ArrowLeft, ArrowRight, CheckCircle, FirstAid, LockKey, Stethoscope, UserCirclePlus } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LegalLinks } from '../../shared/components/Legal'
import { Logo } from '../../shared/components/Logo'

// Nurse and receptionist have the same access in the concept document, so they share one description.
const DESK_AND_NURSE = 'Register patients or pull old folders, set the priority and queue number, update records and attach scans.'

const ROLE_CARDS: { role: 'doctor' | 'desk' | 'nurse'; title: string; body: string; icon: Icon }[] = [
  { role: 'doctor', title: "I'm a doctor", body: 'Consultations, prescriptions and certificates signed with your PIN, the census and the audit trail.', icon: Stethoscope },
  { role: 'desk', title: "I'm a receptionist", body: DESK_AND_NURSE, icon: UserCirclePlus },
  { role: 'nurse', title: "I'm a nurse", body: DESK_AND_NURSE, icon: FirstAid },
]

export default function AuthPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const initialRole = params.get('role')
  // Clinic staff sign in to the Gilayon clinic app.
  if (initialRole === 'secretary' || initialRole === 'desk' || initialRole === 'receptionist' || initialRole === 'doctor' || initialRole === 'nurse') {
    const target = initialRole === 'doctor' ? 'doctor' : initialRole === 'nurse' ? 'nurse' : 'desk'
    return <Navigate to={`/clinic/login?role=${target}`} replace />
  }

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 bg-canvas lg:h-[100dvh] lg:grid-cols-[0.85fr_1.15fr]">
      <AsidePanel />

      <div className="flex min-h-0 flex-col px-5 py-5 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-brand-300 hover:text-brand-700">
            <ArrowLeft size={16} /> Back to home
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-8">
          <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <p className="text-sm font-semibold text-brand-700">{params.get('mode') === 'signin' ? 'Welcome back' : 'Welcome to Gilayon'}</p>
            <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[38px]">Which one are you?</h1>
            <p className="mt-2 text-[15px] text-ink-2">Pick your role to see your accounts. You can switch roles on the next screen.</p>
            <div className="mt-7 flex flex-col gap-3">
              {ROLE_CARDS.map((c) => (
                <button
                  key={c.role}
                  onClick={() => navigate(`/clinic/login?role=${c.role}`)}
                  className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift active:scale-[0.99] sm:p-5"
                >
                  <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                    <c.icon size={26} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold tracking-tight text-ink">{c.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted">{c.body}</span>
                  </span>
                  <ArrowRight size={18} weight="bold" className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted">
              Already know your account?{' '}
              <Link to="/clinic/login" className="font-semibold text-brand-700 hover:underline">
                Go straight to sign in
              </Link>
            </p>
          </motion.div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <LockKey size={14} /> Encrypted connection. Prototype with synthetic data only.
          </p>
          <LegalLinks linkClassName="font-medium text-brand-700" />
        </div>
      </div>
    </div>
  )
}

function AsidePanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-600 px-12 py-10 text-white lg:flex lg:flex-col xl:px-14">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgb(255_255_255/0.5)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative">
        <Logo light markClassName="rounded-lg ring-2 ring-white/70" />
      </div>
      <div className="relative my-auto max-w-md">
        <p className="text-[34px] font-semibold leading-tight tracking-[-0.03em]">One record for every visit, from check-in to signed documents.</p>
        <ul className="mt-8 space-y-3.5 text-[16px] text-brand-50">
          {['Only doctors open and sign consultation notes', 'Every view and change is written to the audit trail', "Records stay on the clinic's own server", 'Keeps working when the internet is down'].map((t) => (
            <li key={t} className="flex gap-3">
              <CheckCircle size={22} weight="fill" className="shrink-0 text-white" /> {t}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-sm text-brand-100">Iloilo Provincial Government · HMO-Clinic</p>
    </aside>
  )
}
