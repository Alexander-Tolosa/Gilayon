import { ArrowLeft, ArrowRight, CheckCircle, LockKey, ShieldCheck } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../../shared/components/Logo'
import { Avatar } from '../../shared/components/ui'
import { img, PHOTOS } from '../../shared/lib/utils'

const ROLE_CARDS: { role: 'doctor' | 'desk' | 'nurse'; title: string; body: string; photo: string }[] = [
  { role: 'doctor', title: "I'm a doctor", body: 'Consultations, signed prescriptions, diagnostic orders and reports', photo: img.unsplash(PHOTOS.drMale, 200, 200) },
  { role: 'desk', title: "I'm a receptionist", body: 'Patient check-in, identity verification, priority queue and records', photo: img.portrait('women', 44) },
  { role: 'nurse', title: "I'm a nurse", body: 'Vital signs, patient triage, queue monitoring and care coordination', photo: img.unsplash(PHOTOS.nurse, 200, 200) },
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
    <div className="grid grid-cols-1 min-h-[100dvh] bg-surface lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-mist hover:text-ink">
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10">
          <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">
              {params.get('mode') === 'signin' ? 'Welcome back.' : 'Welcome to Gilayon.'}
              <br />
              <span className="font-light text-muted">Which one are you?</span>
            </h1>
            <div className="mt-10 flex flex-col gap-3">
              {ROLE_CARDS.map((c) => (
                <button
                  key={c.role}
                  onClick={() => navigate(`/clinic/login?role=${c.role}`)}
                  className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft active:scale-[0.99] sm:p-5"
                >
                  <Avatar name={c.title} src={c.photo} size="lg" className="ring-4 ring-brand-50" />
                  <span className="flex-1">
                    <span className="block text-[17px] font-semibold tracking-tight text-ink">{c.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{c.body}</span>
                  </span>
                  <span className="grid size-10 place-items-center rounded-full bg-mist text-ink-2 transition group-hover:bg-brand-600 group-hover:text-white">
                    <ArrowRight size={16} weight="bold" />
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        <p className="flex items-center gap-2 text-xs text-faint">
          <LockKey size={14} /> Encrypted connection. Prototype with sample data only.
        </p>
      </div>

      <AsidePanel />
    </div>
  )
}

function AsidePanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-950 lg:block">
      <img src={img.unsplash(PHOTOS.stethoscopeBlue, 1400, 1800)} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/40 to-brand-900/10" />
      <div className="absolute inset-x-10 bottom-10 xl:inset-x-14 xl:bottom-14">
        <div className="glass max-w-md rounded-3xl p-6 text-ink">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
            <ShieldCheck size={18} weight="fill" /> Your record stays private
          </div>
          <ul className="mt-4 space-y-3 text-[14px] text-ink-2">
            {['Only your care team can open clinical notes', 'Every view of your record is logged', 'Encrypted at rest and in transit'].map((t) => (
              <li key={t} className="flex gap-2.5">
                <CheckCircle size={18} weight="fill" className="shrink-0 text-brand-600" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 max-w-md text-3xl font-light leading-tight tracking-[-0.03em] text-white">
          One record for every visit, <span className="font-semibold">from intake to follow-up.</span>
        </p>
      </div>
    </aside>
  )
}
