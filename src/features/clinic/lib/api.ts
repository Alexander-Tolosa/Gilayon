/* Thin client for the clinic server. Same origin; the sign-in token travels in an Authorization header. */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'The clinic server cannot be reached.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed')
  return data as T
}

/**
 * Listens to the server's change notifications (Server-Sent Events) and calls `onChanged` for each.
 * It reconnects by itself, so a server restart or a dropped Wi-Fi link heals without a page reload.
 * `fetch` is used instead of EventSource because the token has to go in a header, not the URL.
 */
export function readEvents(token: string | null, onChanged: () => void, onState: (connected: boolean) => void): () => void {
  const ctrl = new AbortController()
  let stopped = false
  ;(async () => {
    while (!stopped) {
      try {
        const res = await fetch('/api/events', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok || !res.body) throw new Error(String(res.status))
        onState(true)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let i: number
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i)
            buf = buf.slice(i + 2)
            if (frame.includes('event: changed')) onChanged()
          }
        }
      } catch {
        /* fall through to reconnect */
      }
      if (stopped) return
      onState(false)
      await new Promise((r) => setTimeout(r, 3000))
    }
  })()
  return () => {
    stopped = true
    ctrl.abort()
  }
}
