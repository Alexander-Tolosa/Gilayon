import { useId } from 'react'

/** Dependency-free sparkline for the marketing page, so the landing bundle stays light. */
export function MiniSpark({ data, height = 34 }: { data: number[]; height?: number }) {
  const id = useId().replace(/:/g, '')
  const w = 100
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, 4 + (1 - (v - min) / (max - min || 1)) * (height - 8)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`ms-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2350d6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2350d6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${height} L0 ${height} Z`} fill={`url(#ms-${id})`} />
      <path d={line} fill="none" stroke="#2350d6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
