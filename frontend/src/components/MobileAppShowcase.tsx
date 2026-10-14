import {
  ArrowRight,
  ArrowUpRight,
  BatteryFull,
  CaretRight,
  CellSignalFull,
  DesktopTower,
  DeviceMobile,
  Files,
  Heartbeat,
  MagnifyingGlass,
  Megaphone,
  Printer,
  UsersThree,
  WifiHigh,
} from '@phosphor-icons/react'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import '@fontsource/allura'
import { cn } from '../lib/utils'
import { installHelp, isInstalled, promptInstall } from '../lib/pwa'
import { Avatar, useToast } from './ui'

/*
  Scroll choreography measured from healthwell.framer.website ("Download the App"):
  the panel pins near the top of the viewport for ~1300px of scrolling. The phones start
  stacked (front at 100%, the two behind at 90% and 80%, each a little lower), wait,
  fan out (front phone slides left, back phone slides right, middle phone grows into the
  center), then hold before the panel scrolls away.
  The fan-out is spread over 500px (HealthWell uses ~300px) so a single mouse-wheel notch
  never jumps more than a fifth of the motion.
*/
const PIN_PX = 1300
/** Height of the landing page's sticky nav; the panel pins just below it. */
const NAV_H = 72
const START = 250 / PIN_PX
const END = 750 / PIN_PX

const PHONE_W = 322
const SPREAD = PHONE_W * 0.97
/** How much of each phone (from the top) should stay visible; the stage shrinks on short screens to keep it. */
const VISIBLE_H = 470

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/* --------------------------------- Phone UI -------------------------------- */

function StatusBar() {
  return (
    <div className="relative flex h-11 items-center justify-between px-6 text-[15px] font-semibold text-white">
      <span>9:41</span>
      <span className="absolute left-1/2 top-2 h-[26px] w-[84px] -translate-x-1/2 rounded-full bg-[#05091a]" />
      <span className="flex items-center gap-1">
        <CellSignalFull size={14} weight="fill" />
        <WifiHigh size={14} weight="bold" />
        <BatteryFull size={18} weight="fill" />
      </span>
    </div>
  )
}

function PhoneHeader({ title }: { title?: string }) {
  return (
    <div className={cn('bg-brand-600 pb-5', title && 'pb-16')}>
      <StatusBar />
      <div className="mt-3 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <Avatar name="Ramon Sollesta" size="sm" className="ring-white/40" />
          <div className="text-left">
            <p className="text-[17px] leading-tight text-white">Dr. Sollesta</p>
            <p className="text-[13px] text-brand-100">Room 1 · 6 waiting</p>
          </div>
        </div>
        <span className="flex h-8 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-semibold text-ok">
          <WifiHigh size={14} weight="bold" /> Online
        </span>
      </div>
      {title && <p className="mt-6 px-4 text-left text-[24px] font-medium text-white">{title}</p>}
    </div>
  )
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[52px] bg-[#05091a] p-[10px] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/15" style={{ width: PHONE_W }}>
      <div className="h-[640px] overflow-hidden rounded-[42px] bg-canvas text-left">{children}</div>
    </div>
  )
}

function SectionRow({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[16px] font-medium text-ink">{title}</p>
      <span className="flex items-center gap-0.5 text-[13px] text-muted">
        View all <CaretRight size={12} />
      </span>
    </div>
  )
}

const CHIP: Record<string, string> = { U: 'bg-danger text-white', P: 'bg-brand-700 text-white', R: 'bg-mist text-ink ring-1 ring-inset ring-line-strong' }

function QueueScreen() {
  return (
    <>
      <PhoneHeader />
      <div className="-mt-1 rounded-t-[26px] bg-canvas px-4 pt-4">
        <div className="flex h-12 items-center gap-2.5 rounded-full bg-surface px-4 text-[14px] text-muted shadow-soft">
          <MagnifyingGlass size={18} className="text-ink" /> Name or employee ID
        </div>
        <div className="mt-5 rounded-2xl bg-brand-950 p-4 text-white">
          <p className="text-[12px] text-brand-200">Next patient</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid h-12 min-w-[5rem] place-items-center rounded-xl bg-danger text-xl font-semibold tabular">U-016</span>
            <div>
              <p className="text-[15px] font-semibold">Maria Lourdes V.</p>
              <p className="text-[12px] text-brand-200">58 · Urgent · Penicillin allergy</p>
            </div>
          </div>
          <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-semibold text-brand-800">
            <Megaphone size={16} weight="fill" /> Call next patient
          </div>
        </div>
        <div className="mt-5">
          <SectionRow title="Waiting (6)" />
          <ul className="mt-3 space-y-2">
            {[
              ['P-011', 'Senior', '30 min'],
              ['P-012', 'Pregnant', '23 min'],
              ['P-014', 'PWD', '12 min'],
              ['R-010', 'Regular', '35 min'],
            ].map(([no, lane, w]) => (
              <li key={no} className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 shadow-soft">
                <span className={cn('grid h-9 min-w-[4.25rem] place-items-center rounded-xl text-[14px] font-semibold tabular', CHIP[no[0]])}>{no}</span>
                <span className="flex-1 text-[13px] font-medium text-ink">{lane}</span>
                <span className="text-[12px] text-muted">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function RecordsScreen() {
  const facts = [
    ['Age', '58'],
    ['Employee ID', 'IPG-2004-0318'],
    ['Office', 'Health Office'],
    ['PhilHealth', '12-0503182-7'],
    ['Allergy', 'Penicillin'],
    ['Old folder', 'F-2004-0181'],
  ]
  return (
    <>
      <PhoneHeader title="Patient record" />
      <div className="-mt-10 space-y-3 px-4">
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <Heartbeat size={18} className="text-brand-600" /> Maria Lourdes Villanueva
            </p>
            <ArrowUpRight size={16} className="text-ink-2" />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className={cn('mt-0.5 truncate text-[14px]', k === 'Allergy' ? 'font-semibold text-danger' : 'text-ink')}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <UsersThree size={18} className="text-brand-600" /> Family
          </p>
          <p className="mt-2 text-[13px] text-ink-2">Edgardo (spouse, MDR) · Kristine (child, MDR)</p>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-soft">
          <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Files size={18} className="text-brand-600" /> 3 scanned folder pages
          </p>
          <ArrowUpRight size={16} className="text-ink-2" />
        </div>
      </div>
    </>
  )
}

function DocumentScreen() {
  return (
    <>
      <PhoneHeader title="Signed documents" />
      <div className="-mt-10 space-y-3 px-4">
        <div className="rounded-2xl bg-surface p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-medium text-ink">Prescription</p>
            <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">Signed</span>
          </div>
          <p className="font-mono text-[12px] font-semibold text-danger">RX-2026-000501</p>
          <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[13px] text-ink">
            <li>
              <b>Carbocisteine 500 mg</b> #15
              <span className="block text-[12px] text-muted">3 times a day for 5 days</span>
            </li>
            <li>
              <b>Cetirizine 10 mg</b> #5
              <span className="block text-[12px] text-muted">Once a day at bedtime</span>
            </li>
          </ul>
          <div className="mt-3 border-t border-line pt-2 text-center">
            <p className="text-[1.6rem] leading-none text-brand-900" style={{ fontFamily: 'Allura, cursive' }}>
              Ramon Sollesta
            </p>
            <p className="text-[11px] text-muted">PRC 0098214 · PTR 7731542</p>
          </div>
        </div>
        <div className="rounded-2xl bg-surface p-3 shadow-soft">
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-950 text-[14px] font-medium text-white">
            Print on the letterhead <Printer size={16} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-surface p-4 shadow-soft">
          <p className="text-[14px] text-ink">Medical certificate</p>
          <span className="font-mono text-[12px] font-semibold text-danger">MC-2026-000212</span>
        </div>
      </div>
    </>
  )
}

/* -------------------------------- Animation -------------------------------- */

function usePhoneMotion(t: MotionValue<number>, from: { x: number; y: number; scale: number }) {
  const ease = (v: number) => easeInOutCubic(Math.min(1, Math.max(0, v)))
  return {
    x: useTransform(t, (v) => from.x * (1 - ease(v))),
    y: useTransform(t, (v) => from.y * (1 - ease(v))),
    scale: useTransform(t, (v) => from.scale + (1 - from.scale) * ease(v)),
  }
}

function PhoneStage({ progress }: { progress: MotionValue<number> }) {
  // Final layout is left/center/right; `from` is the stacked starting state relative to it.
  const left = usePhoneMotion(progress, { x: SPREAD, y: 0, scale: 1 }) // Home: front of the stack
  const center = usePhoneMotion(progress, { x: 0, y: 36, scale: 0.9 }) // Records: second in the stack
  const right = usePhoneMotion(progress, { x: -SPREAD, y: 72, scale: 0.8 }) // Appointments: back of the stack

  // Fit the fanned-out phones to the space available, by width and by height.
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      // Wide screens show all three phones; narrow screens let the side phones peek in.
      const byWidth = width >= 640 ? width / (PHONE_W + 2 * SPREAD + 32) : width / (PHONE_W * 1.7)
      const byHeight = height > 0 ? height / VISIBLE_H : 1
      setFit(Math.max(0.5, Math.min(1, byWidth, byHeight)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={box} className="absolute inset-0">
      <div className="relative mx-auto origin-top" style={{ width: PHONE_W, height: 680, transform: `scale(${fit})` }}>
        <motion.div
          className="absolute left-0 top-0 z-30 origin-top will-change-transform"
          style={{
            x: useTransform(left.x, (v) => v - SPREAD),
            y: left.y,
            scale: left.scale,
          }}
        >
          <PhoneFrame>
            <QueueScreen />
          </PhoneFrame>
        </motion.div>
        <motion.div className="absolute left-0 top-0 z-20 origin-top will-change-transform" style={{ x: center.x, y: center.y, scale: center.scale }}>
          <PhoneFrame>
            <RecordsScreen />
          </PhoneFrame>
        </motion.div>
        <motion.div
          className="absolute left-0 top-0 z-10 origin-top will-change-transform"
          style={{
            x: useTransform(right.x, (v) => v + SPREAD),
            y: right.y,
            scale: right.scale,
          }}
        >
          <PhoneFrame>
            <DocumentScreen />
          </PhoneFrame>
        </motion.div>
      </div>
    </div>
  )
}

/* ------------------------------- Store buttons ----------------------------- */

const HOVER_EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

/**
 * Hover measured from healthwell.framer.website: a pill-shaped fill sweeps in from the right
 * edge until it covers the button, an arrow slides in from the right, and the label shifts
 * 10px left and turns white. The button keeps its width; leaving reverses the motion.
 */
function StoreButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group relative isolate inline-flex h-12 items-center overflow-hidden rounded-full bg-white px-9 text-lg text-ink transition-transform active:scale-[0.98]">
      <span aria-hidden className={cn('absolute inset-0 -z-10 translate-x-full rounded-full bg-brand-600 transition-transform group-hover:translate-x-0 group-focus-visible:translate-x-0', HOVER_EASE)} />
      <span className={cn('flex items-center gap-2 transition-[translate,color] group-hover:-translate-x-2.5 group-hover:text-white group-focus-visible:-translate-x-2.5 group-focus-visible:text-white', HOVER_EASE)}>
        {icon}
        {label}
      </span>
      <ArrowRight
        aria-hidden
        size={20}
        weight="bold"
        className={cn('absolute right-3 top-1/2 -translate-y-1/2 translate-x-[calc(100%+12px)] text-white transition-transform group-hover:translate-x-0 group-focus-visible:translate-x-0', HOVER_EASE)}
      />
    </button>
  )
}

/* --------------------------------- Section --------------------------------- */

export function MobileAppShowcase() {
  const toast = useToast()
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: track,
    offset: [`start ${NAV_H}px`, 'end end'],
  })
  const raw = useTransform(scrollYProgress, [START, END], [0, 1], {
    clamp: true,
  })
  // Smooth out stepped (mouse-wheel) scrolling. Overdamped, so the phones glide without bouncing.
  const smooth = useSpring(raw, {
    stiffness: 90,
    damping: 22,
    mass: 0.5,
    restDelta: 0.0005,
  })
  const settled = useMotionValue(1)
  // Reduced motion: no pinning, phones shown already fanned out.
  const progress = reduce ? settled : smooth

  const install = async () => {
    if (isInstalled()) return toast({ tone: 'ok', title: 'Himsog is already installed on this device' })
    const r = await promptInstall()
    if (r === 'accepted') toast({ tone: 'ok', title: 'Installed', body: 'Himsog now opens like an app, even with the internet down.' })
    else if (r === 'unavailable') toast({ tone: 'info', title: 'Install from your browser', body: installHelp() })
  }

  return (
    <section id="app" className="scroll-mt-0 px-4 sm:px-6 lg:px-8">
      {/* Tall track: the panel stays pinned while the visitor scrolls through PIN_PX of it. */}
      <div
        ref={track}
        className="relative"
        style={{
          height: reduce ? 'auto' : `calc(100svh - ${NAV_H}px + ${PIN_PX}px)`,
        }}
      >
        <div className={cn('flex items-start py-6', !reduce && 'sticky')} style={reduce ? undefined : { top: NAV_H, height: `calc(100svh - ${NAV_H}px)` }}>
          <div className="relative isolate mx-auto flex h-full w-full max-w-7xl transform-gpu flex-col overflow-hidden rounded-4xl bg-brand-950 px-6 pt-10 text-center sm:pt-14" style={{ minHeight: reduce ? 760 : undefined }}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_55%_at_50%_0%,rgb(29_64_171/0.6),transparent_75%)]" />
            <div className="relative">
              <p className="text-[15px] text-brand-100">Computers, tablets and phones</p>
              <h2 className="mt-3 text-5xl font-normal tracking-[-0.03em] text-white sm:text-6xl">Install the App</h2>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <StoreButton icon={<DesktopTower size={20} weight="fill" />} label="On a computer" onClick={install} />
                <StoreButton icon={<DeviceMobile size={20} weight="fill" />} label="On a phone or tablet" onClick={install} />
              </div>
              <p className="mt-4 text-[15px] text-brand-200">No app store. Installs from the browser and opens even when the internet is down.</p>
            </div>
            <div className="relative mt-10 min-h-[320px] flex-1" aria-hidden>
              <PhoneStage progress={progress} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
