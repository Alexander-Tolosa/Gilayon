import { X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { route } from '@/server/http'
import { inspectCertificates } from '@/server/tls/certs'

export const dynamic = 'force-dynamic'

/** Certificate state for the Settings screen: names, days left, and the CA fingerprint to compare on each PC. */
export const GET = route({ roles: ['doctor'], read: true }, async () => {
  const dir = path.resolve(process.env.TLS_DIR ?? './certs')
  const cert = await inspectCertificates(dir)
  let fingerprint: string | null = null
  try {
    fingerprint = new X509Certificate(await readFile(path.join(dir, 'himsog-ca.crt'))).fingerprint256
  } catch {
    /* not set up */
  }
  return { cert, fingerprint, httpsPort: Number(process.env.HTTPS_PORT ?? 3443) }
})
