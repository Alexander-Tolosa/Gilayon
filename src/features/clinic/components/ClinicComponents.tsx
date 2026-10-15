import { CloudSlash, Lock, ShieldCheck, WifiHigh, WifiSlash, Desktop, ArrowsClockwise } from '@phosphor-icons/react'
import '@fontsource/allura'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { authedBlobUrl } from '../lib/api'
import { fil, setLang, useLang, useT } from '../lib/i18n'
import { LANE_STYLE, ageOf, fmtStampOf, ticketLabel } from '../lib/helpers'
import { TEXT_KEY, TEXT_SIZES, applyTextSize, savedTextSize, type TextSize } from '../lib/textsize'
import { useClinic } from '../store/store'
import type { CategoryKey, NetworkMode, QueueTicket, Staff } from '../types'

/* ------------------------------- Status badge ------------------------------ */

const NET: Record<NetworkMode, { label: string; dot: string; ring: string; icon: ReactNode }> = {
  online: { label: 'Online', dot: 'bg-ok', ring: 'bg-ok-soft text-ok ring-[#c6eedb]', icon: <WifiHigh size={18} weight="bold" /> },
  lan: { label: 'Clinic network only', dot: 'bg-warn', ring: 'bg-warn-soft text-warn ring-[#fbe2b0]', icon: <CloudSlash size={18} weight="bold" /> },
  offline: { label: 'Offline, saved on this computer', dot: 'bg-danger', ring: 'bg-danger-soft text-danger ring-[#f8cfd1]', icon: <WifiSlash size={18} weight="bold" /> },
}

/** Shown on every clinic screen so staff never have to guess whether something saved. */
export function StatusBadge() {
  const { network, setNetwork, pending, data } = useClinic()
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const n = NET[network]
  const waiting = pending.length + (network === 'lan' ? data.offsite.pending : 0)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn('inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold ring-1 ring-inset transition', n.ring)}>
        {n.icon}
        <span className="hidden sm:inline">{t(n.label)}</span>
        {pending.length > 0 && <span className="rounded-full bg-danger px-2 text-sm text-white tabular">{pending.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 top-14 z-50 w-[22rem] rounded-3xl border border-line bg-surface p-4 shadow-lift">
            <p className="text-base font-semibold">{t('Connection')}</p>
            <p className="mt-1 text-sm text-muted">
              {network === 'online' && 'Connected to the clinic server and the internet. Off-site backup is up to date.'}
              {network === 'lan' && `The internet is down. Everything in the clinic still works. ${data.offsite.pending} changes wait for the off-site backup.`}
              {network === 'offline' && `This computer cannot reach the clinic server. Notes are saved here and sync when it reconnects. Queue numbers and signing need the server. ${pending.length} ${t('waiting to sync')}.`}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Demo: simulate this computer's connection</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {(Object.keys(NET) as NetworkMode[]).map((m) => (
                <button key={m} onClick={() => setNetwork(m)} className={cn('flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition', network === m ? 'bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-200' : 'hover:bg-mist')}>
                  <span className={cn('size-2.5 rounded-full', NET[m].dot)} />
                  {m === 'online' ? 'Online' : m === 'lan' ? 'Internet down (clinic network only)' : 'This computer disconnected'}
                </button>
              ))}
            </div>
            {waiting > 0 && network !== 'offline' && (
              <Button size="sm" variant="soft" className="mt-3 w-full" icon={<ArrowsClockwise size={16} />} onClick={() => setNetwork('online')}>
                Sync now
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <div className={cn('flex rounded-full border border-line-strong bg-surface p-1', className)} role="group" aria-label="Language">
      {(['en', 'fil'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={cn('h-9 rounded-full px-3.5 text-[15px] font-semibold transition', lang === l ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-mist')}>
          {l === 'en' ? 'EN' : 'FIL'}
        </button>
      ))}
    </div>
  )
}

/** A / A+ / A++ on every clinic screen, for senior staff (concept: large text, big buttons). */
export function TextSizeSwitch({ className }: { className?: string }) {
  const [size, setSize] = useState<TextSize>(savedTextSize)
  const pick = (s: TextSize) => {
    setSize(s)
    applyTextSize(s)
    try {
      localStorage.setItem(TEXT_KEY, s)
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  }
  return (
    <div className={cn('hidden rounded-full border border-line-strong bg-surface p-1 sm:flex', className)} role="group" aria-label="Text size">
      {TEXT_SIZES.map((s) => (
        <button key={s.key} onClick={() => pick(s.key)} aria-pressed={size === s.key} aria-label={s.name} title={s.name} className={cn('h-9 min-w-10 rounded-full px-2.5 text-[15px] font-semibold transition', size === s.key ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-mist')}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------- Badges --------------------------------- */

export function LaneBadge({ category, className }: { category: CategoryKey; className?: string }) {
  const t = useT()
  const label = { urgent: 'Urgent', pregnant: 'Pregnant', pwd: 'PWD', senior: 'Senior', regular: 'Regular' }[category]
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold', LANE_STYLE[category], className)}>{t(label)}</span>
}

export function TicketNo({ ticket, size = 'md' }: { ticket: Pick<QueueTicket, 'category_id' | 'queue_no'>; size?: 'md' | 'lg' | 'xl' }) {
  return (
    <span className={cn('inline-grid place-items-center rounded-2xl font-semibold tabular tracking-tight', LANE_STYLE[ticket.category_id], size === 'md' && 'h-12 min-w-[5.5rem] px-3 text-xl', size === 'lg' && 'h-16 min-w-[7.5rem] px-4 text-3xl', size === 'xl' && 'h-28 min-w-[14rem] px-6 text-6xl')}>
      {ticketLabel(ticket)}
    </span>
  )
}

export function StatusPill({ status }: { status: QueueTicket['status'] }) {
  const t = useT()
  const map = {
    waiting: ['Waiting', 'bg-brand-50 text-brand-800'],
    called: ['Called', 'bg-warn-soft text-warn'],
    in_consult: ['In consultation', 'bg-brand-600 text-white'],
    done: ['Done', 'bg-ok-soft text-ok'],
    left: ['Left without being seen', 'bg-danger-soft text-danger'],
  } as const
  const [label, cls] = map[status]
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold', cls)}>{t(label)}</span>
}

/** "Name, 58 · F" line used everywhere a patient appears. Age is always calculated. */
export function AgeSex({ birthdate, sex }: { birthdate: string; sex: string }) {
  const t = useT()
  return (
    <span className="tabular">
      {ageOf(birthdate)} {t('yrs')} · {t(sex)}
    </span>
  )
}

/* ---------------------------------- Signing -------------------------------- */

/** The doctor's stored signature: the drawn image if there is one, otherwise a script rendering of the name. */
export function Signature({ staff, className }: { staff: Staff; className?: string }) {
  if (staff.signature_image) return <img src={staff.signature_image} alt={`Signature of ${staff.name}`} className={cn('h-14 w-auto object-contain', className)} />
  return (
    <span className={cn('block text-[2.1rem] leading-none text-brand-900', className)} style={{ fontFamily: 'Allura, cursive' }}>
      {staff.name.replace(/^Dr\.\s*/, '')}
    </span>
  )
}

export function PinModal({ open, onClose, onSubmit, title, children }: { open: boolean; onClose: () => void; onSubmit: (pin: string) => Promise<'ok' | 'bad-pin' | 'offline'>; title: string; children?: ReactNode }) {
  const t = useT()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const submit = async (value: string) => {
    const r = await onSubmit(value)
    if (r === 'ok') {
      setPin('')
      setError('')
      onClose()
    } else {
      setError(r === 'bad-pin' ? 'Incorrect PIN. Try again.' : 'This computer is offline. Documents stay drafts marked "not yet signed" until it reconnects.')
      setPin('')
    }
  }
  const press = (d: string) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) setTimeout(() => submit(next), 120)
  }
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={t('Enter your PIN')}>
      {children}
      <div className="mt-2 flex justify-center gap-3" aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('size-5 rounded-full border-2', i < pin.length ? 'border-brand-600 bg-brand-600' : 'border-line-strong')} />
        ))}
      </div>
      {error && <p className="mt-3 text-center text-[15px] font-semibold text-danger">{error}</p>}
      <div className="mx-auto mt-5 grid max-w-xs grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) => (
          <button
            key={k || 'blank'}
            disabled={!k}
            onClick={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : press(k))}
            className={cn('h-16 rounded-2xl text-2xl font-semibold tabular transition active:scale-95', k ? 'bg-mist text-ink hover:bg-brand-50' : 'invisible')}
          >
            {k}
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted">
        <Lock size={14} weight="fill" /> Demo PIN for every doctor: 1234
      </p>
    </Modal>
  )
}

/* ------------------------------ Letterhead print --------------------------- */

/** Letterhead used on prescriptions, certificates, summaries and the daily report. Details come from Settings. */
export function Letterhead({ children, footer, watermark }: { children: ReactNode; footer?: ReactNode; watermark?: string }) {
  const { clinic } = useClinic().data
  const contact = [clinic.contact, clinic.license_no && `License No. ${clinic.license_no}`].filter(Boolean).join(' · ')
  return (
    <div className="print-page relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white px-[14mm] py-[12mm] text-[11pt] leading-snug text-black shadow-lift print:shadow-none">
      {watermark && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[64pt] font-bold uppercase tracking-widest text-black/[0.06] [transform:rotate(-24deg)]">{watermark}</div>}
      <header className="flex items-center gap-4 border-b-2 border-brand-700 pb-3">
        {clinic.logo ? (
          <img src={clinic.logo} alt="" className="size-14 object-contain" />
        ) : (
          <img src="/logo.png" alt="" className="size-14 object-contain" />
        )}
        <div className="flex-1 text-center">
          {clinic.header && <p className="text-[9pt] uppercase tracking-[0.18em]">{clinic.header}</p>}
          <p className="text-[14pt] font-bold uppercase text-brand-800">{clinic.name}</p>
          <p className="text-[9pt]">{[clinic.office, clinic.address].filter(Boolean).join(' · ')}</p>
          {contact && <p className="text-[9pt]">{contact}</p>}
        </div>
        <span className="w-14" />
      </header>
      <div className="relative">{children}</div>
      {footer && <footer className="relative mt-6 border-t border-black/20 pt-2 text-[8pt] text-black/70">{footer}</footer>}
    </div>
  )
}

export function SignatureBlock({ staff, signed, documentNo, issuedAt }: { staff: Staff; signed: boolean; documentNo?: string; issuedAt?: number }) {
  return (
    <div className="mt-10 flex items-end justify-between gap-6">
      <div className="text-[9pt]">
        {documentNo && (
          <p>
            Document no. <span className="font-mono font-bold text-danger">{documentNo}</span>
          </p>
        )}
        {issuedAt && <p>Signed {fmtStampOf(issuedAt)}</p>}
        {!signed && <p className="mt-1 inline-block rounded border border-danger px-2 py-0.5 font-bold uppercase text-danger">Not yet signed · {fil('Not yet signed')}</p>}
      </div>
      <div className="w-72 text-center">
        <div className="flex h-16 items-end justify-center">{signed && <Signature staff={staff} />}</div>
        <p className="border-t border-black pt-1 font-bold uppercase">{staff.name}</p>
        <p className="text-[9pt]">{staff.title}</p>
        <p className="text-[9pt]">PRC License No. {staff.license_no}</p>
        <p className="text-[9pt]">PTR No. {staff.ptr_no}</p>
      </div>
    </div>
  )
}

/* ------------------------------- Sample scans ------------------------------ */

/** A scan kept on the clinic server: fetched with the sign-in token, shown from memory. */
function ProtectedImage({ path, className }: { path: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    authedBlobUrl(path).then((u) => live && setSrc(u), () => live && setFailed(true))
    return () => {
      live = false
    }
  }, [path])
  if (failed) return <div className={cn('grid place-items-center bg-mist p-4 text-center text-sm text-muted', className)}>Scan could not be loaded</div>
  if (!src) return <div className={cn('animate-pulse bg-mist', className)} aria-busy="true" />
  return <img src={src} alt="Scanned page" className={cn('object-contain', className)} />
}

/** Placeholder image for seeded "old paper" pages. Real uploads are shown as the uploaded image. */
export function ScanImage({ file, className }: { file: string; className?: string }) {
  if (file.startsWith('/api/')) return <ProtectedImage path={file} className={className} />
  if (!file.startsWith('sample:')) return <img src={file} alt="Scanned page" className={cn('object-contain', className)} />
  const n = Number(file.split(':')[1])
  const lines = Array.from({ length: 14 }, (_, i) => i)
  return (
    <svg viewBox="0 0 300 400" className={className} role="img" aria-label="Sample scan of an old paper page">
      <rect width="300" height="400" fill="#f4efe2" />
      <rect x="10" y="10" width="280" height="380" fill="none" stroke="#c9bfa6" />
      <text x="150" y="38" textAnchor="middle" fontSize="13" fontWeight="700" fill="#4a463d">
        {['PATIENT CHART', 'LABORATORY RESULT', 'PRESCRIPTION'][n] ?? 'RECORD'}
      </text>
      <text x="150" y="54" textAnchor="middle" fontSize="8" fill="#7a7466">
        HMO-Clinic · sample scan (synthetic)
      </text>
      {lines.map((i) => (
        <g key={i}>
          <line x1="24" x2="276" y1={80 + i * 22} y2={80 + i * 22} stroke="#d8cfb8" />
          <path d={`M28 ${76 + i * 22} q 12 -6 24 0 t 24 0 t 24 0 t ${20 + ((i * 37 + n * 13) % 70)} 0`} fill="none" stroke="#2f3f79" strokeWidth="1.3" opacity={i % 5 === 4 ? 0 : 0.75} />
        </g>
      ))}
      <text x="230" y="380" fontSize="9" fill="#7a7466" fontStyle="italic">
        p. {n + 1}
      </text>
    </svg>
  )
}

export function Shield({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
      <ShieldCheck size={16} weight="fill" className="text-brand-600" /> {children}
    </span>
  )
}

export function ComputerTag() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-faint">
      <Desktop size={12} /> this computer
    </span>
  )
}
