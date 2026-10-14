import { X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FILES, LEAF_DAYS, inspectCertificates, loadTls, setupCertificates, subjectAltNames } from '../src/server/tls/certs'

const dir = mkdtempSync(path.join(tmpdir(), 'himsog-certs-'))
const HOSTS = ['himsog.clinic', '192.168.1.10', 'SERVER-PC']

describe('clinic certificate authority', () => {
  it('lists every name a PC might use, with IP addresses typed as IPs', () => {
    expect(subjectAltNames(['himsog.clinic', '192.168.1.10', ' ', 'localhost'])).toEqual([
      { type: 'dns', value: 'localhost' },
      { type: 'ip', value: '127.0.0.1' },
      { type: 'dns', value: 'himsog.clinic' },
      { type: 'ip', value: '192.168.1.10' },
    ])
  })

  it('creates a CA and a server certificate that browsers accept', async () => {
    const r = await setupCertificates(dir, HOSTS)
    expect(r.createdCa).toBe(true)
    const ca = new X509Certificate(readFileSync(path.join(dir, FILES.caCert)))
    const leaf = new X509Certificate(readFileSync(path.join(dir, FILES.cert)))

    expect(ca.ca).toBe(true)
    expect(leaf.ca).toBe(false)
    expect(leaf.verify(ca.publicKey)).toBe(true)
    expect(leaf.issuer).toBe(ca.subject)
    expect(leaf.checkHost('himsog.clinic')).toBeTruthy()
    expect(leaf.checkHost('SERVER-PC')).toBeTruthy()
    expect(leaf.checkHost('localhost')).toBeTruthy()
    expect(leaf.checkIP('192.168.1.10')).toBeTruthy()
    expect(leaf.checkHost('someone-else.example')).toBeUndefined()
    // Server authentication only, and short enough for Apple devices (825 days).
    expect(leaf.keyUsage).toContain('1.3.6.1.5.5.7.3.1')
    const days = (new Date(leaf.validTo).getTime() - new Date(leaf.validFrom).getTime()) / 86_400_000
    expect(days).toBeLessThanOrEqual(LEAF_DAYS + 1)
  })

  it('keeps private keys private to the server account', async () => {
    if (process.platform === 'win32') return
    expect(statSync(path.join(dir, FILES.key)).mode & 0o077).toBe(0)
    expect(statSync(path.join(dir, FILES.caKey)).mode & 0o077).toBe(0)
  })

  it('reissuing keeps the same CA, so PCs that trust it keep working', async () => {
    const before = new X509Certificate(readFileSync(path.join(dir, FILES.caCert))).fingerprint256
    const leafBefore = new X509Certificate(readFileSync(path.join(dir, FILES.cert))).serialNumber
    const r = await setupCertificates(dir, [...HOSTS, 'new-name.clinic'])
    expect(r.createdCa).toBe(false)
    expect(new X509Certificate(readFileSync(path.join(dir, FILES.caCert))).fingerprint256).toBe(before)
    const leaf = new X509Certificate(readFileSync(path.join(dir, FILES.cert)))
    expect(leaf.serialNumber).not.toBe(leafBefore)
    expect(leaf.checkHost('new-name.clinic')).toBeTruthy()
  })

  it('reports days left and warns before expiry', async () => {
    const now = await inspectCertificates(dir)
    expect(now.present).toBe(true)
    expect(now.trustedByCa).toBe(true)
    expect(now.daysLeft).toBeGreaterThan(800)
    expect(now.problem).toBeUndefined()
    const soon = await inspectCertificates(dir, Date.now() + (LEAF_DAYS - 10) * 86_400_000)
    expect(soon.problem).toMatch(/expires in \d+ days/)
    const gone = await inspectCertificates(dir, Date.now() + (LEAF_DAYS + 5) * 86_400_000)
    expect(gone.problem).toMatch(/expired/)
    expect((await inspectCertificates(path.join(dir, 'nothing-here'))).present).toBe(false)
  })

  it('serves real TLS: trusted with the CA, rejected without it or for a wrong name', async () => {
    const server = https.createServer(await loadTls(dir), (_req, res) => res.end('hello from the clinic'))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    const ca = readFileSync(path.join(dir, FILES.caCert))
    const get = (opts: https.RequestOptions) =>
      new Promise<string>((resolve, reject) => {
        https.get({ host: '127.0.0.1', port, path: '/', ...opts }, (res) => {
          let body = ''
          res.on('data', (d) => (body += d))
          res.on('end', () => resolve(body))
        }).on('error', reject)
      })
    try {
      expect(await get({ ca, servername: 'himsog.clinic' })).toBe('hello from the clinic')
      await expect(get({ servername: 'himsog.clinic' })).rejects.toThrow(/self-signed|unable to verify|issuer/i)
      await expect(get({ ca, servername: 'evil.example' })).rejects.toThrow(/altnames|does not match|hostname/i)
    } finally {
      server.close()
    }
  })
})
