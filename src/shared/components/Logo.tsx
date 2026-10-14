import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

/**
 * Gilayon mark:
 * Official cobalt tile emblem with stylized 'G', health cross, and flow chevrons.
 */
export function LogoMark({ className, alt = 'Gilayon' }: { className?: string; alt?: string }) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={64}
      height={64}
      decoding="async"
      loading="eager"
      className={cn('inline-block size-8 shrink-0 select-none object-contain', className)}
    />
  )
}

/**
 * Gilayon primary brand logo:
 * Emblem paired with the "Gilayon" wordmark.
 */
export function Logo({
  to = '/',
  className,
  markClassName,
  textClassName,
  light = false,
  showText = true,
}: {
  to?: string
  className?: string
  markClassName?: string
  textClassName?: string
  light?: boolean
  showText?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn('group inline-flex items-center gap-2.5 transition active:scale-[0.98]', className)}
      aria-label="Gilayon home"
    >
      <LogoMark className={cn('size-8 transition group-hover:scale-105', markClassName)} />
      {showText && (
        <span
          className={cn(
            'text-[20px] font-bold tracking-[-0.02em] transition',
            light ? 'text-white' : 'text-ink',
            textClassName
          )}
        >
          Gilayon
        </span>
      )}
    </Link>
  )
}
