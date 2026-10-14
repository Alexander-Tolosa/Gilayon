import { useId } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const BRAND = '#2350d6'
const SKY = '#8cc8fb'
const GRID = '#e3eaf6'
const AXIS = '#8a98b1'

export function Sparkline({ data, color = BRAND, height = 40 }: { data: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, '')
  const rows = data.map((v, i) => ({ i, v }))
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pad = (max - min || 1) * 0.15
  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-semibold text-ink">{p.value}{unit ? ` ${unit}` : ''}</span>
        </p>
      ))}
    </div>
  )
}

export type Series = { key: string; name: string; color?: string; dashed?: boolean }

export function TrendChart({ data, series, xKey = 'label', unit, goal, height = 240, domain }: { data: Record<string, string | number | undefined>[]; series: Series[]; xKey?: string; unit?: string; goal?: { value: number; label: string }; height?: number; domain?: [number | string, number | string] }) {
  const palette = [BRAND, SKY, '#1b3687']
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} domain={domain ?? ['auto', 'auto']} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
          {goal && (
            <ReferenceLine y={goal.value} stroke="#0f9d68" strokeDasharray="5 5" label={{ value: goal.label, position: 'insideTopRight', fill: '#0f9d68', fontSize: 11 }} />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? palette[i % palette.length]}
              strokeWidth={2.25}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              dot={false}
              connectNulls
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function VolumeBars({ data, height = 220, xKey = 'label', series }: { data: Record<string, string | number>[]; height?: number; xKey?: string; series: Series[] }) {
  const palette = [BRAND, SKY]
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }} barGap={4}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef3fc' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? palette[i % palette.length]} radius={[6, 6, 6, 6]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Small decorative bar strip used inside KPI tiles (mirrors the reference dashboards). */
export function MiniBars({ values, highlight }: { values: number[]; highlight?: number }) {
  const max = Math.max(...values)
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={i === (highlight ?? values.length - 1) ? 'rounded-[3px] bg-brand-600' : 'rounded-[3px] bg-brand-100'}
          style={{ height: `${Math.max(12, (v / max) * 100)}%`, width: 6 }}
        />
      ))}
    </div>
  )
}
