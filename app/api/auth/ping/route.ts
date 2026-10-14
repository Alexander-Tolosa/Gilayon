import { actorFromToken, heartbeat, idleMinutes } from '@/server/auth'
import { getDb } from '@/server/db'
import { bearer, json } from '@/server/http'

/** Sent by the browser while the person is using the screen, so an idle session can be told apart. */
export async function POST(req: Request) {
  const token = bearer(req)
  const db = await getDb()
  if (!token || !(await actorFromToken(db, token))) return json({ error: 'Sign in again.' }, 401)
  await heartbeat(db, token)
  return json({ ok: true, idle_minutes: idleMinutes() })
}
