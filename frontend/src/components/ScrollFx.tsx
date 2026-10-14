import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { Fragment, useRef, type ReactNode } from 'react'
import { cn } from '../lib/utils'

/*
  Scroll effects for the landing page. Everything animates transform and opacity only,
  plays once per element, and collapses to static under prefers-reduced-motion.
*/

const EASE = [0.22, 1, 0.36, 1] as const

/** Thin brand-blue bar along the top edge that fills as the page is read. */
export function ScrollProgress() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 })
  if (reduce) return null
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-brand-600" style={{ scaleX }} />
}

/** Headline that rises in word by word from behind a mask as it enters the viewport. */
export function RevealText({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  const words = text.split(' ')
  if (reduce) return <span className={className}>{text}</span>
  return (
    <motion.span className={className} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.6 }} transition={{ staggerChildren: 0.045, delayChildren: delay }}>
      {words.map((w, i) => (
        <Fragment key={i}>
          {/* pb/-mb keep descenders (g, y, p) inside the mask. A real space sits between words so the text reads and copies normally. */}
          <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
            <motion.span className="inline-block" variants={{ hidden: { y: '105%' }, shown: { y: '0%' } }} transition={{ duration: 0.85, ease: EASE }}>
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </motion.span>
  )
}

/** Photo that drifts slower than the page (classic depth parallax) inside a clipped frame. */
export function ParallaxImage({ src, className, strength = 10 }: { src: string; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [`-${strength}%`, `${strength}%`])
  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      <motion.img src={src} alt="" loading="lazy" className="absolute inset-0 size-full scale-[1.22] object-cover will-change-transform" style={reduce ? undefined : { y }} />
    </div>
  )
}

/** Icon tile that springs in when its card comes into view. */
export function PopIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      className={className}
      initial={reduce ? false : { scale: 0.5, rotate: -12, opacity: 0 }}
      whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}
    >
      {children}
    </motion.span>
  )
}

/** Content that slides up and fades slightly as the visitor scrolls past it (used on the hero). */
export function ScrollAway({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, -140])
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96])
  return (
    <div ref={ref} className={className}>
      <motion.div className="flex w-full flex-col items-center will-change-transform" style={reduce ? undefined : { y, opacity, scale }}>
        {children}
      </motion.div>
    </div>
  )
}

/** Layer that moves at a different speed from the page, for depth (used on the hero's floating icons). */
export function Drift({ children, speed, className }: { children: ReactNode; speed: number; className?: string }) {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 900], [0, -speed])
  return (
    <motion.div className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  )
}
