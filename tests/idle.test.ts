import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seed } from '../db/seed'
import { actorFromToken, heartbeat, idleMinutes, login } from '../src/server/auth'
import { getDb, type Db } from '../src/server/db'

process.env.PGLITE_DIR = 'memory://'

let db: Db
const MIN = 60_000

beforeAll(async () => {
  db = await getDb()
  await seed(db)
})

afterAll(() => {
  vi.useRealTimers()
  delete process.env.IDLE_MINUTES
})

describe('idle sessions', () => {
  it('defaults to 15 minutes and can be turned off', () => {
    delete process.env.IDLE_MINUTES
    expect(idleMinutes()).toBe(15)
    process.env.IDLE_MINUTES = '0'
    expect(idleMinutes()).toBe(0)
    process.env.IDLE_MINUTES = '5'
    expect(idleMinutes()).toBe(5)
  })

  it('stops a session that has been idle, and a heartbeat keeps it alive', async () => {
    process.env.IDLE_MINUTES = '5'
    const t0 = Date.now()
    vi.useFakeTimers({ now: t0, toFake: ['Date'] })
    const res = await login(db, 'st-d1', 'demo-password')
    expect(res.idle_minutes).toBe(5)

    vi.setSystemTime(t0 + 4 * MIN)
    expect(await actorFromToken(db, res.token)).not.toBeNull()
    await heartbeat(db, res.token)

    // 4 minutes after the heartbeat is still fine, though 8 minutes after sign-in.
    vi.setSystemTime(t0 + 8 * MIN)
    expect(await actorFromToken(db, res.token)).not.toBeNull()

    // Past the idle time plus the grace period since the last heartbeat.
    vi.setSystemTime(t0 + 4 * MIN + 5 * MIN + 3 * MIN)
    expect(await actorFromToken(db, res.token)).toBeNull()
  })

  it('does nothing when idle sign-out is off', async () => {
    process.env.IDLE_MINUTES = '0'
    const t0 = Date.now()
    vi.useFakeTimers({ now: t0, toFake: ['Date'] })
    const res = await login(db, 'st-d1', 'demo-password')
    vi.setSystemTime(t0 + 3 * 60 * MIN)
    expect(await actorFromToken(db, res.token)).not.toBeNull()
  })
})
