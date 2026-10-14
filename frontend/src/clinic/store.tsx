import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildSeed, type ClinicData } from './seed'
import { ageOf, matchScore, todayKey, topCategory, uuid } from './lib'
import type {
  AuditAction,
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
  Vitals,
} from './types'

/*
  Shared clinic state stands in for the clinic server's PostgreSQL database: it lives in
  localStorage so every tab (front desk, doctor, waiting screen) sees the same records and the
  queue updates live across tabs. Each tab is one "clinic computer": its sign-in, network mode,
  and offline queue live in sessionStorage. While a tab is offline, consultation saves go into
  that tab's browser queue and are applied to the shared records when it reconnects.
*/

const KEY = 'himsog-clinic-v1'
const S_SESSION = 'himsog-session'
const S_NET = 'himsog-network'
const S_PENDING = 'himsog-pending'
const S_RECENT = 'himsog-recent'

type Shared = ClinicData & { seededOn: string; offsite: { pending: number; lastAt: number } }

function freshShared(): Shared {
  return { ...buildSeed(), seededOn: todayKey(), offsite: { pending: 0, lastAt: Date.now() } }
}

function loadShared(): Shared {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Shared
      // Seed data is relative to today; reseed if the stored copy is from an earlier day.
      if (parsed.seededOn === todayKey()) return parsed
    }
  } catch {
    /* fall through */
  }
  return freshShared()
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
      sessionStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
}

/* --------------------------------- Inputs ---------------------------------- */

export type ConsultInput = {
  consultation_id: string
  patient_id: string
  ticket_id?: string
  service_type: ServiceType
  chief_complaint: string
  treatment_notes: string
  vitals?: Vitals
  diagnoses: { description: string; icd10_code: string }[]
  rx: { drug_name: string; dose: string; frequency: string; quantity: number }[]
  certificate?: { purpose: string; findings: string; rest_days?: number; remarks?: string }
  labs: string[]
  correction_of?: string
  // Ids generated up front so a retried sync can never create a duplicate.
  rx_id: string
  doc_id: string
  lab_ids: string[]
}

export type PendingOp = { op_id: string; kind: 'consult'; input: ConsultInput; doctor_id: string; at: number }

export type NewPersonInput = { full_name: string; birthdate: string; sex: Sex; contact: string; civil_status: CivilStatus; philhealth_pin?: string; pwd_id?: string }

/* ------------------------------ Pure reducers ------------------------------ */

function log(s: Shared, staff_id: string, action: AuditAction, table_name: string, record_id: string, summary: string, detail?: string): Shared {
  return {
    ...s,
    audit: [{ log_id: uuid(), staff_id, action, table_name, record_id, summary, logged_at: Date.now(), detail }, ...s.audit],
    offsite: { ...s.offsite, pending: s.offsite.pending + 1 },
  }
}

const nameOfPatient = (s: Shared, patientId: string) => {
  const pt = s.patients.find((p) => p.patient_id === patientId)
  return s.persons.find((p) => p.person_id === pt?.person_id)?.full_name ?? 'patient'
}

function applyConsult(s: Shared, input: ConsultInput, doctor_id: string, local: boolean): Shared {
  if (s.consultations.some((c) => c.consultation_id === input.consultation_id)) return s // idempotent retry
  const created = Date.now()
  const consult: Consultation = {
    consultation_id: input.consultation_id,
    patient_id: input.patient_id,
    ticket_id: input.ticket_id,
    doctor_id,
    service_type: input.service_type,
    consult_date: todayKey(),
    created_at: created,
    chief_complaint: input.chief_complaint,
    treatment_notes: input.treatment_notes,
    vitals: input.vitals,
    correction_of: input.correction_of,
    sync: local ? 'local' : undefined,
  }
  const rx: Prescription[] = input.rx.length
    ? [{ prescription_id: input.rx_id, consultation_id: consult.consultation_id, patient_id: input.patient_id, doctor_id, status: 'draft', created_at: created, items: input.rx.map((r) => ({ ...r, item_id: uuid(), prescription_id: input.rx_id })) }]
    : []
  const docs: DocumentRow[] = input.certificate
    ? [{ document_id: input.doc_id, patient_id: input.patient_id, consultation_id: consult.consultation_id, doctor_id, doc_type: 'Medical certificate', ...input.certificate, status: 'draft', created_at: created }]
    : []
  const labs: LabOrder[] = input.labs.map((t, i) => ({ lab_id: input.lab_ids[i] ?? uuid(), patient_id: input.patient_id, consultation_id: consult.consultation_id, requested_by: doctor_id, test_name: t, status: 'requested', requested_at: created }))
  let next: Shared = {
    ...s,
    consultations: [...s.consultations, consult],
    diagnoses: [...s.diagnoses, ...input.diagnoses.map((d) => ({ ...d, diagnosis_id: uuid(), consultation_id: consult.consultation_id }))],
    prescriptions: [...s.prescriptions, ...rx],
    documents: [...s.documents, ...docs],
    labs: [...s.labs, ...labs],
    tickets: s.tickets.map((t) => (t.ticket_id === input.ticket_id ? { ...t, status: 'done' as TicketStatus, done_at: created } : t)),
  }
  if (!local) next = log(next, doctor_id, 'create', 'consultation', consult.consultation_id, `${input.correction_of ? 'Added correction to consultation' : 'Added consultation'} for ${nameOfPatient(s, input.patient_id)}`)
  return next
}

/* --------------------------------- Context --------------------------------- */

type Api = {
  data: Shared
  me: Staff | null
  network: NetworkMode
  pending: PendingOp[]
  recent: string[]
  signIn: (staffId: string) => void
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
  createDependent: (principalPatientId: string, input: NewPersonInput, type: RelationshipType, mdr: boolean) => Patient | null
  issueTicket: (patientId: string, categories: CategoryKey[], service: ServiceType, reason: string) => QueueTicket | null
  setTicketStatus: (ticketId: string, status: TicketStatus) => void
  markUrgent: (ticketId: string) => void
  uploadScan: (patientId: string, file: string, kind: ScanKind, page_date: string) => boolean
  addFamilyHistory: (patientId: string, relative: string, condition: string, notes?: string) => void
  addAllergy: (patientId: string, substance: string, reaction: string, severity: 'Mild' | 'Moderate' | 'Severe') => void
  linkRelative: (principalPatientId: string, relatedPatientId: string, type: RelationshipType, mdr: boolean) => void
  importEmployees: (rows: { employee_no: string; full_name: string; birthdate: string; sex: Sex; office: string; position: string; contact?: string }[], source: string) => { created: number; updated: number; unchanged: number }
  // doctor
  callTicket: (ticketId: string) => boolean
  startConsult: (ticketId: string) => void
  saveConsultation: (input: ConsultInput) => 'saved' | 'local'
  signDocuments: (refs: { kind: 'rx' | 'doc'; id: string }[], pin: string) => 'ok' | 'bad-pin' | 'offline'
  voidDocument: (kind: 'rx' | 'doc', id: string, reason: string) => void
  reissueDocument: (kind: 'rx' | 'doc', id: string) => string | null
  editDraft: (kind: 'rx' | 'doc', id: string, patch: Partial<Prescription> | Partial<DocumentRow>) => void
  addLabResult: (labId: string, result: string) => void
  updateCategoryRank: (category: CategoryKey, rank: number) => void
  updateStaff: (staffId: string, patch: Partial<Staff>) => void
  resetDemo: () => void
  online: boolean
}

export type SearchHit = { person: Person; employee?: Employee; patient?: Patient; principal?: Person; score: number }

const Ctx = createContext<Api | null>(null)

export function ClinicProvider({ children }: { children: ReactNode }) {
  const [shared, setShared] = useState<Shared>(loadShared)
  const [session, setSession] = useState<string | null>(() => ss.get<string | null>(S_SESSION, null))
  const [network, setNetworkState] = useState<NetworkMode>(() => ss.get<NetworkMode>(S_NET, 'online'))
  const [pending, setPending] = useState<PendingOp[]>(() => ss.get<PendingOp[]>(S_PENDING, []))
  const [recent, setRecent] = useState<string[]>(() => ss.get<string[]>(S_RECENT, []))
  const lastWritten = useRef<string>('')

  // Persist shared state, and pick up changes written by other tabs (live queue across screens).
  useEffect(() => {
    const raw = JSON.stringify(shared)
    if (raw === lastWritten.current) return
    lastWritten.current = raw
    try {
      localStorage.setItem(KEY, raw)
    } catch {
      /* storage full: the demo keeps working in memory */
    }
  }, [shared])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue || e.newValue === lastWritten.current) return
      lastWritten.current = e.newValue
      setShared(JSON.parse(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  useEffect(() => ss.set(S_SESSION, session), [session])
  useEffect(() => ss.set(S_NET, network), [network])
  useEffect(() => ss.set(S_PENDING, pending), [pending])
  useEffect(() => ss.set(S_RECENT, recent), [recent])

  // What this computer sees: the shared records plus anything waiting in its own browser queue.
  const data = useMemo(() => pending.reduce((s, op) => applyConsult(s, op.input, op.doctor_id, true), shared), [shared, pending])
  const me = shared.staff.find((s) => s.staff_id === session) ?? null
  const actor = me?.staff_id ?? 'system'
  const online = network !== 'offline'

  const setNetwork = useCallback(
    (m: NetworkMode) => {
      setNetworkState(m)
      if (m !== 'offline' && pending.length) {
        // Reconnected: send the browser queue to the server. Ids make retries safe.
        setShared((s) => {
          let next = s
          for (const op of pending) {
            next = applyConsult(next, op.input, op.doctor_id, false)
            next = log(next, 'system', 'sync', 'consultation', op.input.consultation_id, `Synced consultation for ${nameOfPatient(next, op.input.patient_id)} from the offline queue`)
          }
          return next
        })
        setPending([])
      }
      if (m === 'online') setShared((s) => ({ ...s, offsite: { pending: 0, lastAt: Date.now() } }))
    },
    [pending],
  )

  const api = useMemo<Api>(() => {
    const person = (id?: string) => data.persons.find((p) => p.person_id === id)
    const patient = (id?: string) => data.patients.find((p) => p.patient_id === id)
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

    const mutate = (fn: (s: Shared) => Shared) => setShared(fn)

    return {
      data,
      me,
      network,
      pending,
      recent,
      online,
      signIn: (staffId) => {
        setSession(staffId)
        mutate((s) => log(s, staffId, 'verify', 'user_account', staffId, 'Signed in'))
      },
      signOut: () => setSession(null),
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

      findDuplicates: (full_name, birthdate) =>
        data.persons.filter((p) => p.birthdate === birthdate && matchScore(full_name, p.full_name, []) >= 0.75),

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
        const ok = mismatches.length === 0
        mutate((s) => log(s, actor, ok ? 'verify' : 'flag', 'person', personId, ok ? `Verified identity of ${p.full_name} against the HR list` : `Verification failed for ${p.full_name}: ${mismatches.join(', ')} did not match`))
        return { ok, mismatches }
      },

      flagForHR: (personId, note) =>
        mutate((s) => {
          const pt = s.patients.find((x) => x.person_id === personId)
          const next = pt ? { ...s, patients: s.patients.map((x) => (x.patient_id === pt.patient_id ? { ...x, hr_flag: note } : x)) } : s
          return log(next, actor, 'flag', 'person', personId, `Flagged for HR: ${note}`)
        }),

      completeRecord: (patientId, patch, reason) =>
        mutate((s) => {
          const pt = s.patients.find((x) => x.patient_id === patientId)!
          const per = s.persons.find((x) => x.person_id === pt.person_id)!
          const nextPer: Person = { ...per }
          const nextPt: Patient = { ...pt }
          const changed: string[] = []
          const apply = <T extends object>(target: T, source: T, keys: (keyof T)[]) => {
            for (const k of keys) {
              if (!(k in patch)) continue
              const value = (patch as Record<string, unknown>)[k as string]
              if (value === source[k]) continue
              ;(target as Record<string, unknown>)[k as string] = value
              changed.push(`${String(k)}: "${String(source[k] ?? '')}" → "${String(value ?? '')}"`)
            }
          }
          apply(nextPer, per, ['full_name', 'birthdate', 'sex', 'contact'])
          apply(nextPt, pt, ['civil_status', 'pwd_id', 'philhealth_pin', 'legacy_folder_no', 'hr_flag'])
          if (!changed.length) return s
          const next = { ...s, persons: s.persons.map((x) => (x.person_id === per.person_id ? nextPer : x)), patients: s.patients.map((x) => (x.patient_id === pt.patient_id ? nextPt : x)) }
          // Both versions stay in the audit log; the later edit wins.
          return log(next, actor, 'edit', 'patient', patientId, `Edited details of ${nextPer.full_name}${reason ? ` (${reason})` : ''}`, changed.join('; '))
        }),

      createDependent: (principalPatientId, input, type, mdr) => {
        if (!online) return null
        const person: Person = { person_id: uuid(), full_name: input.full_name.trim(), birthdate: input.birthdate, sex: input.sex, contact: input.contact }
        const n = Math.max(shared.counters.patient, ...shared.patients.map((p) => Number(p.patient_no.slice(4)) || 0)) + 1
        const pt: Patient = { patient_id: uuid(), person_id: person.person_id, patient_no: `HMO-${String(n).padStart(5, '0')}`, civil_status: input.civil_status, philhealth_pin: input.philhealth_pin || undefined, pwd_id: input.pwd_id || undefined, created_at: Date.now(), created_by: actor }
        const rel = { relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: pt.patient_id, relationship_type: type, listed_in_mdr: mdr }
        mutate((s) => {
          if (s.patients.some((x) => x.patient_id === pt.patient_id)) return s
          const next: Shared = { ...s, persons: [...s.persons, person], patients: [...s.patients, pt], relationships: [...s.relationships, rel], counters: { ...s.counters, patient: n } }
          return log(next, actor, 'create', 'patient', pt.patient_id, `Created record for ${person.full_name} (${type.toLowerCase()} of ${nameOfPatient(s, principalPatientId)})`)
        })
        return pt
      },

      issueTicket: (patientId, categories, service, reason) => {
        if (!online) return null
        const today = todayKey()
        const per = personOfPatient(patientId)!
        const cats = [...new Set<CategoryKey>([...categories, ...(ageOf(per.birthdate) >= 60 ? (['senior'] as CategoryKey[]) : [])])]
        const ticket: QueueTicket = {
          ticket_id: uuid(),
          patient_id: patientId,
          categories: cats.length ? cats : ['regular'],
          category_id: topCategory(cats, data.categories),
          verified_by: actor,
          is_returning: isReturning(patientId),
          // Only the server issues queue numbers, so two computers never hand out the same one.
          queue_no: Math.max(0, ...data.tickets.filter((t) => t.day === today).map((t) => t.queue_no)) + 1,
          service_type: service,
          reason: reason || undefined,
          status: 'waiting',
          checked_in_at: Date.now(),
          day: today,
        }
        mutate((s) => log({ ...s, tickets: [...s.tickets, ticket] }, actor, 'check-in', 'queue_ticket', ticket.ticket_id, `Issued queue number for ${per.full_name} (${ticket.category_id} lane, ${service})`))
        return ticket
      },

      setTicketStatus: (ticketId, status) =>
        mutate((s) => {
          const t = s.tickets.find((x) => x.ticket_id === ticketId)
          if (!t) return s
          const next = { ...s, tickets: s.tickets.map((x) => (x.ticket_id === ticketId ? { ...x, status, called_at: status === 'waiting' ? undefined : x.called_at, doctor_id: status === 'waiting' ? undefined : x.doctor_id } : x)) }
          const label = status === 'left' ? 'Marked left without being seen' : status === 'waiting' ? 'Returned to the waiting list' : `Set status to ${status}`
          return log(next, actor, 'status', 'queue_ticket', ticketId, `${label}: ${nameOfPatient(s, t.patient_id)}`)
        }),

      markUrgent: (ticketId) =>
        mutate((s) => {
          const t = s.tickets.find((x) => x.ticket_id === ticketId)
          if (!t) return s
          const cats = [...new Set<CategoryKey>(['urgent', ...t.categories.filter((c) => c !== 'regular')])]
          const next = { ...s, tickets: s.tickets.map((x) => (x.ticket_id === ticketId ? { ...x, categories: cats, category_id: 'urgent' as CategoryKey } : x)) }
          return log(next, actor, 'edit', 'queue_ticket', ticketId, `Flagged urgent: ${nameOfPatient(s, t.patient_id)} moved to the top of the queue`)
        }),

      uploadScan: (patientId, file, kind, page_date) => {
        if (!online) return false
        mutate((s) => log({ ...s, scans: [...s.scans, { page_id: uuid(), patient_id: patientId, file, kind, page_date, uploaded_by: actor, uploaded_at: Date.now() }] }, actor, 'upload', 'scanned_page', patientId, `Attached a scanned ${kind.toLowerCase()} page to ${nameOfPatient(s, patientId)}'s record`))
        return true
      },

      addFamilyHistory: (patientId, relative, condition, notes) =>
        mutate((s) => log({ ...s, familyHistory: [...s.familyHistory, { history_id: uuid(), patient_id: patientId, relative, condition, notes }] }, actor, 'create', 'family_history', patientId, `Added family history (${relative}: ${condition}) for ${nameOfPatient(s, patientId)}`)),

      addAllergy: (patientId, substance, reaction, severity) =>
        mutate((s) => log({ ...s, allergies: [...s.allergies, { allergy_id: uuid(), patient_id: patientId, substance, reaction, severity }] }, actor, 'create', 'allergy', patientId, `Recorded allergy to ${substance} for ${nameOfPatient(s, patientId)}`)),

      linkRelative: (principalPatientId, relatedPatientId, type, mdr) =>
        mutate((s) => log({ ...s, relationships: [...s.relationships, { relationship_id: uuid(), patient_id: principalPatientId, related_patient_id: relatedPatientId, relationship_type: type, listed_in_mdr: mdr }] }, actor, 'link', 'patient_relationship', principalPatientId, `Linked ${nameOfPatient(s, relatedPatientId)} as ${type.toLowerCase()} of ${nameOfPatient(s, principalPatientId)}`)),

      importEmployees: (rows, source) => {
        let created = 0
        let updated = 0
        let unchanged = 0
        const persons = [...shared.persons]
        let employees = [...shared.employees]
        const patients = [...shared.patients]
        let counter = shared.counters.patient
        for (const r of rows) {
          const emp = employees.find((e) => e.employee_no === r.employee_no)
          if (emp) {
            const idx = persons.findIndex((p) => p.person_id === emp.person_id)
            if (emp.office !== r.office || emp.position !== r.position || persons[idx].full_name !== r.full_name) {
              updated++
              employees = employees.map((e) => (e.employee_id === emp.employee_id ? { ...e, office: r.office, position: r.position } : e))
              persons[idx] = { ...persons[idx], full_name: r.full_name }
            } else unchanged++
          } else {
            created++
            const per: Person = { person_id: uuid(), full_name: r.full_name, birthdate: r.birthdate, sex: r.sex, contact: r.contact ?? '' }
            persons.push(per)
            employees.push({ employee_id: uuid(), person_id: per.person_id, employee_no: r.employee_no, office: r.office, position: r.position })
            // Importing the HR list creates the patient records.
            patients.push({ patient_id: uuid(), person_id: per.person_id, patient_no: `HMO-${String(++counter).padStart(5, '0')}`, civil_status: 'Single', created_at: Date.now(), created_by: 'import' })
          }
        }
        const summary = `Imported HR employee list (${source}): ${created} new, ${updated} updated, ${unchanged} unchanged`
        mutate((s) => log({ ...s, persons, employees, patients, counters: { ...s.counters, patient: counter }, lastImport: { at: Date.now(), count: rows.length, source } }, actor, 'import', 'employee', 'hr-list', summary))
        return { created, updated, unchanged }
      },

      callTicket: (ticketId) => {
        if (!online) return false
        mutate((s) => {
          const t = s.tickets.find((x) => x.ticket_id === ticketId)
          if (!t) return s
          const next = { ...s, tickets: s.tickets.map((x) => (x.ticket_id === ticketId ? { ...x, status: 'called' as TicketStatus, called_at: Date.now(), doctor_id: actor } : x)) }
          return log(next, actor, 'call', 'queue_ticket', ticketId, `Called ${nameOfPatient(s, t.patient_id)}`)
        })
        return true
      },

      startConsult: (ticketId) => mutate((s) => ({ ...s, tickets: s.tickets.map((x) => (x.ticket_id === ticketId ? { ...x, status: 'in_consult' as TicketStatus, called_at: x.called_at ?? Date.now(), doctor_id: x.doctor_id ?? actor } : x)) })),

      saveConsultation: (input) => {
        if (!online) {
          // Server unreachable: queue the entry in this browser. Documents stay drafts until signed.
          setPending((p) => [...p, { op_id: uuid(), kind: 'consult', input, doctor_id: actor, at: Date.now() }])
          return 'local'
        }
        mutate((s) => applyConsult(s, input, actor, false))
        return 'saved'
      },

      signDocuments: (refs, pin) => {
        if (!online) return 'offline'
        if (!me || me.pin !== pin) {
          mutate((s) => log(s, actor, 'flag', 'staff', actor, 'Signing failed: incorrect PIN'))
          return 'bad-pin'
        }
        mutate((s) => {
          let next = s
          const year = new Date().getFullYear()
          for (const ref of refs) {
            const issued_at = Date.now()
            const signature = `${me.name} · PRC ${me.license_no} · PIN verified · ${new Date(issued_at).toISOString()}`
            // Only the server issues document numbers.
            if (ref.kind === 'rx') {
              const n = next.counters.rx + 1
              const document_no = `RX-${year}-${String(n).padStart(6, '0')}`
              next = { ...next, counters: { ...next.counters, rx: n }, prescriptions: next.prescriptions.map((r) => (r.prescription_id === ref.id && r.status === 'draft' ? { ...r, status: 'signed', signed_by: actor, issued_at, document_no, signature } : r)) }
              next = log(next, actor, 'sign', 'prescription', ref.id, `Signed prescription ${document_no}`)
            } else {
              const n = next.counters.mc + 1
              const document_no = `MC-${year}-${String(n).padStart(6, '0')}`
              next = { ...next, counters: { ...next.counters, mc: n }, documents: next.documents.map((d) => (d.document_id === ref.id && d.status === 'draft' ? { ...d, status: 'signed', signed_by: actor, issued_at, document_no, signature } : d)) }
              next = log(next, actor, 'sign', 'document', ref.id, `Signed medical certificate ${document_no}`)
            }
          }
          return next
        })
        return 'ok'
      },

      voidDocument: (kind, id, reason) =>
        mutate((s) => {
          // A signed document is never edited: it keeps its row, marked voided with a reason.
          if (kind === 'rx') {
            const r = s.prescriptions.find((x) => x.prescription_id === id)!
            return log({ ...s, prescriptions: s.prescriptions.map((x) => (x.prescription_id === id ? { ...x, status: 'voided', void_reason: reason } : x)) }, actor, 'void', 'prescription', id, `Voided ${r.document_no ?? 'draft prescription'}: ${reason}`)
          }
          const d = s.documents.find((x) => x.document_id === id)!
          return log({ ...s, documents: s.documents.map((x) => (x.document_id === id ? { ...x, status: 'voided', void_reason: reason } : x)) }, actor, 'void', 'document', id, `Voided ${d.document_no ?? 'draft certificate'}: ${reason}`)
        }),

      reissueDocument: (kind, id) => {
        const newId = uuid()
        mutate((s) => {
          if (kind === 'rx') {
            const r = s.prescriptions.find((x) => x.prescription_id === id)!
            const copy: Prescription = { ...r, prescription_id: newId, status: 'draft', created_at: Date.now(), replaces: id, document_no: undefined, signature: undefined, signed_by: undefined, issued_at: undefined, void_reason: undefined, doctor_id: actor, items: r.items.map((i) => ({ ...i, item_id: uuid(), prescription_id: newId })) }
            return log({ ...s, prescriptions: [...s.prescriptions, copy] }, actor, 'create', 'prescription', newId, `Drafted replacement for ${r.document_no}`)
          }
          const d = s.documents.find((x) => x.document_id === id)!
          const copy: DocumentRow = { ...d, document_id: newId, status: 'draft', created_at: Date.now(), replaces: id, document_no: undefined, signature: undefined, signed_by: undefined, issued_at: undefined, void_reason: undefined, doctor_id: actor }
          return log({ ...s, documents: [...s.documents, copy] }, actor, 'create', 'document', newId, `Drafted replacement for ${d.document_no}`)
        })
        return newId
      },

      editDraft: (kind, id, patch) =>
        mutate((s) =>
          kind === 'rx'
            ? { ...s, prescriptions: s.prescriptions.map((x) => (x.prescription_id === id && x.status === 'draft' ? { ...x, ...(patch as Partial<Prescription>) } : x)) }
            : { ...s, documents: s.documents.map((x) => (x.document_id === id && x.status === 'draft' ? { ...x, ...(patch as Partial<DocumentRow>) } : x)) },
        ),

      addLabResult: (labId, result) =>
        mutate((s) => {
          const l = s.labs.find((x) => x.lab_id === labId)!
          return log({ ...s, labs: s.labs.map((x) => (x.lab_id === labId ? { ...x, status: 'resulted', result, result_date: todayKey() } : x)) }, actor, 'edit', 'lab_order', labId, `Entered result for ${l.test_name}`)
        }),

      updateCategoryRank: (category, rank) =>
        mutate((s) => log({ ...s, categories: s.categories.map((c) => (c.category_id === category ? { ...c, rank } : c)) }, actor, 'edit', 'priority_category', category, `Set ${category} lane rank to ${rank}`)),

      updateStaff: (staffId, patch) =>
        mutate((s) => log({ ...s, staff: s.staff.map((x) => (x.staff_id === staffId ? { ...x, ...patch } : x)) }, actor, 'edit', 'staff', staffId, patch.signature_image ? 'Updated signature image' : patch.pin ? 'Changed signing PIN' : 'Updated staff details')),

      resetDemo: () => {
        setPending([])
        setRecent([])
        setShared(freshShared())
      },
    }
  }, [data, shared, me, network, pending, recent, online, actor, setNetwork])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useClinic() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClinic must be used inside ClinicProvider')
  return ctx
}
