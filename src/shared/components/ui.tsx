import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, CheckCircle, WarningCircle, Info } from '@phosphor-icons/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type RefObject,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import type { AppointmentStatus } from '../../features/portal/data/types'
import { cn, initials } from '../lib/utils'

/* ---------------------------------- Button --------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'dark' | 'white' | 'onBrand'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-brand hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-brand-300 hover:text-brand-700',
  ghost: 'text-ink-2 hover:bg-mist hover:text-ink',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  danger: 'bg-danger-soft text-danger hover:bg-[#fbd9da]',
  dark: 'bg-brand-950 text-white hover:bg-brand-900',
  // For use on top of brand-600 surfaces
  white: 'bg-white text-brand-700 hover:bg-brand-50',
  onBrand: 'bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/20',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-[15px] gap-2.5',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  to?: string
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className, to, icon, iconRight, children, ...rest }: ButtonProps) {
  const cls = cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform,box-shadow] duration-200 active:scale-[0.98] disabled:active:scale-100',
    variants[variant],
    // Let a caller's own text size win over the size preset.
    className && /(^|\s)text-(xs|sm|base|lg|xl|\d?xl|\[)/.test(className) ? sizes[size].replace(/text-\S+/, '') : sizes[size],
    className,
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        {children}
        {iconRight}
      </Link>
    )
  }
  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition hover:border-brand-200 hover:text-brand-700 active:scale-95',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ----------------------------------- Card ---------------------------------- */

export function Card({ className, children, as: Tag = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cn('rounded-3xl border border-line bg-surface shadow-soft', className)}>{children}</Tag>
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ---------------------------------- Badge ---------------------------------- */

type Tone = 'brand' | 'ok' | 'warn' | 'danger' | 'neutral' | 'solid'

const tones: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  ok: 'bg-ok-soft text-ok ring-[#c6eedb]',
  warn: 'bg-warn-soft text-warn ring-[#fbe2b0]',
  danger: 'bg-danger-soft text-danger ring-[#f8cfd1]',
  neutral: 'bg-mist text-ink-2 ring-line',
  solid: 'bg-brand-600 text-white ring-brand-600',
}

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

const statusMap: Record<AppointmentStatus, { tone: Tone; label: string }> = {
  requested: { tone: 'warn', label: 'Requested' },
  confirmed: { tone: 'brand', label: 'Confirmed' },
  'checked-in': { tone: 'ok', label: 'Checked in' },
  'in-consult': { tone: 'solid', label: 'In consultation' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  'no-show': { tone: 'danger', label: 'No-show' },
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = statusMap[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

/* ---------------------------------- Avatar --------------------------------- */

const avatarSizes = { xs: 'size-7 text-[10px]', sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-14 text-base', xl: 'size-20 text-xl' }

export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string; size?: keyof typeof avatarSizes; className?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700 ring-2 ring-white',
        avatarSizes[size],
        className,
      )}
    >
      {src && !broken ? (
        <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

/* ---------------------------------- Forms ---------------------------------- */

/** Lets Input / Select / Textarea inside a Field pick up the label's id and the hint/error text without every call site wiring it. */
const FieldCtx = createContext<{ id: string; describedBy?: string } | null>(null)

export function Field({ label, hint, error, children, className, htmlFor, optional }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; htmlFor?: string; optional?: boolean }) {
  const auto = useId()
  const id = htmlFor ?? auto
  const noteId = `${id}-note`
  return (
    <FieldCtx.Provider value={{ id, describedBy: error || hint ? noteId : undefined }}>
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
        {optional && <span className="ml-1 font-normal text-faint">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={noteId} className="flex items-center gap-1 text-xs font-medium text-danger" role="alert">
          <WarningCircle size={14} weight="fill" /> {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
    </FieldCtx.Provider>
  )
}

const inputBase =
  'w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-faint transition focus:outline-none focus:ring-4 focus:ring-brand-200'

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const f = useContext(FieldCtx)
  return <input id={f?.id} aria-describedby={f?.describedBy} className={cn(inputBase, 'h-11', invalid ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-brand-500', className)} aria-invalid={invalid || undefined} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const f = useContext(FieldCtx)
  return <textarea id={f?.id} aria-describedby={f?.describedBy} className={cn(inputBase, 'min-h-24 resize-y border-line-strong py-3 leading-relaxed focus:border-brand-500', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const f = useContext(FieldCtx)
  return (
    <select
      id={f?.id}
      aria-describedby={f?.describedBy}
      className={cn(
        inputBase,
        'h-11 appearance-none border-line-strong bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27%235f6f8a%27 viewBox=%270 0 256 256%27%3E%3Cpath d=%27M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 focus:border-brand-500',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Chip({ selected, onClick, children, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition active:scale-[0.97]',
        selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-surface text-ink-2 hover:border-brand-300 hover:text-brand-700',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition', checked ? 'bg-brand-600' : 'bg-line-strong')}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

/* ---------------------------------- Tabs ----------------------------------- */

export function Tabs<T extends string>({ tabs, value, onChange, className, size = 'md' }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div role="tablist" className={cn('scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-mist/70 p-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors',
              size === 'sm' ? 'min-h-10 px-3 text-[13px]' : 'min-h-11 px-4 text-sm',
              active ? 'text-brand-700' : 'text-muted hover:text-ink',
            )}
          >
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 z-0 rounded-full bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className="relative z-10">{t.label}</span>
            {t.count !== undefined && (
              <span className={cn('relative z-10 rounded-full px-1.5 text-[11px] tabular', active ? 'bg-brand-50 text-brand-700' : 'bg-line text-muted')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ Modal & Drawer ----------------------------- */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Dialog keyboard behaviour: move focus into the panel when it opens (unless something inside
 * already took it, e.g. autoFocus), keep Tab inside it, and hand focus back to the opener on close.
 */
export function useDialogFocus(panel: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const el = panel.current
      if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()
    })
    const onKey = (e: KeyboardEvent) => {
      const el = panel.current
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const cur = document.activeElement
      if (!el.contains(cur)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (cur === first || cur === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [panel, active])
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion()
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <motion.div aria-hidden="true" className="absolute inset-0 bg-brand-950/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-4xl bg-surface shadow-lift sm:rounded-4xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
              </div>
              <IconButton label="Close" onClick={onClose} className="size-10 border-transparent bg-mist">
                <X size={16} />
              </IconButton>
            </div>
            <div className="scroll-thin overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-canvas/60 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------- Empty state ------------------------------- */

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-mist', className)} />
}

/* ---------------------------------- Toasts --------------------------------- */

type Toast = { id: number; title: string; body?: string; tone: 'ok' | 'warn' | 'info' }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((all) => [...all, { ...t, id }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4200)
  }, [])
  const icons = {
    ok: <CheckCircle size={20} weight="fill" className="text-ok" />,
    warn: <WarningCircle size={20} weight="fill" className="text-warn" />,
    info: <Info size={20} weight="fill" className="text-brand-600" />,
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift"
            >
              {icons[t.tone]}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-muted">{t.body}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/* ---------------------------------- Misc ----------------------------------- */

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function KeyValue({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{v}</dd>
    </div>
  )
}
