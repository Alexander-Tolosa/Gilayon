import { logout } from '@/server/auth'
import { getDb } from '@/server/db'
import { bearer, json } from '@/server/http'

export async function POST(req: Request) {
  const token = bearer(req)
  if (token) await logout(await getDb(), token)
  return json({ ok: true })
}
