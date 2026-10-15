import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_CLINIC, type AuditPage, type BackupStatus, type ClinicProfile, type ConsultInput, type OpenedScan, type PendingScan, type RecognitionMetrics, type ScanReading, type SecurityStatus, type Snapshot } from '../api-types'
import { matchScore, normName, todayKey, uuid } from '../lib/helpers'
import { ApiError, api, forgetBlobUrls, readEvents } from '../lib/api'
import type { HrImportResult, RawHrRow } from '../lib/hrlist'
import { dropOps, loadOutbox, putOp, type OutboxOp } from '../lib/outbox'
import type {
  CategoryKey,
  CivilStatus,
  Consultation,
  DocumentRow,
  Employee,
  LabOrder,
  NetworkMode,
  PaperStatus,
  Patient,
  Person,
  Prescription,
  QueueTicket,
  RelationshipType,
  ScanExtra,
  ScanKind,
  ServiceType,
  Sex,
  Staff,
  TicketStatus,
} from '../types'

/*
  The clinic server (PostgreSQL behind /api) is the source of truth. This store keeps a copy of the
  records the signed-in staff member may see, refreshes it whenever the server says something changed
  (Server-Sent Events), and sends every change to the server. Each browser tab is one clinic computer:
  its sign-in token, network mode and offline queue live in sessionStorage. While a tab is offline,
  consultation saves wait in that tab's queue and are sent, idempotently, when it reconnects.
*/

const S_TOKEN = 'himsog-token'
const S_SESSION = 'himsog-session'
const S_NET = 'himsog-network'
const S_RECENT = 'himsog-recent'
const S_IDLE = 'himsog-idle-minutes'
const DEFAULT_IDLE_MINUTES = 15
const PING_EVERY_MS = 60_000

const EMPTY: Snapshot = {
  persons: [],
  employees: [],
  patients: [],
  relationships: [],
  familyHistory: [],
  allergies: [],
  categories: [],
  tickets: [],
  consultations: [],
  diagnoses: [],
  labs: [],
  prescriptions: [],
  documents: [],
  releases: [],
  scans: [],
  staff: [],
  audit: [],
  offsite: { pending: 0, lastAt: 0 },
  merged: {},
  auditSeenAt: 0,
  mergedRecords: [],
  notDuplicates: [],
  lastImport: { at: 0, count: 0, source: '' },
  clinic: DEFAULT_CLINIC,
  demo: false,
}

const ss = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = sessionStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null || v === undefined) sessionStorage.removeItem(k)
      else sessionStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
}

/* --------------------------------- Inputs ---------------------------------- */

export type { ConsultInput }

export type PendingOp = OutboxOp

export type NewStaffInput = { name: string; role: 'doctor' | 'desk' | 'nurse'; title: string; license_no?: string; ptr_no?: string; services?: ServiceType[]; room?: string; password: string }

export type NewPersonInput = { full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; philhealth_pin?: string; pwd_id?: string }
/** Employee details are optional: the HR list is a secondary check, and HR may have nothing to import. */
export type UnlistedInput = NewPersonInput & { employee_no?: string; office?: string; position?: string }

/** What this computer shows for entries still waiting in its offline queue, applied in the order they were made. */
function overlayOp(s: Snapshot, op: OutboxOp): Snapshot {
  if (op.kind === 'scan') {
    if (s.scans.some((p) => p.page_id === op.input.page_id)) return s
    return { ...s, scans: [...s.scans, { page_id: op.input.page_id, patient_id: op.input.patient_id, file: op.input.file, kind: op.input.scan_kind, page_date: op.input.page_date, category: op.input.category, source_clinic: op.input.source_clinic, report_date: op.input.report_date, uploaded_by: op.staff_id, uploaded_at: op.at }] }
  }
  // A photo waiting to be read is not part of any record yet, so it changes nothing on screen.
  if (op.kind === 'folder_scan') return s
  if (op.kind === 'edit_draft') {
    const { doc_kind, id, patch } = op.input
    if (doc_kind === 'rx') {
      const items = patch.items as { drug_name: string; dose: string; frequency: string; quantity: number }[] | undefined
      return { ...s, prescriptions: s.prescriptions.map((r) => (r.prescription_id === id && r.status === 'draft' && items ? { ...r, items: items.map((it, i) => ({ ...it, item_id: `${id}-local-${i}`, prescription_id: id })) } : r)) }
    }
    return { ...s, documents: s.documents.map((d) => (d.document_id === id && d.status === 'draft' ? ({ ...d, ...patch } as DocumentRow) : d)) }
  }
  const { input, staff_id: doctor_id } = op
  if (s.consultations.some((c) => c.consultation_id === input.consultation_id)) return s
  const created = op.at
  const consult: Consultation = {
    consultation_id: input.consultation_id,
    patient_id: input.patient_id,
    ticket_id: input.ticket_id,
    doctor_id,
    service_type: input.service_type,
    consult_date: todayKey(new Date(created)),
    created_at: created,
    chief_complaint: input.chief_complaint,
    treatment_notes: input.treatment_notes,
    vitals: input.vitals,
    correction_of: input.correction_of,
    sync: 'local',
  }
  const rx: Prescription[] = input.rx.length
    ? [{ prescription_id: input.rx_id, consultation_id: consult.consultation_id, patient_id: input.patient_id, doctor_id, status: 'draft', created_at: created, items: input.rx.map((r, i) => ({ ...r, item_id: `${input.rx_id}-${i}`, prescription_id: input.rx_id })) }]
    : []
  const docs: DocumentRow[] = input.certificate
    ? [{ document_id: input.doc_id, patient_id: input.patient_id, consultation_id: consult.consultation_id, doctor_id, doc_type: 'Medical certificate', ...input.certificate, status: 'draft', created_at: created }]
    : []
  const labs: LabOrder[] = input.labs.map((t, i) => ({ lab_id: input.lab_ids[i] ?? uuid(), patient_id: input.patient_id, consultation_id: consult.consultation_id, requested_by: doctor_id, test_name: t, status: 'requested', requested_at: created }))
  return {
    ...s,
    consultations: [...s.consultations, consult],
    diagnoses: [...s.diagnoses, ...input.diagnoses.map((d, i) => ({ ...d, diagnosis_id: `${input.consultation_id}-d${i}`, consultation_id: consult.consultation_id }))],
    prescriptions: [...s.prescriptions, ...rx],
    documents: [...s.documents, ...docs],
    labs: [...s.labs, ...labs],
    tickets: s.tickets.map((t) => (t.ticket_id === input.ticket_id ? { ...t, status: 'done' as TicketStatus, done_at: created } : t)),
  }
}

/* --------------------------------- Context --------------------------------- */

type Api = {
  data: Snapshot
  /** False until the first copy of the records has arrived from the server. */
  ready: boolean
  /** True while the server can be reached (and this tab is not simulating offline). */
  connected: boolean
  me: Staff | null
  network: NetworkMode
  pending: PendingOp[]
  /** Offline entries the server refused. Kept on this computer until their author resends or discards them. */
  rejected: PendingOp[]
  retryRejected: (opId: string) => Promise<void>
  discardRejected: (opId: string) => Promise<void>
  recent: string[]
  signIn: (staffId: string, password: string) => Promise<string | null>
  signOut: () => void
  setNetwork: (m: NetworkMode) => void
  // lookups
  person: (personId?: string) => Person | undefined
  patient: (patientId?: string) => Patient | undefined
  personOfPatient: (patientId?: string) => Person | undefined
  employeeOfPerson: (personId?: string) => Employee | undefined
  patientOfPerson: (personId?: string) => Patient | undefined
  staffById: (id?: string) => Staff | undefined
  principalOf: (patientId: string) => { principal: Patient; type: RelationshipType; mdr: boolean } | undefined
  isReturning: (patientId: string) => boolean
  /** Name, ID or folder number, optionally with a birthdate to tell same-name people apart. */
  search: (q: string, limit?: number, birthdate?: string) => SearchHit[]
  findDuplicates: (full_name: string, birthdate: string) => Person[]
  touch: (patientId: string) => void
  // front desk
  verify: (personId: string, entered: VerifyInput) => { ok: boolean; mismatches: string[] }
  flagForHR: (personId: string, note: string) => void
  completeRecord: (patientId: string, patch: Partial<Patient> & Partial<Person>, reason?: string) => void
  /** Employee ID, office and position typed by hand. Returns an error message, or null when it was saved. */
  setEmployeeInfo: (patientId: string, info: { employee_no: string; office: string; position: string }, reason?: string) => Promise<string | null>
  /** The desk looked in the paper cabinet. Returns an error message, or null when it was saved. */
  recordPaperCheck: (patientId: string, status: PaperStatus, folderNo?: string) => Promise<string | null>
  /** `confirmed`: the desk saw the possible-duplicate warning and checked an ID. */
  createDependent: (principalPatientId: string, input: NewPersonInput, type: RelationshipType, mdr: boolean, confirmed?: boolean) => Promise<Patient | null>
  /** Registers someone who is not in the system yet. A 409 with `duplicate` means a likely duplicate person. */
  registerUnlisted: (input: UnlistedInput, confirmed?: boolean) => Promise<{ patient?: Patient; error?: string; duplicate?: boolean }>
  issueTicket: (patientId: string, categories: CategoryKey[], service: ServiceType, reason: string) => Promise<QueueTicket | null>
  setTicketStatus: (ticketId: string, status: TicketStatus) => void
  markUrgent: (ticketId: string) => void
  uploadScan: (patientId: string, file: string, kind: ScanKind, page_date: string, extra?: ScanExtra) => Promise<boolean>
  addFamilyHistory: (patientId: string, relative: string, condition: string, notes?: string) => void
  addAllergy: (patientId: string, substance: string, reaction: string, severity: 'Mild' | 'Moderate' | 'Severe') => void
  linkRelative: (principalPatientId: string, relatedPatientId: string, type: RelationshipType, mdr: boolean) => void
  hrImport: (rows: RawHrRow[], source: string, dryRun: boolean) => Promise<{ result?: HrImportResult; error?: string }>
  // doctor
  callTicket: (ticketId: string) => Promise<boolean>
  startConsult: (ticketId: string) => void
  saveConsultation: (input: ConsultInput) => Promise<'saved' | 'local'>
  signDocuments: (refs: { kind: 'rx' | 'doc'; id: string }[], pin: string) => Promise<SignResult>
  voidDocument: (kind: 'rx' | 'doc', id: string, reason: string) => void
  /** The front desk stamped a signed document and handed it to the patient. */
  releaseDocument: (kind: 'rx' | 'doc', id: string) => void
  reissueDocument: (kind: 'rx' | 'doc', id: string) => string | null
  editDraft: (kind: 'rx' | 'doc', id: string, patch: Partial<Prescription> | Partial<DocumentRow>) => void
  addLabResult: (labId: string, result: string) => void
  updateCategoryRank: (category: CategoryKey, rank: number) => void
  setSignatureImage: (image: string) => void
  changePin: (current: string, next: string) => Promise<boolean>
  // accounts (each returns an error message, or null when it worked)
  changePassword: (current: string, next: string) => Promise<string | null>
  createStaff: (input: NewStaffInput) => Promise<string | null>
  updateStaffDetails: (staffId: string, patch: Partial<Pick<Staff, 'name' | 'title' | 'license_no' | 'ptr_no' | 'room' | 'role' | 'services'>>) => Promise<string | null>
  setStaffActive: (staffId: string, active: boolean) => Promise<string | null>
  resetStaffPassword: (staffId: string, temporary: string) => Promise<string | null>
  mergePatients: (keepPatientId: string, duplicatePatientId: string, reason: string) => Promise<string | null>
  unmergePatient: (patientId: string, reason: string) => Promise<string | null>
  markNotDuplicate: (a: string, b: string) => Promise<string | null>
  markAuditSeen: (upTo: number) => Promise<void>
  /** Older audit entries than the given row (newest first), beyond what the snapshot carries. */
  fetchAuditPage: (before?: { at: number; id: string }) => Promise<AuditPage | null>
  /** Downloads the whole audit trail as CSV. Returns an error message, or null when it worked. */
  exportAudit: () => Promise<string | null>
  setClinicProfile: (profile: ClinicProfile) => Promise<string | null>
  fetchBackups: () => Promise<BackupStatus | null>
  /** Reads a photo of an old-folder intake form on the clinic server (local OCR, no internet). Returns a message on failure. */
  scanFolderForm: (file: string) => Promise<{ reading?: ScanReading; error?: string; offline?: boolean }>
  confirmFolderScan: (eventId: string, body: { patient_id: string; values: Record<string, string>; review_ms: number; file?: string }) => Promise<{ error?: string; added?: number; correct?: number; field_count?: number }>
  fetchRecognitionMetrics: () => Promise<RecognitionMetrics | null>
  /** Keeps a photo on this computer when the server cannot be reached; it is sent and read once the server is back. */
  captureFolderScan: (file: string, patient_hint?: string) => Promise<void>
  fetchPendingScans: () => Promise<PendingScan[] | null>
  openPendingScan: (eventId: string) => Promise<{ opened?: OpenedScan; error?: string }>
  discardPendingScan: (eventId: string) => Promise<string | null>
  fetchSecurity: () => Promise<SecurityStatus | null>
  runBackup: () => Promise<string | null>
  resetDemo: () => void
  online: boolean
}

/** A wrong PIN, no server, or the server's own reason (PIN locked, not your draft, no license number). */
export type SignResult = 'ok' | 'bad-pin' | 'offline' | { error: string }

export type IdChecked = 'company_id' | 'government_id' | 'other'
/** What the desk typed. The employee ID is a secondary check and only compared when the person is on the HR list. */
export type VerifyInput = { full_name: string; birthdate: string; employee_no?: string; principal_no?: string; id_checked?: IdChecked; paper_match?: boolean; override?: boolean }

export type SearchHit = { person: Person; employee?: Employee; patient?: Patient; principal?: Person; score: number }

const Ctx = createContext<Api | null>(null)

/** Anything the screens should tell the person but the store can't show itself (it sits above the toasts). */
export const CLINIC_ERROR_EVENT = 'himsog:error'
const tell = (message: string) => window.dispatchEvent(new CustomEvent(CLINIC_ERROR_EVENT, { detail: message }))

export function ClinicProvider({ children }: { children: ReactNode }) {
  const [shared, setShared] = useState<Snapshot>(EMPTY)
  const [ready, setReady] = useState(false)
  const [connected, setConnected] = useState(true)
  const [token, setToken] = useState<string | null>(() => ss.get<string | null>(S_TOKEN, null))
  const [session, setSession] = useState<string | null>(() => ss.get<string | null>(S_SESSION, null))
  const [network, setNetworkState] = useState<NetworkMode>(() => ss.get<NetworkMode>(S_NET, 'online'))
  // Everything waiting on this computer, for whoever signed in here; each person only sees their own.
  const [queued, setPending] = useState<PendingOp[]>([])
  const pending = useMemo(() => queued.filter((o) => o.staff_id === session && !o.rejected), [queued, session])
  const rejected = useMemo(() => queued.filter((o) => o.staff_id === session && o.rejected), [queued, session])
  const [recent, setRecent] = useState<string[]>(() => ss.get<string[]>(S_RECENT, []))
  const tokenRef = useRef(token)
  const networkRef = useRef(network)
  // Counts refreshes so a slow, older response (for example the public queue requested before sign-in)
  // can never overwrite newer records that arrived first.
  const refreshSeq = useRef(0)
  // Keep the refs in step with state after each commit (not during render), before any effect runs.
  useLayoutEffect(() => {
    tokenRef.current = token
    networkRef.current = network
  }, [token, network])

  useEffect(() => ss.set(S_TOKEN, token), [token])
  useEffect(() => ss.set(S_SESSION, session), [session])
  useEffect(() => ss.set(S_NET, network), [network])
  useEffect(() => ss.set(S_RECENT, recent), [recent])

  const clearSession = useCallback(() => {
    forgetBlobUrls()
    setToken(null)
    setSession(null)
    setRecent([])
  }, [])

  /** Pulls the latest records. Signed out, it pulls only the public queue (waiting screen, sign-in page). */
  const refresh = useCallback(async (): Promise<Snapshot | null> => {
    if (networkRef.current === 'offline') return null
    const seq = ++refreshSeq.current
    try {
      if (tokenRef.current) {
        const snap = await api<Snapshot>('/api/state', { token: tokenRef.current })
        if (seq === refreshSeq.current) {
          setShared(snap)
          setReady(true)
          setConnected(true)
        }
        return snap
      }
      const pub = await api<Pick<Snapshot, 'tickets' | 'categories' | 'staff' | 'clinic' | 'demo'>>('/api/public/queue')
      const snap = { ...EMPTY, ...pub }
      // Signed in while this was in flight: the public queue has no patient ids and must not replace the records.
      if (seq === refreshSeq.current && !tokenRef.current) {
        setShared(snap)
        setReady(true)
        setConnected(true)
      }
      return snap
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearSession()
        return null
      }
      setConnected(false)
      setReady(true)
      return null
    }
  }, [clearSession])

  // First load, and again whenever the sign-in changes.
  useEffect(() => {
    void refresh()
  }, [token, refresh])

  // Idle sign-out: shared clinic PCs lock after a few minutes with no touch, key or scroll. Anything
  // waiting in the offline outbox stays on disk and is sent after the same person signs in again.
  useEffect(() => {
    if (!token) return
    const minutes = ss.get<number>(S_IDLE, DEFAULT_IDLE_MINUTES)
    if (!minutes) return
    let last = Date.now()
    let lastPing = Date.now()
    const mark = () => {
      last = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }))
    const lock = () => {
      void api('/api/auth/logout', { token, body: {} }).catch(() => undefined)
      clearSession()
      tell(`Signed out after ${minutes} minutes of no activity. Sign in again to continue; unsent notes are kept.`)
    }
    const timer = setInterval(() => {
      const now = Date.now()
      if (now - last >= minutes * 60_000) return lock()
      // Only active use keeps the server's copy of the session alive; background refreshes do not.
      if (now - last < PING_EVERY_MS && now - lastPing >= PING_EVERY_MS) {
        lastPing = now
        void api<{ idle_minutes: number }>('/api/auth/ping', { token, body: {} })
          .then((r) => ss.set(S_IDLE, r.idle_minutes))
          .catch(() => undefined)
      }
    }, 5_000)
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, mark))
    }
  }, [token, clearSession])

  // Live updates: the server nudges every screen when any record changes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = readEvents(
      token,
      () => {
        clearTimeout(timer)
        timer = setTimeout(() => void refresh(), 120)
      },
      (up) => {
        if (up) void refresh()
      },
    )
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [token, refresh])

  // What this computer sees: the server's records plus anything waiting in its own offline queue.
  const data = useMemo(() => pending.reduce(overlayOp, shared), [shared, pending])
  const me = shared.staff.find((s) => s.staff_id === session) ?? null
  // "Online" means this computer can really reach the server, not only that the demo switch is on.
  const online = network !== 'offline' && connected

  const pendingRef = useRef(pending)
  useLayoutEffect(() => {
    pendingRef.current = pending
  }, [pending])
  const flushing = useRef(false)

  /** Adds an entry to the outbox. It is on disk (IndexedDB) before the screen says "saved on this computer". */
  const enqueue = useCallback(async (op: Omit<OutboxOp, 'op_id' | 'staff_id' | 'at'> & { op_id?: string }) => {
    if (!session) return
    const full = { ...op, op_id: op.op_id ?? uuid(), staff_id: session, at: Date.now() } as OutboxOp
    await putOp(full)
    setPending((p) => [...p, full])
  }, [session])

  /** Sends the outbox. The server records each op id, so a retry can never duplicate. */
  const flush = useCallback(async () => {
    const ops = pendingRef.current
    if (flushing.current || !ops.length || !tokenRef.current || networkRef.current === 'offline') return
    flushing.current = true
    try {
      const res = await api<{ applied: string[]; rejected: { op_id: string; reason: string }[] }>('/api/sync', { token: tokenRef.current, body: { ops: ops.map((o) => ({ op_id: o.op_id, kind: o.kind, input: o.input })) } })
      const applied = new Set(res.applied)
      await dropOps(res.applied)
      // Refused entries stay on disk, marked, so the author can copy, fix or discard them.
      const now = Date.now()
      const why = new Map(res.rejected.map((r) => [r.op_id, r.reason]))
      const marked = ops.filter((o) => why.has(o.op_id)).map((o) => ({ ...o, rejected: { reason: why.get(o.op_id)!, at: now } }))
      await Promise.all(marked.map(putOp))
      setPending((p) => p.filter((o) => !applied.has(o.op_id)).map((o) => marked.find((m) => m.op_id === o.op_id) ?? o))
      if (marked.length) tell(`${marked.length} offline ${marked.length === 1 ? 'entry was' : 'entries were'} refused by the server and kept on this computer for you to review: ${marked[0].rejected.reason}`)
      await refresh()
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setConnected(false)
      else tell(e instanceof ApiError ? `Offline entries could not be sent yet: ${e.message}` : 'Offline entries could not be sent yet.')
    } finally {
      flushing.current = false
    }
  }, [refresh])

  // Whoever signs in gets their own unsent entries back from disk (also after a restart).
  useEffect(() => {
    let live = true
    if (!session) return
    void loadOutbox(session).then((ops) => live && setPending((cur) => [...ops, ...cur.filter((c) => !ops.some((o) => o.op_id === c.op_id))]))
    return () => {
      live = false
    }
  }, [session])

  // Real connectivity: the browser says when the network drops or returns, and a dropped server is retried.
  useEffect(() => {
    const down = () => setConnected(false)
    const up = () => void refresh()
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('online', up)
    }
  }, [refresh])
  useEffect(() => {
    if (connected || network === 'offline') return
    const id = setInterval(() => void refresh(), 8000)
    return () => clearInterval(id)
  }, [connected, network, refresh])

  // As soon as the server is reachable again, send whatever is waiting.
  useEffect(() => {
    if (connected && network !== 'offline' && pending.length && token) void flush()
  }, [connected, network, pending.length, token, flush])

  const setNetwork = useCallback(
    (m: NetworkMode) => {
      setNetworkState(m)
      networkRef.current = m
      if (m !== 'offline') {
        void (async () => {
          const snap = await refresh()
          if (snap) {
            await flush()
            await refresh()
          }
        })()
      }
    },
    [flush, refresh],
  )

  const api_ = useMemo<Api>(() => {
    const person = (id?: string) => data.persons.find((p) => p.person_id === id)
    // A link or slip that still names a merged record lands on the patient it now lives under.
    const patient = (id?: string) => data.patients.find((p) => p.patient_id === (id ? (data.merged[id] ?? id) : id))
    const personOfPatient = (id?: string) => person(patient(id)?.person_id)
    const employeeOfPerson = (id?: string) => data.employees.find((e) => e.person_id === id)
    const patientOfPerson = (id?: string) => data.patients.find((p) => p.person_id === id)
    const staffById = (id?: string) => data.staff.find((s) => s.staff_id === id)
    const principalOf = (patientId: string) => {
      const r = data.relationships.find((x) => x.related_patient_id === patientId)
      const p = r && patient(r.patient_id)
      return r && p ? { principal: p, type: r.relationship_type, mdr: r.listed_in_mdr } : undefined
    }
    const isReturning = (patientId: string) => !!patient(patientId)?.legacy_folder_no || data.consultations.some((c) => c.patient_id === patientId)

    /** One request, then pull the new records. Errors reach the person as a toast. */
    const send = async <T,>(path: string, body?: unknown, method?: string): Promise<T | null> => {
      if (!tokenRef.current) return null
      try {
        const out = await api<T>(path, { token: tokenRef.current, body: body ?? {}, method })
        await refresh()
        return out
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) setConnected(false)
        tell(e instanceof ApiError ? (e.status === 0 ? 'This computer cannot reach the clinic server.' : e.message) : 'Something went wrong.')
        await refresh()
        return null
      }
    }

    /** For forms that show the server's reason next to the field instead of a toast. */
    const call = async (path: string, body: unknown, method?: string): Promise<string | null> => {
      try {
        await api(path, { token: tokenRef.current, body, method })
        await refresh()
        return null
      } catch (e) {
        return e instanceof ApiError ? e.message : 'Something went wrong.'
      }
    }

    return {
      data,
      ready,
      connected: online,
      me,
      // What the badge shows: the demo switch, or the truth when the server cannot be reached.
      network: network === 'online' && !connected ? 'offline' : network,
      pending,
      rejected,
      retryRejected: async (opId) => {
        const op = rejected.find((o) => o.op_id === opId)
        if (!op) return
        const { rejected: _r, ...again } = op
        await putOp(again as OutboxOp)
        setPending((p) => p.map((o) => (o.op_id === opId ? (again as OutboxOp) : o)))
      },
      discardRejected: async (opId) => {
        await dropOps([opId])
        setPending((p) => p.filter((o) => o.op_id !== opId))
      },
      recent,
      online,
      signIn: async (staffId, password) => {
        try {
          const res = await api<{ token: string; staff_id: string; idle_minutes?: number }>('/api/auth/login', { body: { staff_id: staffId, password } })
          ss.set(S_IDLE, res.idle_minutes ?? DEFAULT_IDLE_MINUTES)
          tokenRef.current = res.token
          // Until this person's own records arrive, screens must not show the public queue as if it were
          // them: it has no patient ids, so a button pressed in that gap would open "no patient".
          setShared(EMPTY)
          setReady(false)
          setSession(res.staff_id)
          setToken(res.token)
          return null
        } catch (e) {
          return e instanceof ApiError ? e.message : 'Could not sign in.'
        }
      },
      signOut: () => {
        const t = tokenRef.current
        if (t) void api('/api/auth/logout', { token: t, body: {} }).catch(() => undefined)
        clearSession()
      },
      setNetwork,
      person,
      patient,
      personOfPatient,
      employeeOfPerson,
      patientOfPerson,
      staffById,
      principalOf,
      isReturning,
      touch: (patientId) => setRecent((r) => [patientId, ...r.filter((x) => x !== patientId)].slice(0, 12)),

      // Search runs on this computer's copy so it stays instant, typo tolerant and works from "recent" offline.
      search: (q, limit = 8, birthdate) => {
        if (!q.trim() && !birthdate) return []
        const pool = online ? data.persons : data.persons.filter((p) => recent.includes(patientOfPerson(p.person_id)?.patient_id ?? ''))
        return pool
          .map((p) => {
            const employee = employeeOfPerson(p.person_id)
            const pt = patientOfPerson(p.person_id)
            const principalRel = pt ? data.relationships.find((r) => r.related_patient_id === pt.patient_id) : undefined
            const principal = principalRel ? personOfPatient(principalRel.patient_id) : undefined
            const sameBirth = !!birthdate && p.birthdate === birthdate
            // A birthdate on its own lists everyone born that day; with a name it lifts the right person above namesakes.
            const base = q.trim() ? matchScore(q, p.full_name, [employee?.employee_no ?? '', pt?.patient_no ?? '', pt?.legacy_folder_no ?? '']) : sameBirth ? 1 : 0
            return { person: p, employee, patient: pt, principal, score: base + (q.trim() && sameBirth ? 0.5 : 0) }
          })
          .filter((h) => h.score >= 0.45)
          .sort((a, b) => b.score - a.score || a.person.full_name.localeCompare(b.person.full_name))
          .slice(0, limit)
      },

      findDuplicates: (full_name, birthdate) => data.persons.filter((p) => p.birthdate === birthdate && matchScore(full_name, p.full_name, []) >= 0.75),

      // The answer shows at once from this computer's copy; the server re-checks and writes the audit entry.
      verify: (personId, entered) => {
        const p = person(personId)!
        const emp = employeeOfPerson(personId)
        const mismatches: string[] = []
        if (normName(entered.full_name) !== normName(p.full_name)) mismatches.push('Full name')
        if (entered.birthdate !== p.birthdate) mismatches.push('Birthdate')
        const enteredEmp = (entered.employee_no ?? '').trim().toUpperCase()
        if (emp && enteredEmp && enteredEmp !== emp.employee_no) mismatches.push('Employee ID')
        const enteredPrincipal = (entered.principal_no ?? '').trim().toUpperCase()
        if (!emp && enteredPrincipal) {
          const pt = patientOfPerson(personId)
          const rel = pt && data.relationships.find((r) => r.related_patient_id === pt.patient_id)
          const principalEmp = rel && employeeOfPerson(personOfPatient(rel.patient_id)?.person_id)
          if (principalEmp && enteredPrincipal !== principalEmp.employee_no) mismatches.push('Employee ID of the principal')
        }
        if (entered.paper_match === false) mismatches.push('Paper folder')
        void send('/api/patients/verify', { person_id: personId, ...entered })
        return { ok: mismatches.length === 0 || !!entered.override, mismatches }
      },

      flagForHR: (personId, note) => void send('/api/patients/flag', { person_id: personId, note }),

      completeRecord: (patientId, patch, reason) => {
        const { person_id: _a, patient_id: _b, created_at: _c, created_by: _d, ...rest } = patch as Record<string, unknown>
        void send(`/api/patients/${patientId}`, { patch: rest, reason }, 'PATCH')
      },

      setEmployeeInfo: async (patientId, info, reason) => {
        if (!online) return 'Only the clinic server can record this. Reconnect this computer first.'
        return call(`/api/patients/${patientId}/employee`, { ...info, reason: reason || undefined }, 'PUT')
      },

      recordPaperCheck: async (patientId, status, folderNo) => {
        if (!online) return 'Only the clinic server can record this. Reconnect this computer first.'
        return call(`/api/patients/${patientId}/paper`, { status, folder_no: folderNo || undefined })
      },

      createDependent: async (principalPatientId, input, type, mdr, confirmed) => {
        if (!online) return null
        // The id is ours so a retried request cannot create the dependent twice.
        const res = await send<{ patient_id: string }>(`/api/patients/${principalPatientId}/dependents`, { patient_id: uuid(), person: input, type, mdr, confirmed })
        if (!res) return null
        return (await refresh())?.patients.find((p) => p.patient_id === res.patient_id) ?? null
      },

      registerUnlisted: async (input, confirmed) => {
        if (!online) return { error: 'New records can only be created when this computer is connected.' }
        try {
          // The id is ours so a retried request cannot register the person twice.
          const patient_id = uuid()
          const out = await api<{ patient_id: string }>('/api/patients/unlisted', { token: tokenRef.current, body: { patient_id, person: input, confirmed } })
          const snap = await refresh()
          return { patient: snap?.patients.find((p) => p.patient_id === out.patient_id) }
        } catch (e) {
          if (e instanceof ApiError) return { error: e.status === 0 ? 'This computer cannot reach the clinic server.' : e.message, duplicate: e.status === 409 }
          return { error: 'Something went wrong.' }
        }
      },

      issueTicket: async (patientId, categories, service, reason) => {
        if (!online) return null
        // The server issues the queue number; the ticket id is ours so a retried request can't double-book.
        const ticket_id = uuid()
        const res = await send<{ ticket_id: string }>('/api/queue', { ticket_id, patient_id: patientId, categories, service, reason })
        if (!res) return null
        return (await refresh())?.tickets.find((t) => t.ticket_id === res.ticket_id) ?? null
      },

      setTicketStatus: (ticketId, status) => void send(`/api/queue/${ticketId}`, { status }, 'PATCH'),
      markUrgent: (ticketId) => void send(`/api/queue/${ticketId}/urgent`),

      // Photos of old folders can be taken offline; they wait in the outbox with their own id.
      uploadScan: async (patientId, file, kind, page_date, extra) => {
        const page_id = uuid().replace(/-/g, '')
        const queue = async () => {
          await enqueue({ kind: 'scan', input: { page_id, patient_id: patientId, file, scan_kind: kind, page_date, ...extra } })
          return true
        }
        if (!online) return queue()
        try {
          await api(`/api/patients/${patientId}/scans`, { token: tokenRef.current, body: { page_id, file, kind, page_date, ...extra } })
          await refresh()
          return true
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            setConnected(false)
            return queue()
          }
          tell(e instanceof ApiError ? e.message : 'The scan could not be saved.')
          return false
        }
      },

      addFamilyHistory: (patientId, relative, condition, notes) => void send(`/api/patients/${patientId}/family-history`, { relative, condition, notes }),
      addAllergy: (patientId, substance, reaction, severity) => void send(`/api/patients/${patientId}/allergies`, { substance, reaction, severity }),
      linkRelative: (principalPatientId, relatedPatientId, type, mdr) => void send(`/api/patients/${principalPatientId}/relatives`, { related_patient_id: relatedPatientId, type, mdr }),

      hrImport: async (rows, source, dryRun) => {
        try {
          const result = await api<HrImportResult>('/api/employees/import', { token: tokenRef.current, body: { rows, source, dry_run: dryRun } })
          if (!dryRun) await refresh()
          return { result }
        } catch (e) {
          return { error: e instanceof ApiError ? e.message : 'The import failed.' }
        }
      },

      callTicket: async (ticketId) => {
        if (!online) return false
        return (await send(`/api/queue/${ticketId}/call`)) !== null
      },

      startConsult: (ticketId) => void send(`/api/queue/${ticketId}/start`),

      saveConsultation: async (input) => {
        const queueLocally = async () => {
          await enqueue({ kind: 'consult', input })
          return 'local' as const
        }
        // Server unreachable: keep the entry on this computer. Documents stay drafts until signed.
        if (!online) return queueLocally()
        try {
          await api('/api/consultations', { token: tokenRef.current, body: input })
          await refresh()
          return 'saved'
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            setConnected(false)
            return queueLocally()
          }
          tell(e instanceof ApiError ? e.message : 'The consultation could not be saved.')
          throw e
        }
      },

      signDocuments: async (refs, pin) => {
        if (!online) return 'offline'
        try {
          const res = await api<{ result: 'ok' | 'bad-pin' }>('/api/documents/sign', { token: tokenRef.current, body: { refs, pin } })
          await refresh()
          return res.result
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            setConnected(false)
            return 'offline'
          }
          return { error: e instanceof ApiError ? e.message : 'Signing failed.' }
        }
      },

      voidDocument: (kind, id, reason) => void send(`/api/documents/${kind}/${id}/void`, { reason }),

      releaseDocument: (kind, id) => void send(`/api/documents/${kind}/${id}/release`),

      reissueDocument: (kind, id) => {
        const newId = uuid()
        void send(`/api/documents/${kind}/${id}/reissue`, { new_id: newId })
        return newId
      },

      editDraft: (kind, id, patch) => {
        const body = kind === 'rx' ? { items: (patch as Partial<Prescription>).items } : patch
        // A draft can be corrected offline (including one made offline); it is applied after its consultation.
        if (!online) return void enqueue({ kind: 'edit_draft', input: { doc_kind: kind, id, patch: body as Record<string, unknown> } })
        void send(`/api/documents/${kind}/${id}`, body, 'PATCH')
      },

      addLabResult: (labId, result) => void send(`/api/labs/${labId}/result`, { result }),
      updateCategoryRank: (category, rank) => void send(`/api/settings/categories/${category}`, { rank }, 'PATCH'),
      setSignatureImage: (image) => void send('/api/settings/signature', { image }, 'PUT'),

      changePin: async (current, next) => {
        const res = await send<{ ok: boolean }>('/api/settings/pin', { current, next })
        return !!res?.ok
      },

      changePassword: (current, next) => call('/api/auth/password', { current, next }),
      createStaff: (input) => call('/api/staff', input),
      updateStaffDetails: (staffId, patch) => call(`/api/staff/${staffId}`, patch, 'PATCH'),
      setStaffActive: (staffId, active) => call(`/api/staff/${staffId}/active`, { active }),
      resetStaffPassword: (staffId, temporary) => call(`/api/staff/${staffId}/password`, { temporary }),

      scanFolderForm: async (file) => {
        try {
          return { reading: await api<ScanReading>('/api/recognition/scan', { token: tokenRef.current, body: { file } }) }
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) return { offline: true, error: 'The clinic server cannot be reached.' }
          return { error: e instanceof ApiError ? e.message : 'The scan could not be read.' }
        }
      },
      confirmFolderScan: async (eventId, body) => {
        try {
          const out = await api<{ added: number; correct: number; field_count: number }>(`/api/recognition/${eventId}/confirm`, { token: tokenRef.current, body })
          await refresh()
          return out
        } catch (e) {
          return { error: e instanceof ApiError ? e.message : 'Could not save the confirmed form.' }
        }
      },
      captureFolderScan: async (file, patient_hint) => {
        const scan_id = uuid()
        await enqueue({ op_id: scan_id, kind: 'folder_scan', input: { scan_id, file, captured_at: Date.now(), patient_hint } })
      },
      fetchPendingScans: async () => {
        try {
          return await api<PendingScan[]>('/api/recognition/pending', { token: tokenRef.current })
        } catch {
          return null
        }
      },
      openPendingScan: async (eventId) => {
        try {
          return { opened: await api<OpenedScan>(`/api/recognition/${eventId}`, { token: tokenRef.current }) }
        } catch (e) {
          return { error: e instanceof ApiError ? e.message : 'Could not open this photo.' }
        }
      },
      discardPendingScan: async (eventId) => {
        try {
          await api(`/api/recognition/${eventId}/discard`, { token: tokenRef.current, body: {} })
          return null
        } catch (e) {
          return e instanceof ApiError ? e.message : 'Could not discard this photo.'
        }
      },
      fetchRecognitionMetrics: async () => {
        try {
          return await api<RecognitionMetrics>('/api/recognition/metrics', { token: tokenRef.current })
        } catch {
          return null
        }
      },
      fetchBackups: async () => {
        try {
          return await api<BackupStatus>('/api/backups', { token: tokenRef.current })
        } catch {
          return null
        }
      },
      mergePatients: (keep, duplicate, reason) => call('/api/patients/merge', { keep_patient_id: keep, duplicate_patient_id: duplicate, reason }),
      unmergePatient: (patientId, reason) => call(`/api/patients/${patientId}/unmerge`, { reason }),
      markNotDuplicate: (a, b) => call('/api/patients/not-duplicate', { a, b }),
      markAuditSeen: async (upTo) => void (await call('/api/audit/seen', { up_to: upTo })),
      fetchAuditPage: async (before) => {
        const q = new URLSearchParams({ limit: '200' })
        if (before) {
          q.set('before', String(before.at))
          q.set('before_id', before.id)
        }
        try {
          return await api<AuditPage>(`/api/audit?${q}`, { token: tokenRef.current })
        } catch (e) {
          tell(e instanceof ApiError ? e.message : 'Could not load older entries.')
          return null
        }
      },
      exportAudit: async () => {
        let res: Response
        try {
          res = await fetch('/api/audit/export', { method: 'POST', headers: { Authorization: `Bearer ${tokenRef.current}` }, cache: 'no-store' })
        } catch {
          return 'The clinic server cannot be reached.'
        }
        if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'The export failed.'
        const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'gilayon-audit-trail.csv'
        const url = URL.createObjectURL(await res.blob())
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        await refresh()
        return null
      },
      setClinicProfile: (profile) => call('/api/settings/clinic', profile, 'PUT'),
      fetchSecurity: async () => {
        try {
          return await api<SecurityStatus>('/api/security', { token: tokenRef.current })
        } catch {
          return null
        }
      },
      runBackup: async () => {
        try {
          await api('/api/backups', { token: tokenRef.current, body: {} })
          await refresh()
          return null
        } catch (e) {
          await refresh()
          return e instanceof ApiError ? e.message : 'The backup failed.'
        }
      },

      resetDemo: () => {
        void dropOps([...pendingRef.current, ...rejected].map((o) => o.op_id))
        setPending([])
        setRecent([])
        void send('/api/dev/reset')
      },
    }
  }, [data, ready, connected, me, network, pending, rejected, recent, online, setNetwork, refresh, clearSession, enqueue])

  return <Ctx.Provider value={api_}>{children}</Ctx.Provider>
}

export function useClinic() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClinic must be used inside ClinicProvider')
  return ctx
}
