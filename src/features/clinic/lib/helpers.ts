import type { CategoryKey, PriorityCategory, QueueTicket } from '../types'

export const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

/** Age in whole years, calculated from the birthdate. Goes up on the exact birthday. */
export function ageOf(birthdate: string, on = new Date()) {
  const [y, m, d] = birthdate.split('-').map(Number)
  let age = on.getFullYear() - y
  const beforeBirthday = on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)
  if (beforeBirthday) age--
  return age
}

export const isSenior = (birthdate: string) => ageOf(birthdate) >= 60

export const DEFAULT_CATEGORIES: PriorityCategory[] = [
  { category_id: 'urgent', name: 'Urgent', rank: 1 },
  { category_id: 'pregnant', name: 'Pregnant', rank: 2 },
  { category_id: 'pwd', name: 'PWD', rank: 2 },
  { category_id: 'senior', name: 'Senior', rank: 2 },
  { category_id: 'regular', name: 'Regular', rank: 3 },
]

/** The ticket takes the highest-ranked (lowest number) category that applies. */
export function topCategory(cats: CategoryKey[], table: PriorityCategory[]): CategoryKey {
  const applicable = cats.length ? cats : (['regular'] as CategoryKey[])
  return [...applicable].sort((a, b) => rankOf(a, table) - rankOf(b, table))[0]
}

export const rankOf = (c: CategoryKey, table: PriorityCategory[]) => table.find((t) => t.category_id === c)?.rank ?? 3

/** Waiting list order: rank first, then first come, first served. */
export function rankTickets(tickets: QueueTicket[], table: PriorityCategory[]) {
  return [...tickets].sort((a, b) => rankOf(a.category_id, table) - rankOf(b.category_id, table) || a.checked_in_at - b.checked_in_at)
}

export const LANE_LETTER: Record<CategoryKey, string> = { urgent: 'U', pregnant: 'P', pwd: 'P', senior: 'P', regular: 'R' }

export const ticketLabel = (t: Pick<QueueTicket, 'category_id' | 'queue_no'>) => `${LANE_LETTER[t.category_id]}-${String(t.queue_no).padStart(3, '0')}`

export const LANE_STYLE: Record<CategoryKey, string> = {
  urgent: 'bg-danger text-white',
  pregnant: 'bg-priority text-white',
  pwd: 'bg-priority text-white',
  senior: 'bg-priority text-white',
  regular: 'bg-mist text-ink ring-1 ring-inset ring-line-strong',
}

export function minutesBetween(a: number, b: number) {
  return Math.max(0, Math.round((b - a) / 60_000))
}

export function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/* --------------------------- Typo-tolerant search -------------------------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function trigrams(s: string) {
  const t = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3))
  return out
}

/** Similarity in [0, 1] using trigram overlap, the same idea as PostgreSQL pg_trgm. */
export function similarity(a: string, b: string) {
  const A = trigrams(norm(a))
  const B = trigrams(norm(b))
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter || 1)
}

/** Scores a query against a name and id. Exact id or substring matches rank highest, then typo-tolerant name matches. */
export function matchScore(query: string, name: string, ids: string[]) {
  const q = norm(query)
  if (!q) return 0
  const n = norm(name)
  if (ids.some((id) => norm(id) === q)) return 2
  if (ids.some((id) => norm(id).includes(q))) return 1.5
  if (n.includes(q)) return 1.2
  // Match each query word against the best name word, so "jose dlcruz" finds "Jose Dela Cruz".
  const qWords = q.split(' ')
  const nWords = n.split(' ')
  const perWord = qWords.map((w) => Math.max(...nWords.map((nw) => (nw.startsWith(w) ? 1 : similarity(w, nw)))))
  const words = perWord.reduce((a, b) => a + b, 0) / perWord.length
  return Math.max(words, similarity(q, n))
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A name reduced to its letters for comparing what the desk typed with the record. Accents are folded
 * first, so "Bañas" and "Banas" compare equal instead of "ñ" being dropped ("baas").
 */
export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

export function dayKeyOffset(days: number) {
  return todayKey(new Date(Date.now() + days * 86_400_000))
}

export function fmtDay(iso: string, lang: 'en' | 'fil' = 'en') {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'fil' ? 'fil-PH' : 'en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTimeOf(ts: number) {
  return new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function fmtStampOf(ts: number) {
  return new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Deterministic PRNG so the synthetic seed looks the same on every machine. */
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Compress an uploaded image (scan) to a JPEG data URL so it fits in browser storage. */
export function compressImage(file: File, maxSide = 1100, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Not an image'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
