import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, gt } from 'drizzle-orm'
import { session, staff } from '../../db/schema'
import { audit, HttpError, nowMs, type Actor } from './core'
import type { Db, Q } from './db'

const SESSION_MS = 12 * 60 * 60 * 1000
const GRACE_MS = 2 * 60_000

/** Minutes without activity before a screen locks (IDLE_MINUTES, default 15; 0 turns it off). */
export function idleMinutes(): number {
  const n = Number(process.env.IDLE_MINUTES ?? 15)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
const MAX_FAILS = 5
const LOCK_MS = 60_000

/* A 4-digit signing PIN has only 10,000 values, so wrong PINs lock signing for a while, as wrong passwords do. */
const MAX_PIN_FAILS = 5
const PIN_LOCK_MS = 5 * 60_000

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

// Failed sign-ins per account, in memory: enough to slow guessing on a single server process.
const g = globalThis as unknown as { __himsogFails?: Map<string, { n: number; until: number }>; __himsogPinFails?: Map<string, { n: number; until: number }> }
const fails = (g.__himsogFails ??= new Map())
const pinFails = (g.__himsogPinFails ??= new Map())

/** Refuses while this doctor's PIN is locked after too many wrong tries. */
export function assertPinUnlocked(staff_id: string) {
  const f = pinFails.get(staff_id)
  if (f && f.until > nowMs()) {
    const min = Math.ceil((f.until - nowMs()) / 60_000)
    throw new HttpError(429, `Too many wrong PINs. Signing is locked for ${min} more minute${min > 1 ? 's' : ''}.`)
  }
}

/** Counts a PIN attempt. Returns true when this wrong try has just locked signing. */
export function notePinAttempt(staff_id: string, ok: boolean): boolean {
  if (ok) {
    pinFails.delete(staff_id)
    return false
  }
  const n = (pinFails.get(staff_id)?.n ?? 0) + 1
  const locked = n >= MAX_PIN_FAILS
  pinFails.set(staff_id, { n: locked ? 0 : n, until: locked ? nowMs() + PIN_LOCK_MS : 0 })
  return locked
}

export const hashSecret = (s: string) => bcrypt.hash(s, 8)

export const MIN_PASSWORD = 8

/** One rule for every place a password is set. Returns a message when it is not acceptable. */
export function passwordProblem(pw: string, username?: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number.'
  if (username && pw.toLowerCase() === username.toLowerCase()) return 'The password cannot be your account name.'
  return null
}

export async function endSessions(q: Q, staff_id: string) {
  await q.delete(session).where(eq(session.staff_id, staff_id))
}

export async function login(db: Db, staff_id: string, password: string) {
  const f = fails.get(staff_id)
  if (f && f.until > nowMs()) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.')
  const [row] = await db.select().from(staff).where(eq(staff.staff_id, staff_id))
  // Deactivated accounts get the same answer as a wrong password, so the account list can't be probed.
  const ok = row && row.active ? await bcrypt.compare(password, row.password_hash) : false
  if (!row || !ok) {
    const n = (f?.n ?? 0) + 1
    fails.set(staff_id, { n, until: n >= MAX_FAILS ? nowMs() + LOCK_MS : 0 })
    if (row) await audit(db, staff_id, { action: 'flag', table: 'staff', record: staff_id, summary: 'Sign-in failed: incorrect password' })
    throw new HttpError(401, 'Incorrect account or password.')
  }
  fails.delete(staff_id)
  const token = randomBytes(32).toString('base64url')
  const now = nowMs()
  await db.insert(session).values({ token_hash: hash(token), staff_id, created_at: now, expires_at: now + SESSION_MS, last_seen_at: now })
  await audit(db, staff_id, { action: 'verify', table: 'user_account', record: staff_id, summary: 'Signed in' })
  return { token, staff_id, must_change_password: row.must_change_password, idle_minutes: idleMinutes() }
}

export async function logout(db: Db, token: string) {
  await db.delete(session).where(eq(session.token_hash, hash(token)))
}

/**
 * The browser sends a heartbeat while someone is actually using the screen; background refreshes
 * do not count. A session with no heartbeat for the idle time (plus a short grace) stops working.
 */
export async function heartbeat(q: Q, token: string) {
  await q.update(session).set({ last_seen_at: nowMs() }).where(eq(session.token_hash, hash(token)))
}

export async function actorFromToken(q: Q, token: string | null): Promise<Actor | null> {
  if (!token) return null
  const [row] = await q
    .select({ staff_id: staff.staff_id, name: staff.name, role: staff.role, license_no: staff.license_no, must_change_password: staff.must_change_password, created_at: session.created_at, last_seen_at: session.last_seen_at })
    .from(session)
    .innerJoin(staff, eq(staff.staff_id, session.staff_id))
    .where(and(eq(session.token_hash, hash(token)), gt(session.expires_at, nowMs()), eq(staff.active, true)))
  if (!row) return null
  const idle = idleMinutes()
  if (idle && nowMs() - (row.last_seen_at ?? row.created_at) > idle * 60_000 + GRACE_MS) return null
  return { staff_id: row.staff_id, name: row.name, role: row.role, license_no: row.license_no ?? undefined, must_change_password: row.must_change_password || undefined }
}

export function verifyPin(pin: string, pin_hash: string | null) {
  return !!pin_hash && bcrypt.compare(pin, pin_hash)
}
