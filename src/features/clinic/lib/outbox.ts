import type { ConsultInput } from '../api-types'
import type { ScanKind } from '../types'

/*
  The outbox holds what a clinic computer entered while it could not reach the server: consultation
  notes with their draft prescriptions and certificates, edits to drafts, and photos of old folders.
  It lives in IndexedDB (not sessionStorage), so a closed tab or a restart does not lose a doctor's
  notes. Entries are removed only after the server confirms them. Each carries its own id, so a retry
  can never create a duplicate. Patient records are NOT stored here; only what is waiting to be sent.
*/

export type OutboxOp = { op_id: string; staff_id: string; at: number } & (
  | { kind: 'consult'; input: ConsultInput }
  | { kind: 'scan'; input: { page_id: string; patient_id: string; file: string; scan_kind: ScanKind; page_date: string } }
  | { kind: 'edit_draft'; input: { doc_kind: 'rx' | 'doc'; id: string; patch: Record<string, unknown> } }
)

const DB = 'himsog-outbox'
const STORE = 'ops'

// Falls back to memory when IndexedDB is unavailable (private windows): entries still sync this session.
const memory = new Map<string, OutboxOp>()

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'op_id' })
        store.createIndex('staff_id', 'staff_id')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

const done = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export async function loadOutbox(staff_id: string): Promise<OutboxOp[]> {
  const db = await open()
  const rows = db ? ((await done(db.transaction(STORE).objectStore(STORE).index('staff_id').getAll(staff_id)).catch(() => [])) as OutboxOp[]) : [...memory.values()].filter((o) => o.staff_id === staff_id)
  return rows.sort((a, b) => a.at - b.at)
}

export async function putOp(op: OutboxOp): Promise<void> {
  memory.set(op.op_id, op)
  const db = await open()
  if (db) await done(db.transaction(STORE, 'readwrite').objectStore(STORE).put(op)).catch(() => undefined)
}

export async function dropOps(ids: string[]): Promise<void> {
  ids.forEach((i) => memory.delete(i))
  const db = await open()
  if (!db) return
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await Promise.all(ids.map((i) => done(store.delete(i)).catch(() => undefined)))
}
