import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/** The clinic CA's public certificate, so a new PC can trust the server. It holds no secret. */
export async function GET() {
  try {
    const file = path.join(path.resolve(process.env.TLS_DIR ?? './certs'), 'himsog-ca.crt')
    return new Response(await readFile(file), {
      headers: { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="himsog-ca.crt"' },
    })
  } catch {
    return new Response('HTTPS has not been set up on this server.', { status: 404 })
  }
}
