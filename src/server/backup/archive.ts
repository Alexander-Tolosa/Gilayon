import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream, createWriteStream, promises as fsp, type WriteStream } from 'node:fs'
import { createGunzip, createGzip, type Gzip } from 'node:zlib'
import type { CipherGCM } from 'node:crypto'

/*
  Gilayon backup archive (.hbk): one file holding the database export and the scanned pages.

    "HBK1" | flag (1 = encrypted) | [salt 16 | iv 12] | gzip( frames ) | [GCM tag 16]

  Frames are: header-length, header JSON ({name}), then data chunks (length + bytes) ended by a
  zero length. The last frame is "manifest.json" with the size and SHA-256 of every other frame, so
  a copy can be proven complete and untampered without restoring it. Encrypted archives use
  AES-256-GCM with a key derived from the passphrase (scrypt), so a lost USB stick leaks nothing.
*/

const MAGIC = Buffer.from('HBK1')
const CHUNK = 256 * 1024

export type ManifestEntry = { name: string; bytes: number; sha256: string }
export type Manifest = { format: 'himsog-backup'; version: 1; created_at: number; encrypted: boolean; app: string; tables: Record<string, number>; entries: ManifestEntry[] }

const key = (passphrase: string, salt: Buffer) => scryptSync(passphrase, salt, 32)
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

export class ArchiveWriter {
  private entries: ManifestEntry[] = []
  private cur?: { name: string; bytes: number; hash: ReturnType<typeof createHash> }
  private failure?: Error

  private file: WriteStream
  private gzip: Gzip
  private cipher: CipherGCM | undefined

  private constructor(file: WriteStream, gzip: Gzip, cipher: CipherGCM | undefined) {
    this.file = file
    this.gzip = gzip
    this.cipher = cipher
    const fail = (e: Error) => (this.failure = e)
    file.on('error', fail)
    gzip.on('error', fail)
    cipher?.on('error', fail)
  }

  static async create(path: string, passphrase?: string) {
    const file = createWriteStream(path, { flags: 'wx', mode: 0o600 })
    const gzip = createGzip({ level: 6 })
    let cipher: CipherGCM | undefined
    if (passphrase) {
      const salt = randomBytes(16)
      const iv = randomBytes(12)
      cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv) as CipherGCM
      file.write(Buffer.concat([MAGIC, Buffer.from([1]), salt, iv]))
      gzip.pipe(cipher).pipe(file, { end: false })
    } else {
      file.write(Buffer.concat([MAGIC, Buffer.from([0])]))
      gzip.pipe(file, { end: false })
    }
    return new ArchiveWriter(file, gzip, cipher)
  }

  private async put(buf: Buffer) {
    if (this.failure) throw this.failure
    if (!this.gzip.write(buf)) await once(this.gzip, 'drain')
  }

  async begin(name: string) {
    if (this.cur) throw new Error('Previous entry not ended')
    const header = Buffer.from(JSON.stringify({ name }))
    await this.put(Buffer.concat([u32(header.length), header]))
    this.cur = { name, bytes: 0, hash: createHash('sha256') }
  }

  async write(data: Buffer | string) {
    if (!this.cur) throw new Error('No entry open')
    const buf = typeof data === 'string' ? Buffer.from(data) : data
    for (let i = 0; i < buf.length; i += CHUNK) {
      const part = buf.subarray(i, i + CHUNK)
      this.cur.hash.update(part)
      this.cur.bytes += part.length
      await this.put(Buffer.concat([u32(part.length), part]))
    }
  }

  async end() {
    if (!this.cur) throw new Error('No entry open')
    await this.put(u32(0))
    this.entries.push({ name: this.cur.name, bytes: this.cur.bytes, sha256: this.cur.hash.digest('hex') })
    this.cur = undefined
  }

  /** Streams a file from disk as one entry. */
  async addFile(name: string, path: string) {
    await this.begin(name)
    for await (const chunk of createReadStream(path, { highWaterMark: CHUNK })) await this.write(chunk as Buffer)
    await this.end()
  }

  async finish(meta: Pick<Manifest, 'created_at' | 'encrypted' | 'app' | 'tables'>): Promise<Manifest> {
    const manifest: Manifest = { format: 'himsog-backup', version: 1, ...meta, entries: this.entries }
    await this.begin('manifest.json')
    await this.write(JSON.stringify(manifest))
    // The manifest is not listed in itself, so it is closed by hand rather than through end().
    this.cur = undefined
    await this.put(u32(0))
    const last = this.cipher ?? this.gzip
    const ended = once(last, 'end')
    this.gzip.end()
    await ended
    if (this.failure) throw this.failure
    if (this.cipher) this.file.write(this.cipher.getAuthTag())
    this.file.end()
    await once(this.file, 'finish')
    return manifest
  }

  /** Abandon a half-written archive. */
  async abort() {
    this.gzip.destroy()
    this.cipher?.destroy()
    this.file.destroy()
  }
}

class Pull {
  private buf: Buffer = Buffer.alloc(0)
  private done = false
  private it: AsyncIterator<Buffer>
  constructor(it: AsyncIterator<Buffer>) {
    this.it = it
  }

  private async fill(n: number) {
    while (this.buf.length < n && !this.done) {
      const r = await this.it.next()
      if (r.done) this.done = true
      else this.buf = Buffer.concat([this.buf, r.value])
    }
  }

  /** Exactly n bytes, or null at a clean end of data. */
  async take(n: number): Promise<Buffer | null> {
    await this.fill(n)
    if (this.buf.length === 0 && n > 0) return null
    if (this.buf.length < n) throw new Error('The backup file is truncated.')
    const out = this.buf.subarray(0, n)
    this.buf = this.buf.subarray(n)
    return out
  }
}

export type ReadHandlers = {
  start?: (name: string) => void | Promise<void>
  chunk?: (name: string, data: Buffer) => void | Promise<void>
  end?: (name: string, info: ManifestEntry) => void | Promise<void>
}

/**
 * Streams every entry in order. Throws if the file is damaged, was tampered with, or the passphrase
 * is wrong. Returns the manifest and whether every entry matched its recorded hash.
 */
export async function readArchive(path: string, passphrase: string | undefined, h: ReadHandlers = {}) {
  const st = await fsp.stat(path)
  const fh = await fsp.open(path, 'r')
  let flag: number
  let start = 5
  let end = st.size
  let salt = Buffer.alloc(0)
  let iv = Buffer.alloc(0)
  let tag = Buffer.alloc(0)
  try {
    const head = Buffer.alloc(33)
    await fh.read(head, 0, 33, 0)
    if (!head.subarray(0, 4).equals(MAGIC)) throw new Error('This is not a Gilayon backup file.')
    flag = head[4]
    if (flag === 1) {
      salt = head.subarray(5, 21)
      iv = head.subarray(21, 33)
      start = 33
      end = st.size - 16
      if (end <= start) throw new Error('The backup file is truncated.')
      tag = Buffer.alloc(16)
      await fh.read(tag, 0, 16, end)
    }
  } finally {
    await fh.close()
  }
  if (flag === 1 && !passphrase) throw new Error('This backup is encrypted. A passphrase is required.')

  const raw = createReadStream(path, { start, end: end - 1, highWaterMark: CHUNK })
  const gunzip = createGunzip()
  if (flag === 1) {
    const d = createDecipheriv('aes-256-gcm', key(passphrase!, salt), iv)
    d.setAuthTag(tag)
    raw.pipe(d).pipe(gunzip)
    d.on('error', (e) => gunzip.destroy(e))
  } else {
    raw.pipe(gunzip)
  }
  raw.on('error', (e) => gunzip.destroy(e))

  const pull = new Pull(gunzip[Symbol.asyncIterator]() as AsyncIterator<Buffer>)
  const seen: ManifestEntry[] = []
  let manifest: Manifest | undefined
  const manifestChunks: Buffer[] = []
  try {
    for (;;) {
      const hl = await pull.take(4)
      if (!hl) break
      const name = (JSON.parse((await pull.take(hl.readUInt32BE()))!.toString()) as { name: string }).name
      await h.start?.(name)
      const hash = createHash('sha256')
      let bytes = 0
      for (;;) {
        const n = (await pull.take(4))!.readUInt32BE()
        if (n === 0) break
        const data = (await pull.take(n))!
        hash.update(data)
        bytes += n
        if (name === 'manifest.json') manifestChunks.push(Buffer.from(data))
        else await h.chunk?.(name, data)
      }
      const info = { name, bytes, sha256: hash.digest('hex') }
      if (name !== 'manifest.json') seen.push(info)
      await h.end?.(name, info)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/authenticate|Unsupported state/i.test(msg)) throw new Error('Wrong passphrase, or the backup file was changed.')
    throw e
  }
  if (!manifestChunks.length) throw new Error('The backup file has no manifest (it did not finish writing).')
  manifest = JSON.parse(Buffer.concat(manifestChunks).toString()) as Manifest
  const problems: string[] = []
  if (manifest.entries.length !== seen.length) problems.push(`expected ${manifest.entries.length} items, found ${seen.length}`)
  for (const e of manifest.entries) {
    const got = seen.find((s) => s.name === e.name)
    if (!got) problems.push(`${e.name} is missing`)
    else if (got.sha256 !== e.sha256 || got.bytes !== e.bytes) problems.push(`${e.name} does not match its checksum`)
  }
  return { manifest, problems }
}
