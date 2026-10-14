import { Heart } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { LogoMark } from './Logo'

/** One sweep across the monitor = 3 heartbeats. 2.4s per sweep is 75 bpm. */
const SWEEP_MS = 2400
const BEATS = 3
const BPM = Math.round((60_000 / SWEEP_MS) * BEATS)
const MIN_MS = 1200
const SAFETY_MS = 7000

const BEAT_W = 200
const BASE = 80
const R_X = 82 // where the R spike sits inside each beat

/** P wave, QRS complex and T wave for one heartbeat starting at x0. */
function beat(x0: number) {
  const x = (n: number) => x0 + n
  return [
    `L ${x(30)} ${BASE}`,
    `Q ${x(42)} ${BASE - 13} ${x(54)} ${BASE}`, // P wave (atrial depolarization)
    `L ${x(70)} ${BASE}`,
    `L ${x(75)} ${BASE + 7}`, // Q
    `L ${x(R_X)} 14`, // R spike (ventricular depolarization)
    `L ${x(89)} ${BASE + 26}`, // S
    `L ${x(96)} ${BASE}`,
    `L ${x(114)} ${BASE}`, // ST segment
    `Q ${x(134)} ${BASE - 30} ${x(154)} ${BASE}`, // T wave (repolarization)
    `L ${x(BEAT_W)} ${BASE}`,
  ].join(' ')
}

const WIDTH = BEAT_W * BEATS
const ECG_PATH = `M 0 ${BASE} ` + Array.from({ length: BEATS }, (_, i) => beat(i * BEAT_W)).join(' ')

// Bright segments behind the leading point, longest and faintest first, to fake a phosphor fade.
const TAILS = [
  { frac: 0.55, opacity: 0.18 },
  { frac: 0.3, opacity: 0.45 },
  { frac: 0.13, opacity: 1 },
]

function preloadImage(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
  })
}

/**
 * Splash shown while the landing page's fonts and hero images load: an ECG trace sweeping
 * across a monitor grid. Once assets are ready it waits for the sweep to reach the right edge,
 * then calls `onDone` so the page can crossfade in.
 */
export function LandingLoader({ images = [], onDone }: { images?: string[]; onDone: () => void }) {
  const reduce = useReducedMotion()
  const ready = useRef(false)
  const done = useRef(false)
  const pathRef = useRef<SVGPathElement>(null)
  const tailRefs = useRef<Array<SVGPathElement | null>>([])
  const dotRef = useRef<SVGGElement>(null)
  const heartRef = useRef<HTMLSpanElement>(null)

  const finish = useRef(onDone)
  useEffect(() => {
    finish.current = onDone
  }, [onDone])

  // Asset gate: fonts + hero images, but never shorter than MIN_MS.
  useEffect(() => {
    let cancelled = false
    const min = new Promise((r) => setTimeout(r, reduce ? 300 : MIN_MS))
    const assets = Promise.all([document.fonts?.ready ?? Promise.resolve(), ...images.map(preloadImage)])
    Promise.all([min, assets]).then(() => {
      if (cancelled) return
      ready.current = true
      if (reduce && !done.current) {
        done.current = true
        finish.current()
      }
    })
    // Never trap the visitor behind the splash (e.g. a stalled image or a background tab).
    const safety = setTimeout(() => {
      if (!done.current) {
        done.current = true
        finish.current()
      }
    }, SAFETY_MS)
    return () => {
      cancelled = true
      clearTimeout(safety)
    }
  }, [images, reduce])

  // Sweep animation driven by one rAF clock so the trace, the leading dot and the heart stay in sync.
  useEffect(() => {
    if (reduce) return
    const path = pathRef.current
    if (!path) return
    const total = path.getTotalLength()
    let start = 0
    let raf = 0

    const frame = (now: number) => {
      if (!start) start = now
      const t = ((now - start) % SWEEP_MS) / SWEEP_MS
      const nearEnd = t > 0.985
      const head = (nearEnd && ready.current ? 1 : t) * total

      TAILS.forEach((tail, i) => {
        const el = tailRefs.current[i]
        if (!el) return
        const len = tail.frac * total
        el.setAttribute('stroke-dasharray', `${len} ${total * 2}`)
        el.setAttribute('stroke-dashoffset', String(len - head))
      })

      const p = path.getPointAtLength(head)
      dotRef.current?.setAttribute('transform', `translate(${p.x} ${p.y})`)

      // Heart pops as the trace crosses each R spike.
      const local = p.x % BEAT_W
      const pulse = Math.exp(-(((local - R_X) / 9) ** 2))
      if (heartRef.current) heartRef.current.style.transform = `scale(${1 + 0.32 * pulse})`

      if (nearEnd && ready.current && !done.current) {
        done.current = true
        finish.current()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reduce])

  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-canvas px-4"
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
      transition={{ duration: reduce ? 0.2 : 0.9, ease: [0.65, 0, 0.35, 1], delay: reduce ? 0 : 0.05 }}
      role="status"
      aria-live="polite"
      aria-label="Loading Himsog"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,#dce7ff_0%,rgba(245,248,254,0)_70%)]" />

      <motion.div
        className="relative flex w-full max-w-[680px] flex-col items-center"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[19px] font-semibold tracking-[-0.03em] text-ink">himsog</span>
        </div>

        {/* Monitor */}
        <div className="relative mt-10 w-full">
          <div
            className="mask-fade-x absolute inset-0 opacity-70 [background-image:linear-gradient(var(--color-brand-100)_1px,transparent_1px),linear-gradient(90deg,var(--color-brand-100)_1px,transparent_1px)] [background-size:20px_20px]"
            aria-hidden
          />
          <svg viewBox={`0 0 ${WIDTH} 140`} className="mask-fade-x relative block h-auto w-full overflow-visible" aria-hidden>
            <path ref={pathRef} d={ECG_PATH} fill="none" stroke="var(--color-brand-200)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {!reduce && (
              <g style={{ filter: 'drop-shadow(0 0 6px rgb(35 80 214 / 0.45))' }}>
                {TAILS.map((tail, i) => (
                  <path
                    key={tail.frac}
                    ref={(el) => {
                      tailRefs.current[i] = el
                    }}
                    d={ECG_PATH}
                    fill="none"
                    stroke="var(--color-brand-600)"
                    strokeOpacity={tail.opacity}
                    strokeWidth={i === TAILS.length - 1 ? 3 : 2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray="0 99999"
                  />
                ))}
                <g ref={dotRef} transform={`translate(0 ${BASE})`}>
                  <circle r="11" fill="var(--color-brand-400)" opacity="0.25" />
                  <circle r="4.5" fill="#fff" stroke="var(--color-brand-600)" strokeWidth="2.5" />
                </g>
              </g>
            )}
            {reduce && <path d={ECG_PATH} fill="none" stroke="var(--color-brand-600)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
          </svg>
        </div>

        <div className="mt-8 flex items-center gap-2 text-sm text-ink-2">
          <span ref={heartRef} className="inline-grid place-items-center text-brand-600 will-change-transform">
            <Heart size={18} weight="fill" />
          </span>
          <span className="font-semibold tabular text-ink">{BPM}</span>
          <span className="text-muted">bpm</span>
        </div>
        <p className="mt-1.5 text-[13px] text-muted">Preparing your health records</p>
      </motion.div>
    </motion.div>
  )
}
