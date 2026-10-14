import { login } from '@/server/auth'
import { json, z } from '@/server/http'
import { getDb } from '@/server/db'
import { HttpError } from '@/server/core'

const Body = z.object({ staff_id: z.string().min(1), password: z.string().min(1) })

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json())
    const { token, staff_id, must_change_password } = await login(await getDb(), body.staff_id, body.password)
    return json({ token, staff_id, must_change_password })
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    return json({ error: 'Enter your account and password.' }, 400)
  }
}
