import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

/** Himsog mark: a cobalt tile with a rounded medical cross. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-grid size-8 place-items-center rounded-[10px] bg-brand-600 shadow-brand', className)} aria-hidden>
      <span className="absolute h-[52%] w-[16%] rounded-full bg-white" />
      <span className="absolute h-[16%] w-[52%] rounded-full bg-white" />
    </span>
  )
}

export function Logo({ to = '/', className, light }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', className)} aria-label="Himsog home">
      <LogoMark />
      <span className={cn('text-[19px] font-semibold tracking-[-0.03em]', light ? 'text-white' : 'text-ink')}>
        himsog
      </span>
    </Link>
  )
}
