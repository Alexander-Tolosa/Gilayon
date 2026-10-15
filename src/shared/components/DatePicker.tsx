import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'

/*
  A date field with a calendar big enough to use. The browser's own calendar is drawn by the operating
  system at a fixed small size that no style can change (and the page's Zoom does not reach it), which
  made it hard to hit a date on a phone or for older staff. The typing boxes stay the browser's own,
  so a birthdate can still be typed; only the calendar that opens from the button is ours.
  Everything is in rem, so the Zoom control scales it with the rest of the screen.
*/

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

type Ymd = { y: number; m: number; d: number } // m is 0-11, as in Date

const parse = (v: string | undefined): Ymd | null => {
  const g = v ? ISO.exec(v) : null
  if (!g) return null
  const out = { y: Number(g[1]), m: Number(g[2]) - 1, d: Number(g[3]) }
  // 2026-02-31 is not a date: reject it rather than let the calendar drift to March.
  return new Date(out.y, out.m, out.d).getMonth() === out.m ? out : null
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const toIso = (x: Ymd) => `${pad(x.y, 4)}-${pad(x.m + 1)}-${pad(x.d)}`
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const cmp = (a: Ymd, b: Ymd) => a.y - b.y || a.m - b.m || a.d - b.d
const shift = (x: Ymd, days: number): Ymd => {
  const d = new Date(x.y, x.m, x.d + days)
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }
}
const todayYmd = (): Ymd => {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}

/** Width classes belong to the whole field (input plus button), everything else to the input itself. */
const splitClasses = (className?: string) => {
  const all = (className ?? '').split(/\s+/).filter(Boolean)
  const isWidth = (c: string) => /^(?:[a-z0-9]+:)*(?:min-|max-)?w-/.test(c)
  return { box: all.filter(isWidth).join(' '), input: all.filter((c) => !isWidth(c)).join(' ') }
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max'> & { value?: string; min?: string; max?: string; invalid?: boolean; base: string }

export function DatePicker({ value = '', min, max, onChange, className, id, disabled, base, invalid, ...rest }: Props) {
  const panelId = useId()
  const input = useRef<HTMLInputElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const lo = parse(min)
  const hi = parse(max)
  const chosen = parse(value)
  const [cursor, setCursor] = useState<Ymd>(() => chosen ?? todayYmd()) // the day that has keyboard focus, and so the month on show
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null)
  const { box, input: inputCls } = splitClasses(className)

  const out = (x: Ymd) => !!(lo && cmp(x, lo) < 0) || !!(hi && cmp(x, hi) > 0)
  const today = todayYmd()
  const minYear = lo?.y ?? 1900
  const maxYear = hi?.y ?? today.y + 10

  /** Tells the form the way a typed change would, so callers keep reading `e.target.value`. */
  const emit = (v: string) => {
    const fake = { target: { value: v, id, name: rest.name }, currentTarget: { value: v, id, name: rest.name } }
    onChange?.(fake as unknown as ChangeEvent<HTMLInputElement>)
  }

  const show = () => {
    const c = parse(value) ?? today
    // Open on the chosen day; if that is out of range (or nothing is chosen), on the nearest allowed one.
    setCursor(lo && cmp(c, lo) < 0 ? lo : hi && cmp(c, hi) > 0 ? hi : c)
    setOpen(true)
  }
  const close = useCallback((refocus = true) => {
    setOpen(false)
    setSpot(null)
    if (refocus) toggle.current?.focus()
  }, [])

  // Place the calendar under the field, or above it when there is no room, and on a phone as a sheet at the bottom.
  const place = useCallback(() => {
    const r = input.current?.getBoundingClientRect()
    const w = panel.current?.offsetWidth ?? 352
    const h = panel.current?.offsetHeight ?? 420
    if (!r) return
    // Under the field if it fits, else above it; failing both, slide it up just far enough to sit inside the window.
    const under = r.bottom + 8
    const over = r.top - h - 8
    const top = under + h <= window.innerHeight - 8 ? under : over >= 8 ? over : Math.max(8, window.innerHeight - h - 8)
    setSpot({ top, left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8)) })
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  // Click outside closes it. Escape closes only the calendar, never the dialog the field may sit in.
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !toggle.current?.contains(t)) close(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [open, close])

  // Put keyboard focus on the day when it opens, and keep it on the day as the arrows move it.
  // (Waits for the calendar to be placed: a hidden element cannot take focus.)
  useEffect(() => {
    if (!open || !spot) return
    const here = document.activeElement as HTMLElement | null
    // Only when focus is outside the calendar (it just opened) or already on a day: not while the month or year list is in use.
    if (here && panel.current?.contains(here) && !here.matches('button[data-day]')) return
    panel.current?.querySelector<HTMLButtonElement>('button[data-day][tabindex="0"]')?.focus()
  }, [open, spot, cursor])

  const pick = (x: Ymd) => {
    if (out(x)) return
    emit(toIso(x))
    close()
  }

  const move = (to: Ymd) => {
    const clamped = lo && cmp(to, lo) < 0 ? lo : hi && cmp(to, hi) > 0 ? hi : to
    setCursor(clamped)
  }
  const month = (by: number) => {
    const first = new Date(cursor.y, cursor.m + by, 1)
    const d = Math.min(cursor.d, daysIn(first.getFullYear(), first.getMonth()))
    move({ y: first.getFullYear(), m: first.getMonth(), d })
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    // The dialog's focus trap listens for Tab on the page; inside the calendar Tab stays here.
    if (e.key === 'Tab') return e.stopPropagation()
    const steps: Record<string, () => void> = {
      ArrowLeft: () => move(shift(cursor, -1)),
      ArrowRight: () => move(shift(cursor, 1)),
      ArrowUp: () => move(shift(cursor, -7)),
      ArrowDown: () => move(shift(cursor, 7)),
      Home: () => move(shift(cursor, -new Date(cursor.y, cursor.m, cursor.d).getDay())),
      End: () => move(shift(cursor, 6 - new Date(cursor.y, cursor.m, cursor.d).getDay())),
      PageUp: () => month(e.shiftKey ? -12 : -1),
      PageDown: () => month(e.shiftKey ? 12 : 1),
    }
    const go = steps[e.key]
    if (!go || (e.target as HTMLElement).tagName === 'SELECT') return
    e.preventDefault()
    go()
  }

  const lead = new Date(cursor.y, cursor.m, 1).getDay()
  const cells: (Ymd | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn(cursor.y, cursor.m) }, (_, i) => ({ y: cursor.y, m: cursor.m, d: i + 1 }))]
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i) // newest first: birth years are far back, so the list opens near the top
  const sel = 'h-12 rounded-xl border border-line-strong bg-surface px-2 text-base font-semibold sm:px-3 text-ink focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-200'
  const arrow = 'grid size-11 shrink-0 sm:size-12 place-items-center rounded-xl border border-line-strong bg-surface text-ink transition hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-35'
  const prevOk = !lo || cmp({ y: cursor.y, m: cursor.m, d: 1 }, lo) > 0
  const nextOk = !hi || cmp({ y: cursor.y, m: cursor.m, d: daysIn(cursor.y, cursor.m) }, hi) < 0

  return (
    <span className={cn('relative block', box || 'w-full')}>
      <input
        {...rest}
        ref={input}
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={onChange}
        aria-invalid={invalid || undefined}
        className={cn(base, 'date-input w-full pr-14', invalid ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-brand-500', inputCls)}
      />
      <button
        ref={toggle}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        aria-label="Open the calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-40"
      >
        <CalendarBlank size={22} weight="bold" />
      </button>
      {open &&
        createPortal(
          <>
            {/* On a phone the calendar is a sheet at the bottom, so the page behind it is dimmed. */}
            <div aria-hidden="true" className="fixed inset-0 z-[70] bg-brand-950/30 sm:hidden" />
            <div
              ref={panel}
              id={panelId}
              role="dialog"
              aria-label="Choose a date"
              onKeyDown={onKeyDown}
              style={spot ? { top: spot.top, left: spot.left } : { visibility: 'hidden' }}
              className="fixed inset-x-3 bottom-3 z-[71] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-lift max-sm:!top-auto max-sm:!left-3 sm:inset-x-auto sm:bottom-auto sm:w-[22rem]"
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button type="button" className={arrow} disabled={!prevOk} onClick={() => month(-1)} aria-label="Previous month">
                  <CaretLeft size={20} weight="bold" />
                </button>
                <select aria-label="Month" className={cn(sel, 'min-w-0 flex-1')} value={cursor.m} onChange={(e) => move({ ...cursor, m: Number(e.target.value), d: Math.min(cursor.d, daysIn(cursor.y, Number(e.target.value))) })}>
                  {MONTHS.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
                <select aria-label="Year" className={cn(sel, 'w-[5rem] shrink-0 sm:w-[5.5rem]')} value={cursor.y} onChange={(e) => move({ ...cursor, y: Number(e.target.value), d: Math.min(cursor.d, daysIn(Number(e.target.value), cursor.m)) })}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button type="button" className={arrow} disabled={!nextOk} onClick={() => month(1)} aria-label="Next month">
                  <CaretRight size={20} weight="bold" />
                </button>
              </div>

              <div role="grid" aria-label={`${MONTHS[cursor.m]} ${cursor.y}`} className="mt-3">
                <div role="row" className="grid grid-cols-7 text-center text-sm font-semibold text-muted">
                  {WEEKDAYS.map((w) => (
                    <span key={w} role="columnheader" className="py-1.5">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {cells.map((c, i) => {
                    if (!c) return <span key={`blank-${i}`} />
                    const isChosen = !!chosen && cmp(c, chosen) === 0
                    const isToday = cmp(c, today) === 0
                    const isCursor = c.d === cursor.d
                    const blocked = out(c)
                    return (
                      <button
                        key={c.d}
                        type="button"
                        role="gridcell"
                        data-day=""
                        tabIndex={isCursor ? 0 : -1}
                        disabled={blocked}
                        aria-selected={isChosen}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={`${MONTHS[c.m]} ${c.d}, ${c.y}`}
                        onClick={() => pick(c)}
                        className={cn(
                          'grid h-12 w-full place-items-center rounded-xl text-base font-medium tabular transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300',
                          isChosen ? 'bg-brand-600 font-semibold text-white shadow-sm' : blocked ? 'text-faint/60' : 'text-ink hover:bg-brand-50',
                          isToday && !isChosen && 'ring-2 ring-inset ring-brand-400',
                          blocked && 'pointer-events-none line-through decoration-faint/40',
                        )}
                      >
                        {c.d}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  disabled={out(today)}
                  onClick={() => pick(today)}
                  className="h-11 rounded-xl px-4 text-base font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-35"
                >
                  Today
                </button>
                {value && !rest.required && (
                  <button
                    type="button"
                    onClick={() => {
                      emit('')
                      close()
                    }}
                    className="h-11 rounded-xl px-4 text-base font-semibold text-muted transition hover:bg-mist focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </span>
  )
}
