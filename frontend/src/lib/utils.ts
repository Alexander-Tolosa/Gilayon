export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const DAY = 86_400_000

/** ISO date (YYYY-MM-DD) offset from today. */
export function dayOffset(days: number) {
  const d = new Date(Date.now() + days * DAY)
  return toISODate(d)
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return toISODate(new Date())
}

export function parseISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return parseISO(iso).toLocaleDateString('en-US', opts)
}

export function fmtShort(iso: string) {
  return fmtDate(iso, { month: 'short', day: 'numeric' })
}

export function fmtWeekday(iso: string) {
  return fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function relDay(iso: string) {
  const diff = Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return `In ${diff} days`
  if (diff < -1 && diff > -30) return `${-diff} days ago`
  return fmtShort(iso)
}

export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`
}

export function fmtStamp(ts: number) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function firstName(name: string) {
  return name.replace(/^Dr\.\s*/, '').split(' ')[0]
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function downloadCSV(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const img = {
  unsplash: (id: string, w = 800, h?: number) =>
    `https://images.unsplash.com/${id}?w=${w}${h ? `&h=${h}&fit=crop` : ''}&q=70&auto=format`,
  portrait: (gender: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`,
}

export const PHOTOS = {
  doctorPhone: 'photo-1576091160399-112ba8d25d1d',
  doctorScan: 'photo-1666214280557-f1b5022eb634',
  consult: 'photo-1631217868264-e5b90bb7e133',
  stethoscopeBlue: 'photo-1638202993928-7267aad84c31',
  stethoscopeWhite: 'photo-1584982751601-97dcc096659c',
  drFemale: 'photo-1559839734-2b71ea197ec2',
  drMale: 'photo-1612349317150-e413f6a5b16d',
  nurse: 'photo-1622253692010-333f2da6031d',
  reception: 'photo-1519494026892-80bbd2d6fd0d',
  labTubes: 'photo-1581594693702-fbdc51b2763b',
  laptop: 'photo-1576091160550-2173dba999ef',
}
