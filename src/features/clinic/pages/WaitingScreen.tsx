import { SpeakerHigh } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { LogoMark } from '../../../shared/components/Logo'
import { cn } from '../../../shared/lib/utils'
import { StatusBadge, TicketNo } from '../components/ClinicComponents'
import { both, fil } from '../lib/i18n'
import { LANE_STYLE, ticketLabel } from '../lib/helpers'
import { useClinic } from '../store/store'
import { useNow, useToday } from './QueueBoard'

/** Public screen in the waiting area: queue numbers only, no names. No sign-in. */
export default function WaitingScreen() {
  const { data } = useClinic()
  const q = useToday()
  const now = useNow(1000)
  const doctors = data.staff.filter((s) => s.role === 'doctor')
  const [flash, setFlash] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set(q.active.map((t) => t.ticket_id)))

  // Highlight a number briefly when it is newly called.
  useEffect(() => {
    for (const t of q.active) {
      if (!seen.current.has(t.ticket_id)) {
        seen.current.add(t.ticket_id)
        setFlash(t.ticket_id)
        const id = setTimeout(() => setFlash(null), 6000)
        return () => clearTimeout(id)
      }
    }
  }, [q.active])

  const flashTicket = q.active.find((t) => t.ticket_id === flash)

  return (
    <div className="min-h-[100dvh] bg-brand-950 p-6 text-white lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <LogoMark className="size-14 rounded-2xl" />
          <div>
            <p className="text-3xl font-semibold tracking-[-0.02em]">HMO-Clinic</p>
            <p className="text-lg text-brand-200">{both('Now serving')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-5xl font-semibold tabular">{new Date(now).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
            <p className="text-lg text-brand-200">{new Date(now).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="hidden lg:block">
            <StatusBadge />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {flashTicket && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="mt-8 flex flex-wrap items-center justify-center gap-6 rounded-[2.5rem] bg-white px-8 py-8 text-brand-950 shadow-[0_0_80px_rgb(93_136_250/0.6)]">
            <SpeakerHigh size={56} weight="fill" className="text-brand-600" />
            <TicketNo ticket={flashTicket} size="xl" />
            <p className="text-4xl font-semibold">
              → {data.staff.find((s) => s.staff_id === flashTicket.doctor_id)?.room ?? 'Doctor'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {doctors.map((d) => {
          const current = q.active.find((t) => t.doctor_id === d.staff_id)
          return (
            <div key={d.staff_id} className={cn('rounded-[2rem] p-6 ring-1 ring-white/15', current && current.ticket_id === flash ? 'bg-brand-600' : 'bg-white/[0.06]')}>
              <p className="text-2xl font-semibold">{d.room}</p>
              <p className="text-lg text-brand-200">{d.name}</p>
              <div className="mt-5 flex min-h-28 items-center">
                {current ? (
                  <span className={cn('inline-grid h-28 min-w-[14rem] place-items-center rounded-3xl px-6 text-6xl font-semibold tabular', LANE_STYLE[current.category_id])}>{ticketLabel(current)}</span>
                ) : (
                  <span className="text-2xl text-brand-300">{both('Waiting')}…</span>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <section className="mt-8 rounded-[2rem] bg-white/[0.06] p-6 ring-1 ring-white/15">
        <p className="text-2xl font-semibold">{both('Next in line')}</p>
        <div className="mt-5 flex flex-wrap gap-4">
          <AnimatePresence initial={false}>
            {q.waiting.slice(0, 10).map((t) => (
              <motion.span layout key={t.ticket_id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className={cn('inline-grid h-20 min-w-[9rem] place-items-center rounded-2xl px-5 text-4xl font-semibold tabular', LANE_STYLE[t.category_id])}>
                {ticketLabel(t)}
              </motion.span>
            ))}
          </AnimatePresence>
          {q.waiting.length === 0 && <span className="text-2xl text-brand-300">{both('No one is waiting')}</span>}
        </div>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xl text-brand-100">
        <p>
          {'Please wait for your number to be called.'}
          <br />
          <span className="text-brand-300">{fil('Please wait for your number to be called.')}</span>
        </p>
        <div className="flex flex-wrap gap-3 text-lg">
          <span className="rounded-full bg-priority px-4 py-1.5 font-semibold">P · Pregnant, PWD, Senior</span>
          <span className="rounded-full bg-mist px-4 py-1.5 font-semibold text-ink">R · {both('Regular')}</span>
        </div>
      </footer>
    </div>
  )
}
