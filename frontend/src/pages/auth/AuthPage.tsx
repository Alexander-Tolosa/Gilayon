import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  IdentificationCard,
  LockKey,
  Plus,
  ShieldCheck,
  Trash,
  UserCirclePlus,
  UserFocus,
  VideoCamera,
  Buildings,
  Sparkle,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Avatar, Badge, Button, Chip, Field, Input, Select, Textarea } from '../../components/ui'
import { COMMON_ALLERGIES, COMMON_CONDITIONS } from '../../data/clinical'
import { DOCTORS, STAFF } from '../../data/seed'
import type { IntakeInput, Patient, Role } from '../../data/types'
import { cn, dayOffset, fmtDate, fmtTime, img, PHOTOS } from '../../lib/utils'
import { useStore } from '../../store/store'

type Step = 'role' | 'existing' | 'signin' | 'intake' | 'done'

const ROLE_CARDS: { role: Role; title: string; body: string; photo: string }[] = [
  { role: 'secretary', title: "I'm front desk staff", body: 'Check-in, verification, queue and patient records', photo: img.portrait('women', 44) },
  { role: 'doctor', title: "I'm a doctor", body: 'Consultations, signed prescriptions and certificates, reports', photo: img.unsplash(PHOTOS.drMale, 200, 200) },
  { role: 'patient', title: "I'm a patient", body: 'Patient portal (extra): records, visits and messages', photo: img.portrait('women', 68) },
]

function Slide({ children, k }: { children: ReactNode; k: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      key={k}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export default function AuthPage() {
  const [params] = useSearchParams()
  const initialRole = (params.get('role') as Role | null) ?? null
  const startStep: Step = initialRole === 'patient' ? (params.get('new') ? 'intake' : 'existing') : initialRole ? 'signin' : 'role'
  const [step, setStep] = useState<Step>(startStep)
  const [role, setRole] = useState<Role>(initialRole ?? 'patient')
  const [created, setCreated] = useState<Patient | null>(null)
  const navigate = useNavigate()
  // Clinic staff sign in to the Himsog clinic app.
  if (initialRole === 'secretary' || initialRole === 'doctor') return <Navigate to={`/clinic/login?role=${initialRole === 'doctor' ? 'doctor' : 'desk'}`} replace />

  const back = () => {
    if (step === 'role') return navigate('/')
    if (step === 'existing') return setStep('role')
    if (step === 'signin') return setStep(role === 'patient' ? 'existing' : 'role')
    if (step === 'intake') return setStep('existing')
  }

  return (
    <div className="grid grid-cols-1 min-h-[100dvh] bg-surface lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Logo />
          {step !== 'done' && (
            <button onClick={back} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-mist hover:text-ink">
              <ArrowLeft size={16} /> Back
            </button>
          )}
        </div>

        <div className={cn('mx-auto flex w-full flex-1 flex-col justify-center py-10', step === 'intake' ? 'max-w-2xl' : 'max-w-lg')}>
          <AnimatePresence mode="wait">
            {step === 'role' && (
              <Slide k="role">
                <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">
                  {params.get('mode') === 'signin' ? 'Welcome back.' : 'Welcome to Himsog.'}
                  <br />
                  <span className="font-light text-muted">Which one are you?</span>
                </h1>
                <div className="mt-10 flex flex-col gap-3">
                  {ROLE_CARDS.map((c) => (
                    <button
                      key={c.role}
                      onClick={() => {
                        if (c.role !== 'patient') return navigate(`/clinic/login?role=${c.role === 'doctor' ? 'doctor' : 'desk'}`)
                        setRole(c.role)
                        setStep('existing')
                      }}
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
              </Slide>
            )}

            {step === 'existing' && (
              <Slide k="existing">
                <Badge tone="brand" icon={<UserFocus size={12} weight="fill" />}>Patient</Badge>
                <h1 className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">
                  Are you an existing patient?
                </h1>
                <p className="mt-3 text-[15px] text-muted">If you have visited us before, your record is already here.</p>
                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button onClick={() => setStep('signin')} className="group flex flex-col items-start rounded-3xl border border-line p-6 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft">
                    <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                      <IdentificationCard size={24} />
                    </span>
                    <span className="mt-8 text-lg font-semibold tracking-tight">Yes, I've been here</span>
                    <span className="mt-1 text-sm text-muted">Sign in to see my record</span>
                  </button>
                  <button onClick={() => setStep('intake')} className="group flex flex-col items-start rounded-3xl border border-brand-600 bg-brand-600 p-6 text-left text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-brand-700">
                    <span className="grid size-12 place-items-center rounded-2xl bg-white/15">
                      <UserCirclePlus size={24} />
                    </span>
                    <span className="mt-8 text-lg font-semibold tracking-tight">No, I'm new</span>
                    <span className="mt-1 text-sm text-brand-100">Create my record in 3 minutes</span>
                  </button>
                </div>
              </Slide>
            )}

            {step === 'signin' && (
              <Slide k={`signin-${role}`}>
                <SignIn role={role} onNewPatient={() => setStep('intake')} />
              </Slide>
            )}

            {step === 'intake' && (
              <Slide k="intake">
                <Intake
                  onDone={(p) => {
                    setCreated(p)
                    setStep('done')
                  }}
                />
              </Slide>
            )}

            {step === 'done' && created && (
              <Slide k="done">
                <Done patient={created} />
              </Slide>
            )}
          </AnimatePresence>
        </div>

        <p className="flex items-center gap-2 text-xs text-faint">
          <LockKey size={14} /> Encrypted connection. Prototype with sample data only.
        </p>
      </div>

      <AsidePanel step={step} />
    </div>
  )
}

function AsidePanel({ step }: { step: Step }) {
  const isIntake = step === 'intake' || step === 'done'
  return (
    <aside className="relative hidden overflow-hidden bg-brand-950 lg:block">
      <img src={img.unsplash(isIntake ? PHOTOS.stethoscopeWhite : PHOTOS.stethoscopeBlue, 1400, 1800)} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
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

/* --------------------------------- Sign in --------------------------------- */

function SignIn({ role, onNewPatient }: { role: Role; onNewPatient: () => void }) {
  const { patients, signIn } = useStore()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState(role === 'patient' ? 'andrea.v@mail.com' : role === 'secretary' ? STAFF[0].email : '')
  const [doctorId, setDoctorId] = useState('d1')
  const [password, setPassword] = useState('demo-password')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const titles: Record<Role, { title: string; sub: string; badge: string }> = {
    patient: { title: 'Sign in to your record', sub: 'Use your email or Patient ID (for example RC-10482).', badge: 'Patient' },
    secretary: { title: 'Front desk sign in', sub: 'Access the patient inventory, schedule and billing.', badge: 'Clinic staff' },
    doctor: { title: 'Doctor sign in', sub: 'Your consultation queue and charting workspace.', badge: 'Doctor' },
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!password) return setError('Enter your password.')
    let target: { role: Role; id: string; to: string } | null = null
    if (role === 'patient') {
      const q = identifier.trim().toLowerCase()
      const p = patients.find((x) => x.email.toLowerCase() === q || x.id.toLowerCase() === q)
      if (!p) return setError("We couldn't find a record with that email or Patient ID.")
      target = { role, id: p.id, to: '/patient' }
    } else if (role === 'secretary') {
      if (!identifier.includes('@')) return setError('Enter your work email.')
      target = { role, id: 's1', to: '/staff' }
    } else {
      target = { role, id: doctorId, to: '/doctor' }
    }
    setLoading(true)
    setTimeout(() => {
      signIn(target!.role, target!.id)
      navigate(target!.to)
    }, 450)
  }

  const t = titles[role]
  return (
    <form onSubmit={submit} noValidate>
      <Badge tone="brand">{t.badge}</Badge>
      <h1 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.035em]">{t.title}</h1>
      <p className="mt-2 text-[15px] text-muted">{t.sub}</p>

      <div className="mt-8 flex flex-col gap-5">
        {role === 'doctor' ? (
          <Field label="Doctor account" htmlFor="doc">
            <Select id="doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {DOCTORS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.specialty}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={role === 'patient' ? 'Email or Patient ID' : 'Work email'} htmlFor="id" error={error && error.includes('find') ? error : undefined}>
            <Input id="id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" invalid={!!error && error.includes('find')} />
          </Field>
        )}
        <Field label="Password" htmlFor="pw" error={error === 'Enter your password.' ? error : undefined}>
          <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && !error.includes('find') && error !== 'Enter your password.' && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" disabled={loading} iconRight={!loading && <ArrowRight size={16} weight="bold" />}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>

      <div className="mt-6 rounded-2xl bg-mist p-4 text-[13px] text-ink-2">
        <span className="font-semibold text-brand-700">Demo:</span> credentials are filled in for you.{' '}
        {role === 'patient' && (
          <>
            New here?{' '}
            <button type="button" onClick={onNewPatient} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
              Create a patient record
            </button>
          </>
        )}
      </div>
    </form>
  )
}

/* ------------------------------ New-patient intake ------------------------- */

const STEPS = ['About you', 'Consultation', 'History', 'Medicines', 'Review'] as const
const REASONS = ['General check-up', 'Fever or cough', 'Follow-up on a condition', 'Medication refill', 'Lab result review']
const TIMES = ['09:00', '10:30', '11:30', '13:30', '15:00', '16:00']

type MedRow = { name: string; dose: string; frequency: string; prescribedBy: string }

function Intake({ onDone }: { onDone: (p: Patient) => void }) {
  const { registerPatient } = useStore()
  const [i, setI] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: '' as '' | Patient['sex'],
    phone: '',
    email: '',
    reason: '',
    doctorId: 'any',
    date: dayOffset(1),
    time: '10:30',
    mode: 'In-person' as IntakeInput['mode'],
    hasHistory: null as null | boolean,
    conditions: [] as string[],
    otherCondition: '',
    allergies: [] as string[],
    otherAllergy: '',
    takesMeds: null as null | boolean,
    meds: [{ name: '', dose: '', frequency: '', prescribedBy: '' }] as MedRow[],
    consent: false,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const toggle = (k: 'conditions' | 'allergies', v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v])

  const dates = useMemo(() => Array.from({ length: 7 }, (_, n) => dayOffset(n + 1)), [])

  const validate = (step: number) => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (form.name.trim().split(' ').filter(Boolean).length < 2) e.name = 'Enter your first and last name.'
      const age = Number(form.age)
      if (!form.age || Number.isNaN(age) || age < 0 || age > 120) e.age = 'Enter an age between 0 and 120.'
      if (!form.sex) e.sex = 'Choose one option.'
      if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a mobile number we can text reminders to.'
      if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address.'
    }
    if (step === 1 && form.reason.trim().length < 4) e.reason = 'Tell us briefly why you are consulting.'
    if (step === 2) {
      if (form.hasHistory === null) e.hasHistory = 'Choose yes or no.'
      if (form.hasHistory && !form.conditions.length && !form.otherCondition.trim()) e.conditions = 'Pick at least one condition or type it below.'
    }
    if (step === 3) {
      if (form.takesMeds === null) e.takesMeds = 'Choose yes or no.'
      if (form.takesMeds && !form.meds.some((m) => m.name.trim())) e.meds = 'Add at least one medicine name.'
    }
    if (step === 4 && !form.consent) e.consent = 'Please agree so we can store your record.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    if (!validate(i)) return
    if (i < STEPS.length - 1) return setI(i + 1)
    const doctorId = form.doctorId === 'any' ? 'd2' : form.doctorId
    const p = registerPatient({
      name: form.name,
      age: Number(form.age),
      sex: form.sex as Patient['sex'],
      phone: form.phone,
      email: form.email,
      reason: form.reason,
      doctorId,
      preferredDate: form.date,
      preferredTime: form.time,
      mode: form.mode,
      conditions: form.hasHistory ? [...form.conditions, ...(form.otherCondition.trim() ? [form.otherCondition.trim()] : [])] : [],
      allergies: [...form.allergies, ...(form.otherAllergy.trim() ? [form.otherAllergy.trim()] : [])],
      medications: form.takesMeds ? form.meds : [],
    })
    onDone(p)
  }

  const doctor = DOCTORS.find((d) => d.id === form.doctorId)

  return (
    <div>
      <Badge tone="brand" icon={<Sparkle size={12} weight="fill" />}>New patient record</Badge>
      <h1 className="mt-4 text-[30px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">{['Tell us about yourself', 'Why are you consulting?', 'Your medical history', 'Your current medicines', 'Check your details'][i]}</h1>

      {/* Progress */}
      <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label="Progress">
        {STEPS.map((s, n) => (
          <li key={s} className="flex flex-col gap-2">
            <span className={cn('h-1.5 rounded-full transition-colors duration-500', n <= i ? 'bg-brand-600' : 'bg-line')} />
            <span className={cn('hidden text-xs sm:block', n === i ? 'font-semibold text-brand-700' : 'text-faint')}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        {i === 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Carmen Dela Rosa" autoComplete="name" invalid={!!errors.name} />
            </Field>
            <Field label="Age" htmlFor="age" error={errors.age}>
              <Input id="age" inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="34" invalid={!!errors.age} />
            </Field>
            <Field label="Sex" error={errors.sex}>
              <div className="flex gap-2">
                {(['Female', 'Male', 'Other'] as const).map((s) => (
                  <Chip key={s} selected={form.sex === s} onClick={() => set('sex', s)} className="flex-1 justify-center">
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="For appointment reminders by text">
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1 (312) 555-0144" autoComplete="tel" invalid={!!errors.phone} />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email} hint="You'll use this to sign in">
              <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" autoComplete="email" invalid={!!errors.email} />
            </Field>
          </div>
        )}

        {i === 1 && (
          <div className="flex flex-col gap-6">
            <Field label="Reason for consultation" htmlFor="reason" error={errors.reason}>
              <div className="mb-1 flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <Chip key={r} selected={form.reason === r} onClick={() => set('reason', r)}>
                    {r}
                  </Chip>
                ))}
              </div>
              <Textarea id="reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Describe your symptoms or what you need help with" />
            </Field>
            <Field label="Who's your doctor?">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => set('doctorId', 'any')} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition', form.doctorId === 'any' ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:border-brand-200')}>
                  <span className="grid size-11 place-items-center rounded-full bg-brand-100 text-brand-700"><Buildings size={20} /></span>
                  <span>
                    <span className="block text-sm font-semibold">First available</span>
                    <span className="block text-xs text-muted">We'll match you</span>
                  </span>
                </button>
                {DOCTORS.map((d) => (
                  <button key={d.id} type="button" onClick={() => set('doctorId', d.id)} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition', form.doctorId === d.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:border-brand-200')}>
                    <Avatar name={d.name} src={d.photo} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{d.name}</span>
                      <span className="block truncate text-xs text-muted">{d.specialty}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Preferred date">
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {dates.map((d) => (
                  <button key={d} type="button" onClick={() => set('date', d)} className={cn('flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition', form.date === d ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-200')}>
                    <span className={cn('text-[11px]', form.date === d ? 'text-brand-100' : 'text-muted')}>{fmtDate(d, { weekday: 'short' })}</span>
                    <span className="text-lg font-semibold tabular">{fmtDate(d, { day: 'numeric' })}</span>
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto]">
              <Field label="Preferred time">
                <div className="flex flex-wrap gap-2">
                  {TIMES.map((t) => (
                    <Chip key={t} selected={form.time === t} onClick={() => set('time', t)}>
                      <Clock size={14} /> {fmtTime(t)}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Visit type">
                <div className="flex gap-2">
                  <Chip selected={form.mode === 'In-person'} onClick={() => set('mode', 'In-person')}>
                    <Buildings size={14} /> In clinic
                  </Chip>
                  <Chip selected={form.mode === 'Telehealth'} onClick={() => set('mode', 'Telehealth')}>
                    <VideoCamera size={14} /> Video
                  </Chip>
                </div>
              </Field>
            </div>
          </div>
        )}

        {i === 2 && (
          <div className="flex flex-col gap-6">
            <Field label="Do you have a history of any disease?" error={errors.hasHistory}>
              <YesNo value={form.hasHistory} onChange={(v) => set('hasHistory', v)} />
            </Field>
            {form.hasHistory && (
              <Field label="Select all that apply" error={errors.conditions}>
                <div className="flex flex-wrap gap-2">
                  {COMMON_CONDITIONS.map((c) => (
                    <Chip key={c} selected={form.conditions.includes(c)} onClick={() => toggle('conditions', c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
                <Input className="mt-2" value={form.otherCondition} onChange={(e) => set('otherCondition', e.target.value)} placeholder="Something else? Type it here" aria-label="Other condition" />
              </Field>
            )}
            <Field label="Allergies" hint="Medicines, food or materials. Leave empty if none.">
              <div className="flex flex-wrap gap-2">
                {COMMON_ALLERGIES.map((c) => (
                  <Chip key={c} selected={form.allergies.includes(c)} onClick={() => toggle('allergies', c)}>
                    {c}
                  </Chip>
                ))}
              </div>
              <Input className="mt-2" value={form.otherAllergy} onChange={(e) => set('otherAllergy', e.target.value)} placeholder="Other allergy" aria-label="Other allergy" />
            </Field>
          </div>
        )}

        {i === 3 && (
          <div className="flex flex-col gap-6">
            <Field label="Do you take any medicine, or has a doctor prescribed one to you?" error={errors.takesMeds}>
              <YesNo value={form.takesMeds} onChange={(v) => set('takesMeds', v)} />
            </Field>
            {form.takesMeds && (
              <div className="flex flex-col gap-3">
                {form.meds.map((m, n) => (
                  <div key={n} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-canvas p-4 sm:grid-cols-2">
                    <Field label="Medicine" htmlFor={`mn${n}`} error={n === 0 ? errors.meds : undefined}>
                      <Input id={`mn${n}`} value={m.name} onChange={(e) => set('meds', form.meds.map((x, j) => (j === n ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Metformin" />
                    </Field>
                    <Field label="Dose" htmlFor={`md${n}`} optional>
                      <Input id={`md${n}`} value={m.dose} onChange={(e) => set('meds', form.meds.map((x, j) => (j === n ? { ...x, dose: e.target.value } : x)))} placeholder="500 mg" />
                    </Field>
                    <Field label="How often" htmlFor={`mf${n}`} optional>
                      <Input id={`mf${n}`} value={m.frequency} onChange={(e) => set('meds', form.meds.map((x, j) => (j === n ? { ...x, frequency: e.target.value } : x)))} placeholder="Twice a day" />
                    </Field>
                    <Field label="Prescribed by" htmlFor={`mp${n}`} optional>
                      <div className="flex gap-2">
                        <Input id={`mp${n}`} value={m.prescribedBy} onChange={(e) => set('meds', form.meds.map((x, j) => (j === n ? { ...x, prescribedBy: e.target.value } : x)))} placeholder="Doctor's name or 'self'" />
                        {form.meds.length > 1 && (
                          <button type="button" aria-label="Remove medicine" onClick={() => set('meds', form.meds.filter((_, j) => j !== n))} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted hover:text-danger">
                            <Trash size={16} />
                          </button>
                        )}
                      </div>
                    </Field>
                  </div>
                ))}
                <Button type="button" variant="soft" size="sm" className="self-start" icon={<Plus size={14} weight="bold" />} onClick={() => set('meds', [...form.meds, { name: '', dose: '', frequency: '', prescribedBy: '' }])}>
                  Add another medicine
                </Button>
              </div>
            )}
          </div>
        )}

        {i === 4 && (
          <div className="flex flex-col gap-3">
            <ReviewBlock title="About you" onEdit={() => setI(0)}>
              {form.name} · {form.age} years · {form.sex}
              <br />
              {form.phone} · {form.email}
            </ReviewBlock>
            <ReviewBlock title="Consultation" onEdit={() => setI(1)}>
              {form.reason}
              <br />
              {doctor ? doctor.name : 'First available doctor'} · {fmtDate(form.date, { weekday: 'short', month: 'short', day: 'numeric' })} at {fmtTime(form.time)} · {form.mode === 'Telehealth' ? 'Video' : 'In clinic'}
            </ReviewBlock>
            <ReviewBlock title="History and allergies" onEdit={() => setI(2)}>
              {form.hasHistory ? [...form.conditions, form.otherCondition].filter(Boolean).join(', ') : 'No history of disease'}
              <br />
              Allergies: {[...form.allergies, form.otherAllergy].filter(Boolean).join(', ') || 'None reported'}
            </ReviewBlock>
            <ReviewBlock title="Medicines" onEdit={() => setI(3)}>
              {form.takesMeds
                ? form.meds.filter((m) => m.name).map((m) => `${m.name} ${m.dose}`.trim() + (m.prescribedBy ? ` (by ${m.prescribedBy})` : '')).join(', ')
                : 'No current medicines'}
            </ReviewBlock>
            <label className={cn('mt-2 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm', errors.consent ? 'border-danger bg-danger-soft' : 'border-line')}>
              <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
              <span className="text-ink-2">I agree that Himsog stores my health information securely and shares it only with my care team.</span>
            </label>
            {errors.consent && <p className="text-xs font-medium text-danger">{errors.consent}</p>}
          </div>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)} icon={<ArrowLeft size={16} />}>
          Previous
        </Button>
        <Button type="button" size="lg" onClick={next} iconRight={<ArrowRight size={16} weight="bold" />}>
          {i === STEPS.length - 1 ? 'Create my record' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid max-w-sm grid-cols-2 gap-2">
      {[true, false].map((v) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} aria-pressed={value === v} className={cn('h-12 rounded-2xl border text-sm font-semibold transition', value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong text-ink-2 hover:border-brand-300')}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  )
}

function ReviewBlock({ title, children, onEdit }: { title: string; children: ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-canvas p-4">
      <div>
        <p className="text-xs font-medium text-muted">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{children}</p>
      </div>
      <button type="button" onClick={onEdit} className="text-sm font-semibold text-brand-700 hover:underline">
        Edit
      </button>
    </div>
  )
}

function Done({ patient }: { patient: Patient }) {
  const navigate = useNavigate()
  const { appointments } = useStore()
  const appt = appointments.find((a) => a.patientId === patient.id)
  const doctor = DOCTORS.find((d) => d.id === patient.doctorId)
  return (
    <div className="text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative mx-auto grid size-20 place-items-center rounded-full bg-brand-600 text-white shadow-brand">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-400" />
        <CheckCircle size={40} weight="fill" className="relative" />
      </motion.div>
      <h1 className="mt-8 text-[32px] font-semibold tracking-[-0.035em]">Your record is ready, {patient.name.split(' ')[0]}.</h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">We've added you to the patient inventory and sent your consultation request to the front desk.</p>
      <div className="mx-auto mt-8 max-w-sm rounded-3xl border border-line p-5 text-left">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Patient ID</span>
          <span className="font-mono text-lg font-semibold text-brand-700">{patient.id}</span>
        </div>
        {appt && (
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <Avatar name={doctor?.name ?? 'Doctor'} src={doctor?.photo} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{doctor?.name}</p>
              <p className="text-xs text-muted">
                {fmtDate(appt.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(appt.time)}
              </p>
            </div>
            <Badge tone="warn">Awaiting confirmation</Badge>
          </div>
        )}
      </div>
      <Button size="lg" className="mt-8" onClick={() => navigate('/patient')} iconRight={<ArrowRight size={16} weight="bold" />}>
        Go to my dashboard
      </Button>
    </div>
  )
}
