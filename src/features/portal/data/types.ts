export type Role = 'patient' | 'secretary' | 'doctor'

export type Doctor = {
  id: string
  name: string
  specialty: string
  photo: string
  hours: [string, string]
  room: string
  years: number
  rating: number
  bio: string
}

export type Staff = {
  id: string
  name: string
  title: string
  photo: string
  email: string
}

export type Medication = {
  id: string
  name: string
  dose: string
  frequency: string
  prescribedBy: string
  since: string
  status: 'active' | 'stopped'
  refillsLeft?: number
  pharmacy?: string
}

export type VitalReading = {
  date: string
  systolic: number
  diastolic: number
  heartRate: number
  weight: number
  a1c?: number
  ldl?: number
  glucose?: number
}

export type LabResult = {
  name: string
  value: string
  unit: string
  range: string
  flag: 'normal' | 'high' | 'low'
}

export type LabOrder = {
  id: string
  name: string
  kind: 'Lab' | 'Imaging'
  orderedBy: string
  date: string
  facility: string
  status: 'ordered' | 'in-progress' | 'resulted'
  results: LabResult[]
  note?: string
}

export type Visit = {
  id: string
  date: string
  doctorId: string
  type: string
  template: 'SOAP' | 'DAP' | 'Follow-up'
  notes: Record<string, string>
  diagnoses: string[]
  summary: string
  prescriptions: string[]
  orders: string[]
}

export type Referral = {
  id: string
  to: string
  specialty: string
  reason: string
  date: string
  status: 'sent' | 'accepted' | 'scheduled' | 'completed'
  direction: 'outgoing' | 'incoming'
}

export type Insurance = {
  provider: string
  memberId: string
  status: 'verified' | 'pending' | 'expired'
  checkedAt?: number
}

export type Patient = {
  id: string
  name: string
  age: number
  sex: 'Female' | 'Male' | 'Other'
  dob: string
  phone: string
  email: string
  photo?: string
  bloodType: string
  address: string
  doctorId: string
  reason: string
  conditions: string[]
  allergies: string[]
  medications: Medication[]
  immunizations: { name: string; date: string }[]
  vitals: VitalReading[]
  labs: LabOrder[]
  visits: Visit[]
  referrals: Referral[]
  insurance: Insurance
  lastEyeExam?: string
  lastMammogram?: string
  lastColonoscopy?: string
  createdAt: string
  isNew?: boolean
}

export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'checked-in'
  | 'in-consult'
  | 'completed'
  | 'cancelled'
  | 'no-show'

export type Appointment = {
  id: string
  patientId: string
  doctorId: string
  date: string
  time: string
  mode: 'In-person' | 'Telehealth'
  reason: string
  status: AppointmentStatus
  checkedInAt?: number
  reminders?: { sms: boolean; email: boolean }
}

export type Message = {
  id: string
  patientId: string
  from: 'patient' | 'care-team'
  author: string
  text: string
  at: number
}

export type Task = {
  id: string
  title: string
  assignee: string
  patientId?: string
  due: string
  priority: 'high' | 'normal' | 'low'
  done: boolean
}

export type Invoice = {
  id: string
  patientId: string
  date: string
  description: string
  cpt: string
  icd: string
  amount: number
  payer: string
  status: 'draft' | 'submitted' | 'paid' | 'denied'
}

export type AuditEntry = {
  id: string
  at: number
  actor: string
  role: Role | 'system'
  action: string
  target: string
}

export type Session = { role: Role; userId: string } | null

export type IntakeInput = {
  name: string
  age: number
  sex: Patient['sex']
  phone: string
  email: string
  reason: string
  doctorId: string
  preferredDate: string
  preferredTime: string
  mode: Appointment['mode']
  conditions: string[]
  allergies: string[]
  medications: { name: string; dose: string; frequency: string; prescribedBy: string }[]
}
