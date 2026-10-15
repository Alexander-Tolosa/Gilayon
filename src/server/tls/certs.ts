import 'reflect-metadata'
import { X509Certificate as NodeCert, webcrypto } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import * as x509 from '@peculiar/x509'

/*
  A private certificate authority for the clinic network. Every clinic PC trusts this one CA once;
  the server then presents a certificate it signed, so browsers show a normal padlock, the PWA
  installs and offline mode works (both need a secure page), and nothing travels in clear text.
*/

x509.cryptoProvider.set(webcrypto as unknown as Crypto)

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const
const DAY = 86_400_000
/** Apple platforms reject server certificates valid for longer than 825 days. */
export const LEAF_DAYS = 825
export const CA_DAYS = 3650

export const FILES = { caCert: 'himsog-ca.crt', caKey: 'himsog-ca.key', cert: 'server.crt', key: 'server.key' } as const

export type CertFolder = { dir: string }
const p = (dir: string, f: string) => path.join(/*turbopackIgnore: true*/ dir, f)

const pem = (label: string, der: ArrayBuffer) => {
  const b64 = Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`
}

async function exportKey(key: unknown) {
  return pem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', key as webcrypto.CryptoKey))
}

async function importPrivateKey(text: string) {
  const der = Buffer.from(text.replace(/-----[^-]+-----|\s/g, ''), 'base64')
  return webcrypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
}

const serial = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex').replace(/^([89a-f])/, '0$1')

/** Names the server certificate must cover: everything a PC might type to reach it. */
export function subjectAltNames(hosts: string[]) {
  return [...new Set(['localhost', '127.0.0.1', ...hosts.map((h) => h.trim()).filter(Boolean)])].map((value) => ({ type: isIP(value) ? ('ip' as const) : ('dns' as const), value }))
}

async function createCa(now: Date) {
  const keys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: 'CN=Gilayon Clinic Local CA, O=Gilayon',
    notBefore: new Date(now.getTime() - DAY),
    notAfter: new Date(now.getTime() + CA_DAYS * DAY),
    signingAlgorithm: ALG,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto as unknown as Crypto),
    ],
  })
  return { cert, keys }
}

async function issueLeaf(ca: { cert: x509.X509Certificate; privateKey: CryptoKey }, hosts: string[], now: Date) {
  const keys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  const names = subjectAltNames(hosts)
  const primary = hosts.find((h) => h && !isIP(h)) ?? 'localhost'
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: `CN=${primary}, O=Gilayon`,
    issuer: ca.cert.subject,
    notBefore: new Date(now.getTime() - DAY),
    notAfter: new Date(now.getTime() + LEAF_DAYS * DAY),
    signingAlgorithm: ALG,
    publicKey: keys.publicKey,
    signingKey: ca.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth], false),
      new x509.SubjectAlternativeNameExtension(names, false),
      await x509.AuthorityKeyIdentifierExtension.create(ca.cert, false, webcrypto as unknown as Crypto),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto as unknown as Crypto),
    ],
  })
  return { cert, keys }
}

async function write(file: string, data: string, mode: number) {
  await fsp.writeFile(file, data, { mode })
  await fsp.chmod(file, mode).catch(() => undefined)
}

export type SetupResult = { createdCa: boolean; hosts: string[]; caPath: string; certPath: string; keyPath: string; expires: Date }

/**
 * Creates the CA on first use, then issues a server certificate for `hosts`. Running it again keeps
 * the same CA (so PCs that already trust it keep working) and just issues a fresh server certificate.
 */
export async function setupCertificates(dir: string, hosts: string[], now = new Date()): Promise<SetupResult> {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 })
  let caCert: x509.X509Certificate
  let caKey: CryptoKey
  let createdCa = false
  try {
    caCert = new x509.X509Certificate(await fsp.readFile(p(dir, FILES.caCert), 'utf8'))
    caKey = (await importPrivateKey(await fsp.readFile(p(dir, FILES.caKey), 'utf8'))) as unknown as CryptoKey
  } catch {
    const ca = await createCa(now)
    caCert = ca.cert
    caKey = ca.keys.privateKey as unknown as CryptoKey
    createdCa = true
    await write(p(dir, FILES.caKey), await exportKey(ca.keys.privateKey), 0o600)
    await write(p(dir, FILES.caCert), caCert.toString('pem') + '\n', 0o644)
  }
  const leaf = await issueLeaf({ cert: caCert, privateKey: caKey }, hosts, now)
  await write(p(dir, FILES.key), await exportKey(leaf.keys.privateKey), 0o600)
  // The chain (server then CA) lets clients that were only given the server certificate still build the path.
  await write(p(dir, FILES.cert), leaf.cert.toString('pem') + '\n' + caCert.toString('pem') + '\n', 0o644)
  return { createdCa, hosts: subjectAltNames(hosts).map((n) => n.value), caPath: p(dir, FILES.caCert), certPath: p(dir, FILES.cert), keyPath: p(dir, FILES.key), expires: leaf.cert.notAfter }
}

export type CertInfo = { present: boolean; subject?: string; names?: string[]; notAfter?: number; daysLeft?: number; caNotAfter?: number; caDaysLeft?: number; trustedByCa?: boolean; problem?: string }

/** What is on disk now, and whether it is about to expire. Used by the status command and Settings. */
export async function inspectCertificates(dir: string, now = Date.now()): Promise<CertInfo> {
  try {
    const chain = await fsp.readFile(p(dir, FILES.cert), 'utf8')
    const leaf = new NodeCert(chain)
    const ca = new NodeCert(await fsp.readFile(p(dir, FILES.caCert), 'utf8'))
    const names = (leaf.subjectAltName ?? '').split(/,\s*/).map((s) => s.replace(/^(DNS|IP Address):/, '')).filter(Boolean)
    const notAfter = new Date(leaf.validTo).getTime()
    const caNotAfter = new Date(ca.validTo).getTime()
    const info: CertInfo = {
      present: true,
      subject: leaf.subject.replace(/\n/g, ', '),
      names,
      notAfter,
      daysLeft: Math.floor((notAfter - now) / DAY),
      caNotAfter,
      caDaysLeft: Math.floor((caNotAfter - now) / DAY),
      trustedByCa: leaf.verify(ca.publicKey),
    }
    if (!info.trustedByCa) info.problem = 'The server certificate was not signed by the clinic CA.'
    else if (info.daysLeft! < 0) info.problem = 'The server certificate has expired. Run: npm run https:renew'
    else if (info.daysLeft! < 30) info.problem = `The server certificate expires in ${info.daysLeft} days. Run: npm run https:renew`
    return info
  } catch {
    return { present: false }
  }
}

export async function loadTls(dir: string) {
  return { key: await fsp.readFile(p(dir, FILES.key)), cert: await fsp.readFile(p(dir, FILES.cert)) }
}
