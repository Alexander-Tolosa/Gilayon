import {
  ArrowRight,
  CheckCircle,
  ClipboardText,
  CloudCheck,
  CursorClick,
  Desktop,
  FileText,
  Fingerprint,
  Flask,
  Heartbeat,
  Lightning,
  List,
  LockKey,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
  ThumbsUp,
  TreeStructure,
  UserCirclePlus,
  UsersThree,
  Wheelchair,
  WifiHigh,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../shared/components/Logo'
import { Reveal } from '../../shared/components/Reveal'
import { Drift, PopIn, RevealText, ScrollAway, ScrollProgress } from '../../shared/components/ScrollFx'
import { Badge, Button } from '../../shared/components/ui'
import { LegalModal, type LegalKind } from '../../shared/components/Legal'
import '@fontsource/allura'
import { cn } from '../../shared/lib/utils'

const YEAR = new Date().getFullYear()

/* ----------------------------------- Nav ----------------------------------- */

function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="glass sticky top-0 z-40 border-b border-line/60">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          {/* Sign in goes straight to the account form; Get started first asks which role you are. */}
          <Button to="/clinic/login" variant="secondary" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button to="/auth" size="sm" iconRight={<ArrowRight size={14} weight="bold" />}>
            Get started
          </Button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 sm:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={16} /> : <List size={16} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line bg-surface sm:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              <Link to="/clinic/login" onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[15px] font-medium text-brand-700 hover:bg-mist">
                Sign in
              </Link>
              <a href="#services" onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[15px] font-medium text-ink-2 hover:bg-mist">
                Services
              </a>
              <a href="#security" onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[15px] font-medium text-ink-2 hover:bg-mist">
                Security and privacy
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

/* ---------------------------------- Hero ----------------------------------- */

const ORBIT: { icon: ReactNode; className: string; delay: number }[] = [
  { icon: <Heartbeat size={30} />, className: 'left-[14%] top-[14%]', delay: 0 },
  { icon: <Pill size={30} />, className: 'left-[7%] top-[46%]', delay: 0.8 },
  { icon: <FileText size={30} />, className: 'left-[15%] top-[76%]', delay: 1.6 },
  { icon: <Stethoscope size={30} />, className: 'right-[14%] top-[14%]', delay: 0.4 },
  { icon: <Flask size={30} />, className: 'right-[7%] top-[46%]', delay: 1.2 },
  { icon: <Syringe size={30} />, className: 'right-[15%] top-[76%]', delay: 2 },
]

const HERO_POINTS = ['Works without internet', "Runs on the clinic's own computers", 'Front desk, nurse and doctor share one record']

function Hero() {
  const reduce = useReducedMotion()
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: [0.16, 1, 0.3, 1] as const } })
  return (
    <section id="hero" className="relative overflow-hidden scroll-mt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,#dce7ff_0%,rgba(245,248,254,0)_70%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-72px)] max-w-7xl flex-col items-center justify-center px-4 pb-16 pt-12 text-center sm:px-6 lg:pt-16">
        {/* Orbit ring + floating icons (desktop) */}
        <div className="pointer-events-none absolute inset-x-[4%] inset-y-[6%] hidden rounded-[50%] border border-brand-100 lg:block" aria-hidden />
        {ORBIT.map((o, i) => (
          <motion.div
            key={i}
            className={cn('absolute hidden lg:block', o.className)}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 200, damping: 18 }}
            aria-hidden
          >
            <Drift speed={[70, 130, 50, 110, 160, 80][i]}>
              <div className="grid size-[72px] animate-orbit place-items-center rounded-full bg-surface text-brand-500 shadow-[0_12px_32px_-12px_rgb(35_80_214/0.35)] ring-1 ring-brand-100" style={{ animationDelay: `${o.delay}s` }}>
                {o.icon}
              </div>
            </Drift>
          </motion.div>
        ))}

        <ScrollAway className="w-full">
        <motion.p {...rise(0)} className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-surface/80 px-4 py-1.5 text-[13px] font-semibold text-brand-700 shadow-soft">
          <Heartbeat size={16} weight="fill" className="text-brand-600" /> HMO-Clinic · Iloilo Provincial Government
        </motion.p>

        <motion.h1 {...rise(0.08)} className="mx-auto mt-7 max-w-[15ch] text-balance text-[42px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[76px]">
          Every health record, in one <span className="text-brand-600">secure</span> place.
        </motion.h1>

        <motion.p {...rise(0.16)} className="mx-auto mt-6 max-w-[600px] text-pretty text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          Gilayon replaces the HMO-Clinic's paper folders with one digital record for every IPG employee and dependent, plus a fair queue, signed documents and a daily report.
        </motion.p>

        <motion.ul {...rise(0.24)} className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {HERO_POINTS.map((p) => (
            <li key={p} className="flex items-center gap-1.5 text-[14px] font-medium text-ink-2">
              <CheckCircle size={18} weight="fill" className="text-ok" /> {p}
            </li>
          ))}
        </motion.ul>

        <motion.div {...rise(0.32)} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/auth" size="lg" iconRight={<ArrowRight size={16} weight="bold" />}>
            Get started
          </Button>
          <Button size="lg" variant="secondary" onClick={() => (document.getElementById('services') || document.getElementById('features'))?.scrollIntoView({ behavior: 'smooth' })}>
            View our services
          </Button>
        </motion.div>
        </ScrollAway>
      </div>
    </section>
  )
}

/* -------------------------------- Problem ---------------------------------- */

// The qualities the HMO-Clinic asked for in a good solution, and how Gilayon meets each one.
const QUALITIES: { icon: ReactNode; tone: string; t: string; d: string }[] = [
  { icon: <WifiHigh size={24} weight="bold" />, tone: 'bg-brand-600', t: 'Works offline', d: 'Notes and scans are saved on the PC when the internet drops, then sent once it is back.' },
  { icon: <TreeStructure size={24} weight="bold" />, tone: 'bg-ok', t: 'Office networking', d: 'Every computer in the clinic opens the same record over the office network.' },
  { icon: <Desktop size={24} weight="bold" />, tone: 'bg-warn', t: 'Uses existing devices', d: "Runs in the browser of the clinic's current computers. Nothing new to buy." },
  { icon: <CursorClick size={24} weight="bold" />, tone: 'bg-brand-600', t: 'Simple interface', d: 'Large text, big buttons and plain words for staff who are not technical.' },
  { icon: <Lightning size={24} weight="bold" />, tone: 'bg-ok', t: 'Minimal steps', d: 'Search, check in and open a patient in a few clicks, not a few minutes.' },
  { icon: <ThumbsUp size={24} weight="bold" />, tone: 'bg-warn', t: 'Practical', d: 'Built around the clinic\'s real day, from the first check-in to the daily report.' },
]

function Problem() {
  return (
    <section className="px-4 sm:px-6 lg:px-8">
      <Reveal>
        <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-mist">
          <div className="px-6 pb-10 pt-12 sm:px-12 sm:pt-16">
            <h2 className="max-w-3xl text-3xl font-normal leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl">
              <RevealText text="Paper folders get lost." /> <RevealText text="Your health story shouldn't." className="text-brand-600" delay={0.25} />
            </h2>
            <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
              Today every visit means writing by hand, filing folders on shelves and searching for them while the line grows. Gilayon keeps one standard record per patient, opened in seconds and ready before the consult.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6 lg:grid-cols-3">
            {QUALITIES.map((q, i) => (
              <Reveal key={q.t} delay={i * 0.06} className="h-full">
                <div className="flex h-full items-start gap-4 rounded-3xl bg-surface p-5 shadow-soft sm:p-6">
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-full text-white', q.tone)}>{q.icon}</span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-ink">{q.t}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{q.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* --------------------------------- Services -------------------------------- */

interface ServiceItem {
  id: string
  title: string
  subtitle: string
  badgeText: string
  badgeTone: 'brand' | 'ok' | 'solid'
  icon: ReactNode
  iconBg: string
  iconColor: string
  cardBorder: string
  benefits: Array<{
    title: string
    description: string
  }>
  actionLabel: string
  actionUrl: string
}

function Services() {
  const services: ServiceItem[] = [
    {
      id: 'medical',
      title: 'Medical consultations',
      subtitle: 'Check-ups and follow-up care with a doctor who has your full history on screen.',
      badgeText: 'Senior Priority',
      badgeTone: 'brand',
      icon: <Stethoscope size={30} weight="duotone" />,
      iconBg: 'bg-brand-50',
      iconColor: 'text-brand-600',
      cardBorder: 'border-brand-200/70',
      benefits: [
        {
          title: 'Seniors are called first',
          description: 'Patients aged 60 and up, pregnant patients and PWDs get a priority queue number.',
        },
        {
          title: 'Time to talk with your doctor',
          description: 'Bring up blood pressure, pain, regular medicines or any other concern.',
        },
        {
          title: 'Family can come with you',
          description: 'A relative or caregiver may join you inside the consultation room.',
        },
      ],
      actionLabel: 'Schedule doctor visit',
      actionUrl: '/auth',
    },
    {
      id: 'prescription',
      title: 'Prescriptions and medicines',
      subtitle: 'Printed, signed prescriptions that are easy to read and checked against your allergies.',
      badgeText: 'Safe Dosage',
      badgeTone: 'ok',
      icon: <Pill size={30} weight="duotone" />,
      iconBg: 'bg-ok-soft',
      iconColor: 'text-ok',
      cardBorder: 'border-emerald-200/70',
      benefits: [
        {
          title: 'Clear, printed instructions',
          description: 'Each medicine shows the dose and when to take it. No handwriting to decode.',
        },
        {
          title: 'Allergy check',
          description: 'Your doctor is warned if a medicine matches an allergy on your record.',
        },
        {
          title: 'Signed by your doctor',
          description: 'Every prescription carries the doctor\'s e-signature, license number and a document number.',
        },
      ],
      actionLabel: 'View prescription care',
      actionUrl: '/auth',
    },
    {
      id: 'laboratory',
      title: 'Laboratory and diagnostics',
      subtitle: 'Common tests done at the clinic, with results saved straight to your record.',
      badgeText: 'Fast Results',
      badgeTone: 'brand',
      icon: <Flask size={30} weight="duotone" />,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-700',
      cardBorder: 'border-blue-200/70',
      benefits: [
        {
          title: 'Careful sample collection',
          description: 'Trained staff take your blood or urine sample as gently as they can.',
        },
        {
          title: 'Routine tests on-site',
          description: 'Blood sugar, cholesterol, uric acid and urinalysis are done here at the clinic.',
        },
        {
          title: 'Results go to your doctor',
          description: 'Your doctor sees the results in your record and explains them at your next visit.',
        },
      ],
      actionLabel: 'View laboratory tests',
      actionUrl: '/auth',
    },
  ]

  return (
    <section id="services" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      {/* Compatibility anchor for bookmarks */}
      <span id="features" className="sr-only" aria-hidden="true">Features and services</span>

      {/* Header with clear senior readability */}
      <Reveal className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-brand-50 px-4 py-1.5 text-[13px] font-semibold text-brand-700">
          <Heartbeat size={16} weight="fill" className="text-brand-600" />
          <span>Clinic Services</span>
        </div>
        <h2 className="mt-4 text-3xl font-normal leading-[1.12] tracking-[-0.035em] text-ink sm:text-4xl lg:text-5xl">
          <RevealText text="Clinic care, made simple" />
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
          Three things the clinic does every day, now backed by one digital record.
        </p>
      </Reveal>

      {/* 3 Core Services Grid */}
      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {services.map((svc, idx) => (
          <Reveal key={svc.id} delay={idx * 0.08} className="h-full">
            <div
              className={cn(
                'group flex h-full flex-col justify-between rounded-3xl border bg-surface p-7 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift sm:p-8',
                svc.cardBorder
              )}
            >
              <div>
                {/* Header: Icon & Badge */}
                <div className="flex items-center justify-between gap-3">
                  <span className={cn('grid size-14 place-items-center rounded-2xl shadow-xs', svc.iconBg, svc.iconColor)}>
                    {svc.icon}
                  </span>
                  <Badge tone={svc.badgeTone} className="px-3 py-1 text-[12px] font-semibold">
                    {svc.badgeText}
                  </Badge>
                </div>

                {/* Title and Subtitle */}
                <h3 className="mt-6 text-2xl font-bold tracking-tight text-ink">
                  {svc.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
                  {svc.subtitle}
                </p>

                {/* Clear Expectations Checklist */}
                <div className="mt-6 border-t border-line/80 pt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                    What to expect
                  </p>
                  <ul className="mt-4 space-y-4">
                    {svc.benefits.map((b) => (
                      <li key={b.title} className="flex items-start gap-3">
                        <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-ok" />
                        <div>
                          <p className="text-[15px] font-semibold leading-snug text-ink">{b.title}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted">{b.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 border-t border-line/60 pt-5">
                <Button
                  to={svc.actionUrl}
                  variant="secondary"
                  size="md"
                  className="w-full justify-center transition-colors group-hover:border-brand-400 group-hover:bg-brand-50 group-hover:text-brand-700"
                  iconRight={<ArrowRight size={15} weight="bold" />}
                >
                  {svc.actionLabel}
                </Button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Senior and Companion Assistance Banner */}
      <Reveal delay={0.25} className="mt-8">
        <div className="flex flex-col gap-6 rounded-4xl border border-brand-200/80 bg-brand-50/70 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-soft">
              <Wheelchair size={26} weight="bold" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-lg font-bold text-ink">Need assistance or a wheelchair during your visit?</h4>
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-800">Free Staff Help</span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">
                The front desk can bring you to the right room and explain your doctor's notes. Just ask when you check in.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Button to="/auth" size="lg" iconRight={<ArrowRight size={16} weight="bold" />}>
              Start assisted visit
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* --------------------------------- Security -------------------------------- */

function Security() {
  const items = [
    { icon: <Fingerprint size={22} />, t: 'Role-based access', d: 'The front desk checks patients in and keeps details current. Only doctors see and sign consultation notes.' },
    { icon: <ClipboardText size={22} />, t: 'Complete audit trail', d: 'Who created, edited, signed or voided each record, and when. Voided documents keep their row and reason.' },
    { icon: <LockKey size={22} />, t: 'Encrypted end to end', d: 'Local HTTPS on the office network and encrypted files on the clinic server. Patient records stay in the office.' },
    { icon: <CloudCheck size={22} />, t: 'Redundant cloud backups', d: 'A nightly encrypted copy to a second device, plus an encrypted off-site copy whenever the internet is up.' },
  ]
  return (
    <section id="security" className="scroll-mt-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-4xl bg-brand-50 px-6 py-12 sm:px-12 lg:py-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 0.08} className="h-full">
              <div className="h-full rounded-3xl bg-surface p-6 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                <PopIn delay={0.15 + i * 0.08} className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white">
                  {it.icon}
                </PopIn>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{it.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{it.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- Personas --------------------------------- */

function Personas() {
  // Built from the problems the HMO-Clinic described. Not real people or real quotes, so no names, photos or ratings.
  const people: { icon: ReactNode; who: string; before: string; after: string }[] = [
    { icon: <UserCirclePlus size={24} weight="bold" />, who: 'Front desk and nurse', before: 'Every visit starts with hunting for a folder on the shelf while the line grows.', after: 'Search by name or ID, verify, and give a queue number in under a minute.' },
    { icon: <Stethoscope size={24} weight="bold" />, who: 'Doctor', before: 'Handwriting every prescription is slow, and history is only as good as the folder.', after: 'Past visits, allergies and scans are on screen. Documents are signed with a PIN.' },
    { icon: <FileText size={24} weight="bold" />, who: 'IPG employee', before: 'Half a morning is lost waiting for a signed medical certificate.', after: 'The certificate is printed and signed before you leave the room.' },
    { icon: <UsersThree size={24} weight="bold" />, who: 'Senior dependent', before: 'Arriving at seven still means waiting as long as everyone else.', after: 'Seniors get a priority number and can watch it on the waiting screen.' },
  ]
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <Reveal>
        <h2 className="max-w-2xl text-3xl font-normal leading-[1.08] tracking-[-0.035em] sm:text-5xl">
          <RevealText text="Designed around the people in the room" />
        </h2>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-ink-2">Each screen answers a problem the HMO-Clinic described.</p>
      </Reveal>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {people.map((p, i) => (
          <Reveal key={p.who} delay={i * 0.06} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">{p.icon}</span>
                <h3 className="text-lg font-semibold tracking-tight text-ink">{p.who}</h3>
              </div>
              <p className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-muted">Before</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{p.before}</p>
              <div className="mt-auto pt-5">
                <div className="rounded-2xl bg-brand-50 p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-brand-700">With Gilayon</p>
                  <p className="mt-1 text-[15px] font-medium leading-relaxed text-ink">{p.after}</p>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------- Footer --------------------------------- */

function Footer() {
  const [legal, setLegal] = useState<LegalKind | null>(null)
  const link = 'text-sm text-brand-100 transition hover:text-white'
  return (
    <footer className="bg-brand-600 text-white">
      <LegalModal kind={legal} onClose={() => setLegal(null)} />
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-white/20 pb-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo light markClassName="[filter:drop-shadow(0_0_1px_#fff)_drop-shadow(0_0_1px_#fff)]" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-100">Digital records for the HMO-Clinic: medical, dental and laboratory visits of IPG employees and their dependents.</p>
            <div className="mt-5 flex items-center gap-2 text-[13px] text-brand-100">
              <Desktop size={16} weight="fill" className="text-white" /> Runs on the clinic's own computers
            </div>
          </div>
          {[
            { h: 'Product', l: [['Services', '#services'], ['Security', '#security']] },
            { h: 'Clinic', l: [['Doctor', '/clinic/login?role=doctor'], ['Receptionist', '/clinic/login?role=desk'], ['Nurse', '/clinic/login?role=nurse'], ['Waiting screen', '/waiting']] },
            { h: 'Account', l: [['Get started', '/auth'], ['Sign in', '/clinic/login']] },
          ].map((c) => (
            <div key={c.h}>
              <p className="text-sm font-semibold text-white">{c.h}</p>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('#') ? (
                      <a href={href} className={link}>{label}</a>
                    ) : (
                      <Link to={href} className={link}>{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-4 rounded-3xl bg-white/10 p-5 ring-1 ring-inset ring-white/15 sm:flex-row sm:items-start sm:gap-5 sm:p-6">
          <ShieldCheck size={28} weight="fill" className="shrink-0 text-white" />
          <div className="flex-1">
            <p className="font-semibold">Disclaimer and data privacy</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-brand-100">
              This prototype uses synthetic patient data only. Gilayon is designed on the principles of the Data Privacy Act of 2012 (RA 10173): access by role, an audit trail and records kept on the clinic's own server. It does not claim certification, and the clinic's data protection officer should review it before real patient data is used.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="white" size="sm" onClick={() => setLegal('privacy')}>
              Data Privacy Act notice
            </Button>
            <Button variant="onBrand" size="sm" onClick={() => setLegal('disclaimer')}>
              Disclaimer
            </Button>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 pt-6 text-[13px] text-brand-100 sm:flex-row">
          <p>© {YEAR} Gilayon · Team KasCoders, Hack Iloilo 2026.</p>
          <p>Iloilo Provincial Government · HMO-Clinic · 2026 Startup Hackathon Challenge</p>
        </div>
      </div>
    </footer>
  )
}

export default function Landing() {
  return <LandingPage />
}

function LandingPage() {
  return (
    <div className="bg-canvas">
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Services />
        <Security />
        <Personas />
      </main>
      <Footer />
    </div>
  )
}
