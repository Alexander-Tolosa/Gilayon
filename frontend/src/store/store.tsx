import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { APPOINTMENTS, AUDIT, DOCTORS, INVOICES, MESSAGES, PATIENTS, STAFF, TASKS } from '../data/seed'
import type {
  Appointment,
  AppointmentStatus,
  AuditEntry,
  Doctor,
  IntakeInput,
  Invoice,
  LabOrder,
  Message,
  Patient,
  Referral,
  Role,
  Session,
  Task,
  Visit,
} from '../data/types'
import { todayISO, uid } from '../lib/utils'

const KEY = 'recora-demo-v1'

type State = {
  session: Session
  patients: Patient[]
  appointments: Appointment[]
  messages: Message[]
  tasks: Task[]
  invoices: Invoice[]
  audit: AuditEntry[]
}

function fresh(): State {
  return {
    session: null,
    patients: PATIENTS,
    appointments: APPOINTMENTS,
    messages: MESSAGES,
    tasks: TASKS,
    invoices: INVOICES,
    audit: AUDIT,
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh()
    const parsed = JSON.parse(raw) as State & { seededOn?: string }
    // Seed data is relative to "today"; reseed when the stored copy is from an earlier day.
    if (parsed.seededOn !== todayISO()) return fresh()
    return parsed
  } catch {
    return fresh()
  }
}

export type ConsultationInput = {
  appointmentId: string
  template: Visit['template']
  notes: Record<string, string>
  diagnoses: string[]
  prescriptions: { name: string; dose: string; sig: string }[]
  orders: { name: string; kind: LabOrder['kind'] }[]
  referral?: { to: string; specialty: string; reason: string }
  vitals?: { systolic: number; diastolic: number; heartRate: number; weight: number }
  summary: string
}

type Api = State & {
  doctors: Doctor[]
  actorName: string
  signIn: (role: Role, userId: string) => void
  signOut: () => void
  registerPatient: (input: IntakeInput, opts?: { byStaff?: boolean }) => Patient
  bookAppointment: (a: Omit<Appointment, 'id' | 'status'> & { status?: AppointmentStatus }) => Appointment
  setAppointmentStatus: (id: string, status: AppointmentStatus) => void
  sendMessage: (patientId: string, from: Message['from'], author: string, text: string) => void
  completeConsultation: (input: ConsultationInput) => void
  toggleTask: (id: string) => void
  addTask: (t: Omit<Task, 'id' | 'done'>) => void
  setInsuranceStatus: (patientId: string, status: Patient['insurance']['status']) => void
  setInvoiceStatus: (id: string, status: Invoice['status']) => void
  updatePatient: (id: string, patch: Partial<Patient>) => void
  log: (action: string, target: string) => void
  resetDemo: () => void
}

const Ctx = createContext<Api | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, seededOn: todayISO() }))
    } catch {
      /* storage unavailable: the demo still works in memory */
    }
  }, [state])

  const actorName = useMemo(() => {
    const s = state.session
    if (!s) return 'Guest'
    if (s.role === 'doctor') return DOCTORS.find((d) => d.id === s.userId)?.name ?? 'Doctor'
    if (s.role === 'secretary') return STAFF.find((d) => d.id === s.userId)?.name ?? 'Front desk'
    return state.patients.find((p) => p.id === s.userId)?.name ?? 'Patient'
  }, [state.session, state.patients])

  const entry = useCallback(
    (action: string, target: string, s: State): AuditEntry => ({
      id: uid('au'),
      at: Date.now(),
      actor: actorName,
      role: s.session?.role ?? 'system',
      action,
      target,
    }),
    [actorName],
  )

  const api: Api = useMemo(() => {
    const patientLabel = (s: State, id: string) => {
      const p = s.patients.find((x) => x.id === id)
      return p ? `${p.name} (${p.id})` : id
    }

    return {
      ...state,
      doctors: DOCTORS,
      actorName,

      signIn: (role, userId) =>
        setState((s) => {
          const name =
            role === 'doctor'
              ? DOCTORS.find((d) => d.id === userId)?.name
              : role === 'secretary'
                ? STAFF.find((d) => d.id === userId)?.name
                : s.patients.find((p) => p.id === userId)?.name
          return {
            ...s,
            session: { role, userId },
            audit: [{ id: uid('au'), at: Date.now(), actor: name ?? 'User', role, action: 'Signed in', target: 'Himsog web' }, ...s.audit],
          }
        }),

      signOut: () => setState((s) => ({ ...s, session: null })),

      registerPatient: (input, opts) => {
        const byStaff = !!opts?.byStaff
        const id = `RC-${10700 + Math.floor(Math.random() * 280)}`
        const patient: Patient = {
          id,
          name: input.name.trim(),
          age: input.age,
          sex: input.sex,
          dob: `${new Date().getFullYear() - input.age}-01-01`,
          phone: input.phone,
          email: input.email,
          bloodType: 'Unknown',
          address: '',
          doctorId: input.doctorId,
          reason: input.reason,
          conditions: input.conditions,
          allergies: input.allergies,
          medications: input.medications
            .filter((m) => m.name.trim())
            .map((m, i) => ({
              id: `${id}-m${i}`,
              name: m.name.trim(),
              dose: m.dose,
              frequency: m.frequency,
              prescribedBy: m.prescribedBy || 'Self-reported',
              since: todayISO(),
              status: 'active' as const,
            })),
          immunizations: [],
          vitals: [],
          labs: [],
          visits: [],
          referrals: [],
          insurance: { provider: 'Not provided', memberId: 'n/a', status: 'pending' },
          createdAt: todayISO(),
          isNew: true,
        }
        const appointment: Appointment = {
          id: uid('a'),
          patientId: id,
          doctorId: input.doctorId,
          date: input.preferredDate,
          time: input.preferredTime,
          mode: input.mode,
          reason: input.reason,
          status: byStaff ? 'confirmed' : 'requested',
          reminders: { sms: true, email: true },
        }
        setState((s) => ({
          ...s,
          patients: [patient, ...s.patients],
          appointments: [appointment, ...s.appointments],
          session: byStaff ? s.session : { role: 'patient', userId: id },
          messages: [
            {
              id: uid('msg'),
              patientId: id,
              from: 'care-team',
              author: 'Joanna Reyes · Front desk',
              text: byStaff
                ? `Welcome to Himsog, ${input.name.split(' ')[0]}! Your record is ready and your visit is confirmed. You can see everything in the patient portal.`
                : `Welcome to Himsog, ${input.name.split(' ')[0]}! We received your consultation request and will confirm your schedule shortly.`,
              at: Date.now(),
            },
            ...s.messages,
          ],
          audit: [
            byStaff
              ? entry('Registered new patient', `${patient.name} (${id})`, s)
              : { id: uid('au'), at: Date.now(), actor: patient.name, role: 'patient', action: 'Created new patient record', target: `${patient.name} (${id})` },
            byStaff
              ? entry('Booked appointment', `${patient.name} (${id}) on ${input.preferredDate} ${input.preferredTime}`, s)
              : { id: uid('au'), at: Date.now(), actor: patient.name, role: 'patient', action: 'Requested consultation', target: input.reason },
            ...s.audit,
          ],
        }))
        return patient
      },

      bookAppointment: (a) => {
        const appt: Appointment = { ...a, id: uid('a'), status: a.status ?? 'requested', reminders: a.reminders ?? { sms: true, email: true } }
        setState((s) => ({
          ...s,
          appointments: [appt, ...s.appointments],
          audit: [entry(appt.status === 'requested' ? 'Requested appointment' : 'Booked appointment', `${patientLabel(s, a.patientId)} on ${a.date} ${a.time}`, s), ...s.audit],
        }))
        return appt
      },

      setAppointmentStatus: (id, status) =>
        setState((s) => {
          const appt = s.appointments.find((x) => x.id === id)
          const verb: Record<AppointmentStatus, string> = {
            requested: 'Requested appointment',
            confirmed: 'Confirmed appointment',
            'checked-in': 'Checked in patient',
            'in-consult': 'Started consultation',
            completed: 'Completed appointment',
            cancelled: 'Cancelled appointment',
            'no-show': 'Marked no-show',
          }
          return {
            ...s,
            appointments: s.appointments.map((x) =>
              x.id === id ? { ...x, status, checkedInAt: status === 'checked-in' ? Date.now() : x.checkedInAt } : x,
            ),
            audit: appt ? [entry(verb[status], patientLabel(s, appt.patientId), s), ...s.audit] : s.audit,
          }
        }),

      sendMessage: (patientId, from, author, text) =>
        setState((s) => ({
          ...s,
          messages: [...s.messages, { id: uid('msg'), patientId, from, author, text, at: Date.now() }],
        })),

      completeConsultation: (input) =>
        setState((s) => {
          const appt = s.appointments.find((a) => a.id === input.appointmentId)
          if (!appt) return s
          const doctor = DOCTORS.find((d) => d.id === appt.doctorId)!
          const today = todayISO()
          const visit: Visit = {
            id: uid('v'),
            date: today,
            doctorId: appt.doctorId,
            type: appt.reason,
            template: input.template,
            notes: input.notes,
            diagnoses: input.diagnoses,
            summary: input.summary,
            prescriptions: input.prescriptions.map((r) => `${r.name} ${r.dose} ${r.sig.toLowerCase()}`),
            orders: input.orders.map((o) => o.name),
          }
          const newLabs: LabOrder[] = input.orders.map((o) => ({
            id: uid('lab'),
            name: o.name,
            kind: o.kind,
            orderedBy: doctor.name,
            date: today,
            facility: o.kind === 'Imaging' ? 'St. Clare Radiology' : 'Northbridge Diagnostics',
            status: 'ordered',
            results: [],
          }))
          const referral: Referral | undefined = input.referral
            ? { id: uid('r'), ...input.referral, date: today, status: 'sent', direction: 'outgoing' }
            : undefined
          const patients = s.patients.map((p) => {
            if (p.id !== appt.patientId) return p
            const meds = [...p.medications]
            for (const rx of input.prescriptions) {
              const existing = meds.findIndex((m) => m.name === rx.name && m.status === 'active')
              const med = {
                id: uid('m'),
                name: rx.name,
                dose: rx.dose,
                frequency: rx.sig,
                prescribedBy: doctor.name,
                since: today,
                status: 'active' as const,
                refillsLeft: 3,
                pharmacy: p.medications[0]?.pharmacy ?? 'Preferred pharmacy',
              }
              if (existing >= 0) meds[existing] = med
              else meds.unshift(med)
            }
            return {
              ...p,
              isNew: false,
              medications: meds,
              visits: [visit, ...p.visits],
              labs: [...newLabs, ...p.labs],
              referrals: referral ? [referral, ...p.referrals] : p.referrals,
              vitals: input.vitals ? [...p.vitals, { date: today, ...input.vitals }] : p.vitals,
            }
          })
          const pname = patientLabel(s, appt.patientId)
          const logs: AuditEntry[] = [
            entry('Signed visit note', pname, s),
            ...input.prescriptions.map((r) => entry('Sent e-prescription', `${r.name} ${r.dose} for ${pname}`, s)),
            ...input.orders.map((o) => entry(`Ordered ${o.kind.toLowerCase()}`, `${o.name} for ${pname}`, s)),
            ...(referral ? [entry('Sent referral', `${referral.specialty} for ${pname}`, s)] : []),
          ]
          const invoice: Invoice = {
            id: `INV-${3400 + Math.floor(Math.random() * 500)}`,
            patientId: appt.patientId,
            date: today,
            description: 'Established patient visit, moderate',
            cpt: '99214',
            icd: input.diagnoses[0]?.split(' ')[0] ?? 'Z00.00',
            amount: 185,
            payer: s.patients.find((p) => p.id === appt.patientId)?.insurance.provider ?? 'Self-pay',
            status: 'draft',
          }
          return {
            ...s,
            patients,
            appointments: s.appointments.map((a) => (a.id === appt.id ? { ...a, status: 'completed' } : a)),
            invoices: [invoice, ...s.invoices],
            messages: [
              ...s.messages,
              {
                id: uid('msg'),
                patientId: appt.patientId,
                from: 'care-team',
                author: doctor.name,
                text: `Your visit summary is ready: ${input.summary}`,
                at: Date.now(),
              },
            ],
            audit: [...logs.reverse(), ...s.audit],
          }
        }),

      toggleTask: (id) => setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),

      addTask: (t) =>
        setState((s) => ({
          ...s,
          tasks: [{ ...t, id: uid('t'), done: false }, ...s.tasks],
          audit: [entry('Assigned task', `${t.title} to ${t.assignee}`, s), ...s.audit],
        })),

      setInsuranceStatus: (patientId, status) =>
        setState((s) => ({
          ...s,
          patients: s.patients.map((p) => (p.id === patientId ? { ...p, insurance: { ...p.insurance, status, checkedAt: Date.now() } } : p)),
          audit: [entry('Verified insurance eligibility', patientLabel(s, patientId), s), ...s.audit],
        })),

      setInvoiceStatus: (id, status) =>
        setState((s) => ({
          ...s,
          invoices: s.invoices.map((i) => (i.id === id ? { ...i, status } : i)),
          audit: [entry(status === 'submitted' ? 'Submitted claim' : `Marked claim ${status}`, id, s), ...s.audit],
        })),

      updatePatient: (id, patch) =>
        setState((s) => ({
          ...s,
          patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          audit: [entry('Updated medical history', patientLabel(s, id), s), ...s.audit],
        })),

      log: (action, target) => setState((s) => ({ ...s, audit: [entry(action, target, s), ...s.audit] })),

      resetDemo: () => setState(() => ({ ...fresh() })),
    }
  }, [state, actorName, entry])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export function usePatient(id?: string) {
  const { patients } = useStore()
  return patients.find((p) => p.id === id)
}

export function useDoctor(id?: string) {
  return DOCTORS.find((d) => d.id === id)
}

