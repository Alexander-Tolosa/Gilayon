import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BackupStatus, ConsultInput, SecurityStatus, Snapshot } from '../api-types'
import { matchScore, todayKey, uuid } from '../lib/helpers'
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
  Patient,
  Person,
  Prescription,
  QueueTicket,
  RelationshipType,
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
  scans: [],
  staff: [],
  audit: [],
  offsite: { pending: 0, lastAt: 0 },
  merged: {},
  auditSeenAt: 0,
  mergedRecords: [],
  notDuplicates: [],
  lastImport: { at: 0, count: 0, source: '' },
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

/** What this computer shows for entries still waiting in its offline queue, applied in the order they were made. */
function overlayOp(s: Snapshot, op: OutboxOp): Snapshot {
  if (op.kind === 'scan') {
    if (s.scans.some((p) => p.page_id === op.input.page_id)) return s
    return { ...s, scans: [...s.scans, { page_id: op.input.page_id, patient_id: op.input.patient_id, file: op.input.file, kind: op.input.scan_kind, page_date: op.input.page_date, uploaded_by: op.staff_id, uploaded_at: op.at }] }
  }
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
  search: (q: string, limit?: number) => SearchHit[]
  findDuplicates: (full_name: string, birthdate: string) => Person[]
  touch: (patientId: string) => void
  // front desk
  verify: (personId: string, entered: { full_name: string; birthdate: string; employee_no?: string; principal_no?: string }) => { ok: boolean; mismatches: string[] }
  flagForHR: (personId: string, note: string) => void
  completeRecord: (patientId: string, patch: Partial<Patient> & Partial<Person>, reason?: string) => void
  createDependent: (principalPatientId: string, input: NewPersonInput, type: RelationshipType, mdr: boolean) => Promise<Patient | null>
  issueTicket: (patientId: string, categories: CategoryKey[], service: ServiceType, reason: string) => Promise<QueueTicket | null>
  setTicketStatus: (ticketId: string, status: TicketStatus) => void
  markUrgent: (ticketId: string) => void
  uploadScan: (patientId: string, file: string, kind: ScanKind, page_date: string) => Promise<boolean>
  addFamilyHistory: (patientId: string, relative: string, condition: string, notes?: string) => void
  addAllergy: (patientId: string, substance: string, reaction: string, severity: 'Mild' | 'Moderate' | 'Severe') => void
  linkRelative: (principalPatientId: string, relatedPatientId: string, type: RelationshipType, mdr: boolean) => void
  hrImport: (rows: RawHrRow[], source: string, dryRun: boolean) => Promise<{ result?: HrImportResult; error?: string }>
  // doctor
  callTicket: (ticketId: string) => Promise<boolean>
  startConsult: (ticketId: string) => void
  saveConsultation: (input: ConsultInput) => Promise<'saved' | 'local'>
  signDocuments: (refs: { kind: 'rx' | 'doc'; id: string }[], pin: string) => Promise<'ok' | 'bad-pin' | 'offline'>
  voidDocument: (kind: 'rx' | 'doc', id: string, reason: string) => void
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
  fetchBackups: () => Promise<BackupStatus | null>
  fetchSecurity: () => Promise<SecurityStatus | null>
  runBackup: () => Promise<string | null>
  resetDemo: () => void
  online: boolean
}

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
  const pending = useMemo(() => queued.filter((o) => o.staff_id === session), [queued, session])
  const [recent, setRecent] = useState<string[]>(() => ss.get<string[]>(S_RECENT, []))
  const tokenRef = useRef(token)
  const networkRef = useRef(network)
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
    try {
      if (tokenRef.current) {
        const snap = await api<Snapshot>('/api/state', { token: tokenRef.current })
        setShared(snap)
        setReady(true)
        setConnected(true)
        return snap
      }
      const pub = await api<Pick<Snapshot, 'tickets' | 'categories' | 'staff'>>('/api/public/queue')
      const snap = { ...EMPTY, ...pub }
      setShared(snap)
      setReady(true)
      setConnected(true)
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
      const gone = new Set([...res.applied, ...res.rejected.map((r) => r.op_id)])
      await dropOps([...gone])
      setPending((p) => p.filter((o) => !gone.has(o.op_id)))
      if (res.rejected.length) tell(`${res.rejected.length} offline ${res.rejected.length === 1 ? 'entry' : 'entries'} could not be applied: ${res.rejected[0].reason}`)
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
      recent,
      online,
      signIn: async (staffId, password) => {
        try {
          const res = await api<{ token: string; staff_id: string }>('/api/auth/login', { body: { staff_id: staffId, password } })
          tokenRef.current = res.token
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
      search: (q, limit = 8) => {
        if (!q.trim()) return []
        const pool = online ? data.persons : data.persons.filter((p) => recent.includes(patientOfPerson(p.person_id)?.patient_id ?? ''))
        return pool
          .map((p) => {
            const employee = employeeOfPerson(p.person_id)
            const pt = patientOfPerson(p.person_id)
            const principalRel = pt ? data.relationships.find((r) => r.related_patient_id === pt.patient_id) : undefined
            const principal = principalRel ? personOfPatient(principalRel.patient_id) : undefined
            return { person: p, employee, patient: pt, principal, score: matchScore(q, p.full_name, [employee?.employee_no ?? '', pt?.patient_no ?? '', pt?.legacy_folder_no ?? '']) }
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
        const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
        if (n(entered.full_name) !== n(p.full_name)) mismatches.push('Full name')
        if (entered.birthdate !== p.birthdate) mismatches.push('Birthdate')
        if (emp && (entered.employee_no ?? '').trim().toUpperCase() !== emp.employee_no) mismatches.push('Employee ID')
        if (!emp && entered.principal_no !== undefined) {
          const pt = patientOfPerson(personId)
          const rel = pt && data.relationships.find((r) => r.related_patient_id === pt.patient_id)
          const principalEmp = rel && employeeOfPerson(personOfPatient(rel.patient_id)?.person_id)
          if (!principalEmp || entered.principal_no.trim().toUpperCase() !== principalEmp.employee_no) mismatches.push('Employee ID of the principal')
        }
        void send('/api/patients/verify', { person_id: personId, ...entered })
        return { ok: mismatches.length === 0, mismatches }
      },

      flagForHR: (personId, note) => void send('/api/patients/flag', { person_id: personId, note }),

      completeRecord: (patientId, patch, reason) => {
        const { person_id: _a, patient_id: _b, created_at: _c, created_by: _d, ...rest } = patch as Record<string, unknown>
        void send(`/api/patients/${patientId}`, { patch: rest, reason }, 'PATCH')
      },

      createDependent: async (principalPatientId, input, type, mdr) => {
        if (!online) return null
        const res = await send<{ patient_id: string }>(`/api/patients/${principalPatientId}/dependents`, { person: input, type, mdr })
        if (!res) return null
        return (await refresh())?.patients.find((p) => p.patient_id === res.patient_id) ?? null
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
      uploadScan: async (patientId, file, kind, page_date) => {
        const page_id = uuid().replace(/-/g, '')
        const queue = async () => {
          await enqueue({ kind: 'scan', input: { page_id, patient_id: patientId, file, scan_kind: kind, page_date } })
          return true
        }
        if (!online) return queue()
        try {
          await api(`/api/patients/${patientId}/scans`, { token: tokenRef.current, body: { page_id, file, kind, page_date } })
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
          tell(e instanceof ApiError ? e.message : 'Signing failed.')
          return 'bad-pin'
        }
      },

      voidDocument: (kind, id, reason) => void send(`/api/documents/${kind}/${id}/void`, { reason }),

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
        void dropOps(pendingRef.current.map((o) => o.op_id))
        setPending([])
        setRecent([])
        void send('/api/dev/reset')
      },
    }
  }, [data, ready, connected, me, network, pending, recent, online, setNetwork, refresh, clearSession, enqueue])

  return <Ctx.Provider value={api_}>{children}</Ctx.Provider>
}

export function useClinic() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClinic must be used inside ClinicProvider')
  return ctx
}
