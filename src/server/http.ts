import { z, type ZodType } from 'zod'
import { actorFromToken } from './auth'
import { HttpError, type Actor } from './core'
import { getDb, type Db, type Tx } from './db'
import { notifyChanged } from './events'

type Role = Actor['role']
type Params = Record<string, string>

type Opts<S extends ZodType | undefined> = {
  /** Roles allowed. Omit for any signed-in staff member. */
  roles?: Role[]
  /** A public route needs no sign-in. */
  public?: boolean
  body?: S
  /** Reads skip the transaction and do not wake other screens. */
  read?: boolean
}

type Args<S extends ZodType | undefined> = {
  db: Db
  tx: Tx
  actor: Actor
  body: S extends ZodType ? z.infer<S> : undefined
  params: Params
  req: Request
}

export const bearer = (req: Request) => {
  const h = req.headers.get('authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Wraps a route handler: authenticates, checks the role, validates the body, runs mutations in one
 * transaction (so the audit log can never miss a change), then tells other screens to refresh.
 */
export function route<S extends ZodType | undefined = undefined>(opts: Opts<S>, fn: (a: Args<S>) => Promise<unknown>) {
  return async (req: Request, ctx?: { params: Promise<Params> }): Promise<Response> => {
    try {
      const db = await getDb()
      const params = (await ctx?.params) ?? {}
      let actor: Actor | null = null
      if (!opts.public) {
        actor = await actorFromToken(db, bearer(req))
        if (!actor) throw new HttpError(401, 'Sign in to continue.')
        if (opts.roles && !opts.roles.includes(actor.role)) throw new HttpError(403, 'Your role is not allowed to do this.')
      }
      let body: unknown
      if (opts.body) {
        const parsed = opts.body.safeParse(await req.json().catch(() => undefined))
        if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
        body = parsed.data
      }
      const a = { db, actor: actor as Actor, body, params, req } as unknown as Args<S>
      // A handler may return its own Response (a file download); anything else is sent as JSON.
      const send = (out: unknown) => (out instanceof Response ? out : json(out ?? { ok: true }))
      if (opts.read) return send(await fn({ ...a, tx: db as unknown as Tx }))
      const result = await db.transaction(async (tx) => fn({ ...a, tx }))
      notifyChanged()
      return send(result)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code
      // Database rules (immutable signed rows, unique numbers) surface as a clear conflict, not a crash.
      if (code === 'P0001') return json({ error: (e as { cause?: Error }).cause?.message ?? 'This record cannot be changed.' }, 409)
      if (code === '23505') return json({ error: 'That record already exists.' }, 409)
      console.error(e)
      return json({ error: 'Something went wrong on the server.' }, 500)
    }
  }
}

export { z }
