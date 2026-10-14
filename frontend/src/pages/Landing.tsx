import {
  ArrowRight,
  ChartBar,
  CheckCircle,
  ClipboardText,
  CloudCheck,
  CloudSlash,
  Drop,
  FileText,
  Fingerprint,
  Flask,
  Heartbeat,
  List,
  LockKey,
  Pill,
  Plus,
  Printer,
  ShieldCheck,
  Signature,
  Stethoscope,
  Syringe,
  UserCirclePlus,
  UsersThree,
  Warning,
  WifiHigh,
  WifiSlash,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LandingLoader } from '../components/LandingLoader'
import { Logo } from '../components/Logo'
import { MobileAppShowcase } from '../components/MobileAppShowcase'
import { Reveal } from '../components/Reveal'
import { Drift, ParallaxImage, PopIn, RevealText, ScrollAway, ScrollProgress } from '../components/ScrollFx'
import { Avatar, Badge, Button } from '../components/ui'
import { DOCTORS } from '../data/seed'
import '@fontsource/allura'
import { cn, img, PHOTOS } from '../lib/utils'

/* ----------------------------------- Nav ----------------------------------- */

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#security', label: 'Security' },
  { href: '#app', label: 'Mobile app' },
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

function EcgPill() {
  return (
    <div className="relative mx-auto h-12 w-[280px] overflow-hidden rounded-full bg-brand-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] sm:w-[340px]">
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(93_136_250/0.35)_1px,transparent_1px),linear-gradient(90deg,rgb(93_136_250/0.35)_1px,transparent_1px)] [background-size:10px_10px]" />
      <svg viewBox="0 0 340 48" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <path d="M0 26 H40 l6 -4 l6 4 H70 l5 10 l7 -30 l7 34 l5 -14 H130 l6 -4 l6 4 H160 l5 10 l7 -30 l7 34 l5 -14 H220 l6 -4 l6 4 H250 l5 10 l7 -30 l7 34 l5 -14 H340" fill="none" stroke="#5d88fa" strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round" />
        <path
          d="M0 26 H40 l6 -4 l6 4 H70 l5 10 l7 -30 l7 34 l5 -14 H130 l6 -4 l6 4 H160 l5 10 l7 -30 l7 34 l5 -14 H220 l6 -4 l6 4 H250 l5 10 l7 -30 l7 34 l5 -14 H340"
          pathLength={460}
          fill="none"
          stroke="#bdd0ff"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="90 370"
          className="animate-ecg"
        />
      </svg>
      <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-brand-950 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-brand-950 to-transparent" />
    </div>
  )
}

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
        <motion.div {...rise(0)}>
          <EcgPill />
        </motion.div>

        <motion.h1 {...rise(0.08)} className="mt-10 text-[44px] leading-[1.02] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[84px]">
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
          <Button size="lg" variant="secondary" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
            See how it works
          </Button>
        </motion.div>
        </ScrollAway>
      </div>
    </section>
  )
}

/* -------------------------------- Problem ---------------------------------- */

function Problem() {
  const photos = [PHOTOS.doctorPhone, PHOTOS.labTubes, PHOTOS.consult, PHOTOS.nurse]
  return (
    <section className="px-4 sm:px-6 lg:px-8">
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
              <Reveal key={p} delay={i * 0.08} y={48} className={cn(i > 1 && 'hidden md:block')}>
                <ParallaxImage src={img.unsplash(p, 700, 875)} className="aspect-[4/5]" />
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* --------------------------------- Marquee --------------------------------- */

function Marquee() {
  const words = ['Verified check-in', 'Priority queue', 'Waiting screen', 'One-box search', 'Linked families', 'Signed prescriptions', 'Medical certificates', 'Daily report', 'Audit trail', 'Works offline', 'Old folder scans', 'English and Filipino']
  return (
    <div className="px-4 pt-24 sm:px-6 lg:px-8 lg:pt-32">
      <div className="mask-fade-x mx-auto flex max-w-7xl overflow-hidden rounded-full bg-brand-950 py-4">
        <div className="flex shrink-0 animate-marquee items-center gap-8 pr-8">
          {[...words, ...words].map((w, i) => (
            <span key={i} className="flex items-center gap-8 whitespace-nowrap text-[17px] font-medium text-brand-300">
              {w}
              <Plus size={12} weight="bold" className="text-brand-500" />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- Features -------------------------------- */

function Tile({ title, body, icon, className, children }: { title: string; body: string; icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-3xl border border-line bg-surface', className)}>
      <div className="flex-1 p-4 sm:p-5">{children}</div>
      <div className="flex items-start gap-3 border-t border-line px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
    </div>
  )
}

const LANE_CHIP: Record<string, string> = { U: 'bg-danger text-white', P: 'bg-brand-700 text-white', R: 'bg-mist text-ink ring-1 ring-inset ring-line-strong' }

function CheckInPreview() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.1fr]">
      <div className="rounded-2xl bg-canvas p-4">
        <p className="text-sm font-semibold">Verify identity</p>
        <ul className="mt-3 space-y-2">
          {[
            ['Full name', 'Maria Lourdes Villanueva'],
            ['Birthdate', 'Mar 18, 1968'],
            ['Employee ID', 'IPG-2004-0318'],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2 rounded-xl bg-ok-soft px-3 py-2">
              <span>
                <span className="block text-[11px] text-muted">{k}</span>
                <span className="block text-[13px] font-semibold">{v}</span>
              </span>
              <CheckCircle size={18} weight="fill" className="text-ok" />
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ok">
          <ShieldCheck size={14} weight="fill" /> Matches the HR list
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Waiting list</p>
        {[
          ['U-016', 'Urgent', 'Flagged by staff'],
          ['P-011', 'Senior', 'Age 63, from the birthdate'],
          ['P-012', 'Pregnant', 'Marked at check-in'],
          ['R-010', 'Regular', 'First come, first served'],
        ].map(([no, lane, note], i) => (
          <div key={no} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
            <span className="w-4 text-center text-[12px] font-semibold text-faint">{i + 1}</span>
            <span className={cn('grid h-9 min-w-[4.25rem] place-items-center rounded-xl text-[14px] font-semibold tabular', LANE_CHIP[no[0]])}>{no}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{lane}</span>
              <span className="block truncate text-[12px] text-muted">{note}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-normal leading-[1.05] tracking-[-0.035em] sm:text-5xl">
          <RevealText text="A clinic flow, not just a records system" />
        </h2>
        <p className="mx-auto mt-5 max-w-[58ch] text-[17px] leading-relaxed text-ink-2">Verified check-in, a priority queue, one record per person, signed documents and a daily report, on the clinic's own computers.</p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Reveal className="md:col-span-2">
          <Tile title="Verified check-in, then a fair queue" body="Nobody gets a number until their name, birthdate and employee ID match the HR list. Urgent, pregnant, PWD and senior patients go first." icon={<UserCirclePlus size={18} />} className="h-full">
            <CheckInPreview />
          </Tile>
        </Reveal>

        <Reveal delay={0.06}>
          <Tile title="Signed with a PIN and one tap" body="Every prescription and certificate carries the doctor's signature, license and PTR numbers, and a document number." icon={<Signature size={18} />} className="h-full">
            <div className="flex h-full min-h-[230px] flex-col justify-between rounded-2xl bg-canvas p-4">
              <div className="flex justify-center gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="size-4 rounded-full bg-brand-600" />
                ))}
              </div>
              <div className="text-center">
                <p className="text-[2rem] leading-none text-brand-900" style={{ fontFamily: 'Allura, cursive' }}>
                  Ramon Sollesta
                </p>
                <p className="mt-1 border-t border-ink/30 pt-1 text-[12px] font-semibold uppercase">Dr. Ramon Sollesta</p>
                <p className="text-[11px] text-muted">PRC 0098214 · PTR 7731542</p>
              </div>
              <p className="text-center font-mono text-[13px] font-semibold text-danger">RX-2026-000501</p>
            </div>
          </Tile>
        </Reveal>

        <Reveal>
          <Tile title="One record per person, families linked" body="Dependents sit under the employee, marked if they are on the PhilHealth MDR. Ages are calculated from the birthdate, never typed." icon={<UsersThree size={18} />} className="h-full">
            <ul className="space-y-2">
              {[
                ['Maria Lourdes Villanueva', 'Employee · 58', ''],
                ['Edgardo Villanueva', 'Spouse · 61 · Senior', 'MDR'],
                ['Kristine Villanueva', 'Child · 19', 'MDR'],
              ].map(([n, d, b], i) => (
                <li key={n} className={cn('flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5', i === 0 ? 'bg-brand-600 text-white' : 'bg-canvas')}>
                  <span>
                    <span className="block text-[13px] font-semibold">{n}</span>
                    <span className={cn('block text-[12px]', i === 0 ? 'text-brand-100' : 'text-muted')}>{d}</span>
                  </span>
                  {b && <Badge tone="brand">{b}</Badge>}
                </li>
              ))}
            </ul>
          </Tile>
        </Reveal>

        <Reveal delay={0.06}>
          <Tile title="Safer prescriptions" body="Drugs are chosen from a list, and the doctor is warned before prescribing something the patient is allergic to." icon={<Pill size={18} />} className="h-full">
            <div className="space-y-2.5">
              <div className="rounded-2xl border border-line p-3.5">
                <p className="text-[11px] text-muted">New prescription</p>
                <p className="text-[15px] font-semibold">Amoxicillin 500 mg</p>
              </div>
              <div className="rounded-2xl bg-danger-soft p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                  <Warning size={15} weight="fill" /> Allergy warning
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">Patient is allergic to Penicillin (hives and swelling).</p>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-ok-soft p-3.5 text-[13px] font-medium text-ok">
                <CheckCircle size={16} weight="fill" /> Carbocisteine signed, RX-2026-000501
              </div>
            </div>
          </Tile>
        </Reveal>

        <Reveal delay={0.12}>
          <Tile title="Keeps working with the internet off" body="It runs on the clinic's computers. If one is cut off, notes are saved on it and sync when it reconnects." icon={<WifiHigh size={18} />} className="h-full">
            <div className="flex h-full flex-col justify-center gap-2.5 rounded-2xl bg-canvas p-3.5">
              <span className="flex items-center gap-2 rounded-full bg-ok-soft px-3.5 py-2 text-[13px] font-semibold text-ok">
                <WifiHigh size={16} weight="bold" /> Online
              </span>
              <span className="flex items-center gap-2 rounded-full bg-warn-soft px-3.5 py-2 text-[13px] font-semibold text-warn">
                <CloudSlash size={16} weight="bold" /> Clinic network only
              </span>
              <span className="flex items-center gap-2 rounded-full bg-danger-soft px-3.5 py-2 text-[13px] font-semibold text-danger">
                <WifiSlash size={16} weight="bold" /> Offline, saved on this computer
                <span className="ml-auto rounded-full bg-danger px-2 text-white">1</span>
              </span>
            </div>
          </Tile>
        </Reveal>

        <Reveal>
          <Tile title="A daily report without tallying" body="Visits by lane, new and returning patients, average wait, common complaints and documents issued, printable for the Hospital Management Officer." icon={<ChartBar size={18} />} className="h-full">
            <div className="rounded-2xl bg-canvas p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-muted">Visits today</span>
                <span className="text-2xl font-semibold tabular">16</span>
              </div>
              <ul className="mt-3 space-y-2">
                {[
                  ['Urgent', 1],
                  ['Pregnant, PWD, Senior', 4],
                  ['Regular', 11],
                ].map(([l, n]) => (
                  <li key={l} className="grid grid-cols-[1fr_auto] items-center gap-3 text-[12px]">
                    <span>
                      {l}
                      <span className="mt-1 block h-2 rounded-full bg-brand-600" style={{ width: `${(Number(n) / 11) * 100}%` }} />
                    </span>
                    <b className="tabular">{n}</b>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-muted">Average wait 20 min</p>
            </div>
          </Tile>
        </Reveal>

        <Reveal delay={0.06} className="md:col-span-2">
          <Tile title="One visit, from check-in to report" body="Every step is written to the audit trail: who created, edited, signed or voided each record, and when." icon={<ClipboardText size={18} />} className="h-full">
            <ol className="relative grid h-full grid-cols-1 content-center gap-3 sm:grid-cols-5">
              <span className="absolute left-4 right-4 top-1/2 -mt-[22px] hidden h-px bg-brand-100 sm:block" aria-hidden />
              {[
                { i: <ShieldCheck size={18} />, t: 'Check in', d: 'Identity verified' },
                { i: <FileText size={18} />, t: 'Record opens', d: 'History ready' },
                { i: <Stethoscope size={18} />, t: 'Doctor signs', d: 'PIN and one tap' },
                { i: <Printer size={18} />, t: 'Documents issued', d: 'On the letterhead' },
                { i: <ChartBar size={18} />, t: 'Report ready', d: 'No hand tallying' },
              ].map((s, idx) => (
                <li key={s.t} className="relative flex items-center gap-3 sm:flex-col sm:items-start">
                  <span className={cn('relative grid size-11 place-items-center rounded-full ring-4 ring-surface', idx < 3 ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600')}>{s.i}</span>
                  <div>
                    <p className="text-[13px] font-semibold">{s.t}</p>
                    <p className="text-[12px] text-muted">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Tile>
        </Reveal>
      </div>
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
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
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
    <footer className="mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-10 border-b border-line pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Digital records for the HMO-Clinic: medical, dental and laboratory visits of IPG employees and their dependents.</p>
          <div className="mt-5 flex items-center gap-2 text-[13px] text-muted">
            <Drop size={16} weight="fill" className="text-brand-500" /> Runs on the clinic's own computers
          </div>
        </div>
        {[
          { h: 'Product', l: [['Features', '#features'], ['Security', '#security'], ['Mobile app', '#app']] },
          { h: 'Clinic', l: [['Front desk', '/clinic/login?role=desk'], ['Doctor', '/clinic/login?role=doctor'], ['Waiting screen', '/waiting'], ['Patient portal (extra)', '/auth?role=patient']] },
          { h: 'Account', l: [['Get started', '/auth'], ['Sign in', '/auth?mode=signin']] },
        ].map((c) => (
          <div key={c.h}>
            <p className="text-sm font-semibold text-ink">{c.h}</p>
            <ul className="mt-4 space-y-2.5">
              {c.l.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith('#') ? (
                    <a href={href} className="text-sm text-muted transition hover:text-brand-700">{label}</a>
                  ) : (
                    <Link to={href} className="text-sm text-muted transition hover:text-brand-700">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col justify-between gap-3 pt-6 text-[13px] text-faint sm:flex-row">
        <p>© {new Date().getFullYear()} Himsog · Team KasCoders, Hack Iloilo 2026.</p>
        <p>Prototype with synthetic data only. Not for real patient data.</p>
      </div>
    </footer>
  )
}

const PRELOAD = DOCTORS.slice(0, 4).map((d) => d.photo)

export default function Landing() {
  const [ready, setReady] = useState(false)
  return (
    // No "wait" mode: the page fades in underneath while the ECG loader fades out on top (a true crossfade).
    <AnimatePresence>
      {!ready ? (
        <LandingLoader key="loader" images={PRELOAD} onDone={() => setReady(true)} />
      ) : (
        <motion.div key="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}>
          <LandingPage />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LandingPage() {
  return (
    <div className="bg-canvas">
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Marquee />
        <Features />
        <Security />
        <Personas />
        <MobileAppShowcase />
      </main>
      <Footer />
    </div>
  )
}
