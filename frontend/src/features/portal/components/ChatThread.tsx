import { LockKey, PaperPlaneRight } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cn, fmtClock, fmtStamp } from '../../../shared/lib/utils'
import { useStore } from '../store/store'
import { Avatar } from '../../../shared/components/ui'

/** Secure two-way thread between a patient and the care team. `viewer` decides which side is "mine". */
export function ChatThread({ patientId, viewer, authorName, className, autoReply }: { patientId: string; viewer: 'patient' | 'care-team'; authorName: string; className?: string; autoReply?: boolean }) {
  const { messages, sendMessage, patients, doctors } = useStore()
  const thread = messages.filter((m) => m.patientId === patientId).sort((a, b) => a.at - b.at)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const patient = patients.find((p) => p.id === patientId)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread.length, typing])

  const send = (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const body = (preset ?? text).trim()
    if (!body) return
    sendMessage(patientId, viewer, authorName, body)
    setText('')
    if (autoReply && viewer === 'patient') {
      setTyping(true)
      setTimeout(() => {
        setTyping(false)
        sendMessage(patientId, 'care-team', 'Joanna Reyes · Front desk', "Thanks for your message. I've passed it to your doctor and we'll reply within one business day. For emergencies, call 911.")
      }, 1800)
    }
  }

  const photoFor = (author: string) => {
    if (author === patient?.name) return patient.photo
    return doctors.find((d) => author.startsWith(d.name))?.photo
  }

  const quick = viewer === 'patient' ? ['Can I get a refill?', 'Question about my lab result', 'I need to reschedule'] : ['Your results are normal.', 'Please book a follow-up visit.', 'Prescription sent to your pharmacy.']

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs text-muted">
          <LockKey size={12} weight="fill" /> Messages are encrypted and saved to the record
        </p>
        {thread.map((m, i) => {
          const mine = m.from === viewer
          const showMeta = i === 0 || thread[i - 1].author !== m.author || m.at - thread[i - 1].at > 30 * 60_000
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
              <div className="w-8 shrink-0">{showMeta && !mine && <Avatar name={m.author} src={photoFor(m.author)} size="sm" />}</div>
              <div className={cn('flex max-w-[78%] flex-col', mine && 'items-end')}>
                {showMeta && (
                  <p className="mb-1 px-1 text-xs text-muted">
                    {mine ? 'You' : m.author} · {fmtStamp(m.at)}
                  </p>
                )}
                <div className={cn('rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed', mine ? 'rounded-br-lg bg-brand-600 text-white' : 'rounded-bl-lg bg-mist text-ink')}>{m.text}</div>
                {!showMeta && <span className="mt-0.5 px-1 text-[11px] text-faint">{fmtClock(m.at)}</span>}
              </div>
            </motion.div>
          )
        })}
        <AnimatePresence>
          {typing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 pl-10">
              <span className="flex gap-1 rounded-full bg-mist px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <motion.span key={d} className="size-1.5 rounded-full bg-muted" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
      <div className="border-t border-line p-3 sm:p-4">
        <div className="scrollbar-none mb-2 flex gap-2 overflow-x-auto">
          {quick.map((q) => (
            <button key={q} onClick={() => send(undefined, q)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:border-brand-300 hover:text-brand-700">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={send} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" aria-label="Message" className="h-12 flex-1 rounded-full border border-line-strong bg-surface px-5 text-[15px] placeholder:text-faint focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <button type="submit" aria-label="Send" disabled={!text.trim()} className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-brand transition hover:bg-brand-700 active:scale-95 disabled:bg-brand-200 disabled:shadow-none">
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  )
}
