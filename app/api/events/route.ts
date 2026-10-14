import { actorFromToken } from '@/server/auth'
import { getDb } from '@/server/db'
import { bus, CHANGED } from '@/server/events'
import { bearer } from '@/server/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Server-Sent Events: a "changed" message whenever any clinic record changes. Public screens may subscribe too. */
export async function GET(req: Request) {
  const token = bearer(req)
  if (token && !(await actorFromToken(await getDb(), token))) return new Response('Unauthorized', { status: 401 })
  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const onChanged = (at: number) => send(`event: changed\ndata: ${at}\n\n`)
      bus.on(CHANGED, onChanged)
      const beat = setInterval(() => send(': ping\n\n'), 25_000)
      cleanup = () => {
        clearInterval(beat)
        bus.off(CHANGED, onChanged)
      }
      req.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
      send('retry: 3000\n\n')
    },
    cancel() {
      cleanup()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive' } })
}
