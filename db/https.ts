/*
  HTTPS for the clinic network.

    npm run https:setup -- [--host gilayon.clinic] [--host 192.168.1.10]   create the CA (first time) and a server certificate
    npm run https:renew                                                  new server certificate, same CA, same names
    npm run https:status                                                 what is installed and how long it lasts

  With no --host the machine's own name and network addresses are used. Set GILAYON_HOSTNAMES (or the old HIMSOG_HOSTNAMES)
  (comma separated) to make them permanent.
*/
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setting } from '../src/server/env'
import { FILES, inspectCertificates, setupCertificates } from '../src/server/tls/certs'

try {
  process.loadEnvFile('.env')
} catch {
  /* no .env */
}

const dir = path.resolve(process.env.TLS_DIR ?? './certs')
const [cmd, ...args] = process.argv.slice(2)

const flags = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []))

function machineNames() {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
  return [os.hostname(), ...ips]
}

const fingerprint = () => {
  try {
    return new X509Certificate(readFileSync(path.join(dir, FILES.caCert))).fingerprint256
  } catch {
    return null
  }
}

function trustHelp() {
  const fp = fingerprint()
  console.log(`
Every clinic PC must trust the clinic CA once:
  1. On the PC, open  http://<this server>:${process.env.HTTP_PORT ?? 3000}/ca.crt  (or copy ${path.join(dir, FILES.caCert)} on a USB stick).
  2. Windows (as administrator):   certutil -addstore -f Root himsog-ca.crt
     or run deploy\\windows\\trust-ca.ps1 on that PC.
  3. Open the clinic address in Edge or Chrome: the padlock should show without warnings.
  Firefox keeps its own list: Settings > Privacy & Security > Certificates > View Certificates > Authorities > Import.
  Phones and tablets: open the .crt file and follow "Install certificate" (iOS also needs Settings > General > About > Certificate Trust Settings).

Check this fingerprint on each PC before accepting the certificate:
  ${fp}
Keep ${path.join(dir, FILES.caKey)} on this server only: whoever holds it can impersonate the clinic server.`)
}

async function main() {
  if (cmd === 'setup' || cmd === 'renew') {
    let hosts = [...flags('host'), ...(setting('HOSTNAMES') ?? '').split(',')].map((h) => h.trim()).filter(Boolean)
    if (cmd === 'renew' && !hosts.length) {
      const now = await inspectCertificates(dir)
      if (!now.present) throw new Error('No certificate to renew. Run: npm run https:setup')
      hosts = now.names ?? []
    }
    if (!hosts.length) hosts = machineNames()
    const r = await setupCertificates(dir, hosts)
    console.log(r.createdCa ? 'Created the clinic certificate authority.' : 'Kept the existing clinic certificate authority (PCs that trust it need no change).')
    console.log(`Server certificate issued for: ${r.hosts.join(', ')}`)
    console.log(`Valid until ${r.expires.toLocaleDateString()}. Files are in ${dir}`)
    if (r.createdCa) trustHelp()
    console.log('\nStart the server with:  npm run start:https')
  } else if (cmd === 'status') {
    const i = await inspectCertificates(dir)
    if (!i.present) {
      console.log(`HTTPS is not set up (no certificate in ${dir}). Run: npm run https:setup`)
      process.exit(1)
    }
    console.log(`Names:       ${i.names?.join(', ')}`)
    console.log(`Expires:     ${new Date(i.notAfter!).toLocaleDateString()} (${i.daysLeft} days)`)
    console.log(`Clinic CA:   valid for ${i.caDaysLeft} more days`)
    console.log(`CA fingerprint: ${fingerprint()}`)
    if (i.problem) {
      console.log(`\nPROBLEM: ${i.problem}`)
      process.exit(1)
    }
    console.log('\nOK')
  } else if (cmd === 'ca-help') {
    trustHelp()
  } else {
    console.log('Usage: npm run https:setup [-- --host name-or-ip ...] | https:renew | https:status')
    process.exit(cmd ? 1 : 0)
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`Error: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  },
)
