import {
  ArrowRight,
  CheckCircle,
  ClipboardText,
  CloudCheck,
  Drop,
  FileText,
  Fingerprint,
  Flask,
  Heartbeat,
  List,
  LockKey,
  Pill,
  Stethoscope,
  Syringe,
  Wheelchair,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../shared/components/Logo'
import { Reveal } from '../../shared/components/Reveal'
import { Drift, ParallaxImage, PopIn, RevealText, ScrollAway, ScrollProgress } from '../../shared/components/ScrollFx'
import { Avatar, Badge, Button } from '../../shared/components/ui'
import { DOCTORS } from '../portal/data/seed'
import { cn, img, PHOTOS } from '../../shared/lib/utils'

/* ----------------------------------- Nav ----------------------------------- */

const NAV = [
  { href: '#problem', label: 'How it works' },
  { href: '#services', label: 'Services' },
  { href: '#security', label: 'Security' },
  { href: '#personas', label: 'Stories' },
]

function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="glass sticky top-0 z-40 border-b border-line/60">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-mist hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button to="/auth?mode=signin" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button to="/auth" size="sm" iconRight={<ArrowRight size={14} weight="bold" />}>
            Get started
          </Button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 lg:hidden"
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
            className="overflow-hidden border-t border-line bg-surface lg:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-[15px] font-medium text-ink-2 hover:bg-mist">
                  {n.label}
                </a>
              ))}
              <Link to="/auth?mode=signin" className="rounded-2xl px-4 py-3 text-[15px] font-medium text-brand-700 hover:bg-mist">
                Sign in
              </Link>
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

const HERO_PEOPLE = [
  { name: 'Dr. Ramon Sollesta', photo: DOCTORS[0].photo },
  { name: 'Dr. Liza Magbanua', photo: DOCTORS[1].photo },
  { name: 'Front desk staff', photo: DOCTORS[2].photo },
  { name: 'Patient', photo: DOCTORS[3].photo },
]

function Hero() {
  const reduce = useReducedMotion()
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: [0.16, 1, 0.3, 1] as const } })
  return (
    <section className="relative overflow-hidden">
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
        <motion.h1 {...rise(0.08)} className="mt-10 text-[44px] leading-[1.03] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[84px]">
          <span className="block font-light">Every health record,</span>
          <span className="block font-semibold">
            in one <span className="text-brand-600">secure</span> place.
          </span>
        </motion.h1>

        <motion.p {...rise(0.16)} className="mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-muted sm:text-lg">
          Himsog turns the HMO-Clinic's paper folders into one record for IPG employees and their dependents, with a fair queue, signed documents and a daily report.
        </motion.p>

        <motion.div {...rise(0.24)} className="mt-8 flex items-center gap-3">
          <div className="flex -space-x-3">
            {HERO_PEOPLE.map((d) => (
              <Avatar key={d.name} name={d.name} src={d.photo} size="md" className="ring-[3px]" />
            ))}
          </div>
          <p className="text-left text-[13px] leading-snug text-ink-2">
            Front desk, doctors and patients
            <br />
            <span className="text-muted">working from the same record</span>
          </p>
        </motion.div>

        <motion.div {...rise(0.32)} className="mt-9 flex flex-col gap-3 sm:flex-row">
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

function Problem() {
  const photos = [
    { src: PHOTOS.doctorPhone, caption: 'Checking a past note before the visit' },
    { src: PHOTOS.labTubes, caption: 'Blood work, logged by hand' },
    { src: PHOTOS.consult, caption: 'A consultation, written on paper' },
    { src: PHOTOS.nurse, caption: 'A folder, found on the shelf' },
  ]
  return (
    <section id="problem" className="scroll-mt-24 px-4 sm:px-6 lg:px-8">
      <Reveal>
        <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-mist">
          <div className="px-6 pb-10 pt-12 sm:px-12 sm:pt-16">
            <h2 className="max-w-3xl text-3xl font-normal leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl">
              <RevealText text="Paper folders get lost." /> <RevealText text="Your health story shouldn't." className="text-brand-600" delay={0.25} />
            </h2>
            <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
              Today every visit means writing by hand, filing folders on shelves and searching for them while the line grows. Himsog keeps one standard record per patient, opened in seconds and ready before the consult.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
            {photos.map((p, i) => (
              <Reveal key={p.src} delay={i * 0.08} y={48} className={cn(i > 1 && 'hidden md:block')}>
                <div className="group relative">
                  <ParallaxImage
                    src={img.unsplash(p.src, 700, 875)}
                    className="aspect-[4/5] grayscale-[55%] saturate-[0.8] transition duration-700 group-hover:grayscale-0 group-hover:saturate-100"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-950/70 via-transparent to-transparent" />
                  <p className="absolute inset-x-0 bottom-0 p-3 text-[12.5px] font-medium leading-snug text-white sm:p-4 sm:text-[13px]">{p.caption}</p>
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
      subtitle: 'Doctor check-ups, ongoing senior care, and attentive visits without feeling rushed.',
      badgeText: 'Senior Priority',
      badgeTone: 'brand',
      icon: <Stethoscope size={30} weight="duotone" />,
      iconBg: 'bg-brand-50',
      iconColor: 'text-brand-600',
      cardBorder: 'border-brand-200/70',
      benefits: [
        {
          title: 'Priority check-in at Counter 1',
          description: 'Seniors aged 60 and above go directly to our priority lane with comfortable seating.',
        },
        {
          title: 'Unhurried time with your physician',
          description: 'Discuss blood pressure, joint pain, maintenance medicines, and any health concerns.',
        },
        {
          title: 'Companions and family always welcome',
          description: 'Your family member or caregiver is encouraged to join inside the consultation room.',
        },
      ],
      actionLabel: 'Schedule doctor visit',
      actionUrl: '/auth',
    },
    {
      id: 'prescription',
      title: 'Prescriptions and medicines',
      subtitle: 'Clear dosage schedules, allergy safeguards, and worry-free maintenance refills.',
      badgeText: 'Safe Dosage',
      badgeTone: 'ok',
      icon: <Pill size={30} weight="duotone" />,
      iconBg: 'bg-ok-soft',
      iconColor: 'text-ok',
      cardBorder: 'border-emerald-200/70',
      benefits: [
        {
          title: 'Large-print dosage instructions',
          description: 'Easy-to-read directions detailing morning, afternoon, and bedtime medicines with meals.',
        },
        {
          title: 'Automatic allergy protection',
          description: 'Our system double-checks every medicine against your health record to prevent reactions.',
        },
        {
          title: 'Sent directly to the clinic dispensary',
          description: 'No paper slips to misplace. Your prescription is waiting at the pharmacy counter.',
        },
      ],
      actionLabel: 'View prescription care',
      actionUrl: '/auth',
    },
    {
      id: 'laboratory',
      title: 'Laboratory and diagnostics',
      subtitle: 'Gentle blood collection, vital monitoring, and test results explained in plain words.',
      badgeText: 'Fast Results',
      badgeTone: 'brand',
      icon: <Flask size={30} weight="duotone" />,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-700',
      cardBorder: 'border-blue-200/70',
      benefits: [
        {
          title: 'Gentle, experienced sample collection',
          description: 'Trained medical technologists ensure comfortable, patient, and painless blood extraction.',
        },
        {
          title: 'Routine senior health screenings',
          description: 'Fasting blood sugar, cholesterol, uric acid, and urinalysis tests completed on-site.',
        },
        {
          title: 'Results explained in simple words',
          description: 'Results go straight to your doctor so you do not need return trips or confusing paperwork.',
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
          <RevealText text="Care made simple for every senior and family" />
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
          We have simplified the clinic experience. Enjoy priority lanes, large-print instructions, and dedicated staff ready to assist you in person.
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
                Our front desk assistants are stationed at Counter 1 to guide you to consultation rooms, print large-print medical summaries, and explain doctor notes at a comfortable pace.
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
  // Composite personas built from the problems the HMO-Clinic described. Not real people or real quotes.
  const people = [
    { name: 'Front desk staff', role: 'HMO-Clinic', quote: 'Every visit starts with finding a folder on the shelf while the line keeps growing.', photo: img.portrait('women', 44) },
    { name: 'Senior physician', role: 'HMO-Clinic', quote: 'Handwriting every prescription is slow, and past visits are only as good as the folder I am handed.', photo: img.unsplash(PHOTOS.drMale, 160, 160) },
    { name: 'IPG employee', role: 'Provincial office', quote: 'I lose half a morning waiting for a signed medical certificate for my sick leave.', photo: img.portrait('men', 41) },
    { name: 'Senior dependent', role: 'Spouse of an employee', quote: 'I arrive at seven and still wait as long as everyone else, with no idea when I will be called.', photo: img.portrait('women', 79) },
  ]
  return (
    <section id="personas" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
      <Reveal>
        <h2 className="max-w-2xl text-4xl font-normal leading-[1.05] tracking-[-0.035em] sm:text-5xl">
          <RevealText text="Designed around the people in the room" />
        </h2>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-ink-2">Composite personas built from the problems the HMO-Clinic described. Each one shaped a screen.</p>
      </Reveal>
      <div className="scrollbar-none -mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {people.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.06} className="w-[82%] shrink-0 snap-start sm:w-auto">
            <figure className={cn('flex h-full flex-col justify-between rounded-3xl border border-line p-6', i % 2 === 0 ? 'bg-surface' : 'bg-mist')}>
              <blockquote className="text-[17px] leading-relaxed text-ink">“{p.quote}”</blockquote>
              <figcaption className="mt-8 flex items-center gap-3">
                <Avatar name={p.name} src={p.photo} size="md" />
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-[13px] text-muted">{p.role}</p>
                </div>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------- Footer --------------------------------- */

function Footer() {
  return (
    <footer className="bg-brand-950 text-white">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-100">Digital records for the HMO-Clinic: medical, dental and laboratory visits of IPG employees and their dependents.</p>
            <div className="mt-5 flex items-center gap-2 text-[13px] text-brand-200">
              <Drop size={16} weight="fill" className="text-brand-300" /> Runs on the clinic's own computers
            </div>
          </div>
          {[
            { h: 'Product', l: [['Services', '#services'], ['Security', '#security']] },
            { h: 'Clinic', l: [['Front desk', '/clinic/login?role=desk'], ['Doctor', '/clinic/login?role=doctor'], ['Waiting screen', '/waiting']] },
            { h: 'Account', l: [['Get started', '/auth'], ['Sign in', '/auth?mode=signin']] },
          ].map((c) => (
            <div key={c.h}>
              <p className="text-sm font-semibold text-white">{c.h}</p>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('#') ? (
                      <a href={href} className="text-sm text-brand-100 transition hover:text-white">{label}</a>
                    ) : (
                      <Link to={href} className="text-sm text-brand-100 transition hover:text-white">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 pt-6 text-[13px] text-brand-200">
          <p className="max-w-3xl leading-relaxed">
            This is a hackathon prototype built on synthetic demo data only — never real patient records. A production clinic deployment would handle personal health information under the Data Privacy Act of 2012 (RA 10173): records stay on clinic-owned hardware, access is role-based and logged, and patients may request a copy or correction of their data.
          </p>
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <p>© {new Date().getFullYear()} Himsog · Team KasCoders, Hack Iloilo 2026.</p>
            <p>Prototype with synthetic data only. Not for real patient data.</p>
          </div>
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
