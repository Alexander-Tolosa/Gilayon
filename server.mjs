/*
  Himsog production server with HTTPS.

    npm run build
    npm run https:setup        (once: creates the clinic CA and the server certificate)
    npm run start:https

  Serves the app over TLS on HTTPS_PORT (default 3443). Plain HTTP on HTTP_PORT (default 3000) only
  redirects to HTTPS and hands out the CA certificate (/ca.crt) so a new PC can be set up.
*/
import { readFileSync, existsSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import path from 'node:path'
import next from 'next'

try {
  process.loadEnvFile('.env')
} catch {
  /* no .env: environment variables only */
}

const dir = path.resolve(process.env.TLS_DIR ?? './certs')
const httpsPort = Number(process.env.HTTPS_PORT ?? 3443)
const httpPort = Number(process.env.HTTP_PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const certFile = path.join(dir, 'server.crt')
const keyFile = path.join(dir, 'server.key')
const caFile = path.join(dir, 'himsog-ca.crt')

if (!existsSync(certFile) || !existsSync(keyFile)) {
  console.error(`No server certificate in ${dir}.\nRun "npm run https:setup" first, then start again.`)
  process.exit(1)
}

process.env.NODE_ENV = 'production'
const app = next({ dev: false, hostname: host, port: httpsPort })
const handle = app.getRequestHandler()
await app.prepare()

const httpsServer = createHttps({ key: readFileSync(keyFile), cert: readFileSync(certFile), minVersion: 'TLSv1.2' }, (req, res) => {
  // Tell browsers to stay on HTTPS for a year once they have seen it.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  handle(req, res)
})

// Only a plain hostname or IPv4 address is ever echoed into a redirect.
const safeHost = (h) => {
  const name = String(h ?? '').replace(/:\d+$/, '')
  return /^[A-Za-z0-9.-]{1,253}$/.test(name) ? name : 'localhost'
}

const httpServer = createHttp((req, res) => {
  if (req.url === '/ca.crt' && existsSync(caFile)) {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="himsog-ca.crt"' })
    return res.end(readFileSync(caFile))
  }
  res.writeHead(301, { Location: `https://${safeHost(req.headers.host)}:${httpsPort}${req.url ?? '/'}` })
  res.end()
})

httpsServer.listen(httpsPort, host, () => console.log(`Himsog is running at https://localhost:${httpsPort} (HTTP ${httpPort} redirects here)`))
httpServer.listen(httpPort, host)

const stop = () => {
  httpsServer.close()
  httpServer.close()
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
