/*
  Gilayon clinic data model, following the concept document (section 7).
  Ids are uuids. Age is never stored; it is calculated from the birthdate when shown.
*/

export type Sex = 'Female' | 'Male'
export type CivilStatus = 'Single' | 'Married' | 'Widowed' | 'Separated'

export type Person = {
  person_id: string
  full_name: string
  birthdate: string // YYYY-MM-DD
  sex: Sex
  contact: string
}

/** A row from the HR employee list. */
export type Employee = {
  employee_id: string
  person_id: string
  employee_no: string
  office: string
  position: string
}

export type Patient = {
  patient_id: string
  person_id: string
  patient_no: string
  civil_status: CivilStatus
  pwd_id?: string
  philhealth_pin?: string
  legacy_folder_no?: string
  created_at: number
  created_by: string
  hr_flag?: string // set when the front desk flags a mismatch for HR
  merged_into?: string // never present in what screens receive: merged records are folded into their survivor
}

export type RelationshipType = 'Spouse' | 'Child' | 'Parent' | 'Sibling'

export type PatientRelationship = {
  relationship_id: string
  patient_id: string // the employee (principal)
  related_patient_id: string // the dependent
  relationship_type: RelationshipType
  listed_in_mdr: boolean
}

export type FamilyHistory = {
  history_id: string
  patient_id: string
  relative: string
  condition: string
  notes?: string
}

export type CategoryKey = 'urgent' | 'pregnant' | 'pwd' | 'senior' | 'regular'

export type PriorityCategory = {
  category_id: CategoryKey
  name: string
  rank: number
}

export type ServiceType = 'Medical' | 'Dental' | 'Laboratory'

export type TicketStatus = 'waiting' | 'called' | 'in_consult' | 'done' | 'left'

export type QueueTicket = {
  ticket_id: string
  patient_id: string
  category_id: CategoryKey // highest-ranked category that applies
  categories: CategoryKey[] // every category that applied at check-in
  verified_by: string
  is_returning: boolean
  queue_no: number
  service_type: ServiceType
  reason?: string
  status: TicketStatus
  checked_in_at: number
  called_at?: number
  done_at?: number
  doctor_id?: string
  day: string // YYYY-MM-DD
}

export type Vitals = { bp?: string; temperature?: string; pulse?: string; weight?: string }

export type Consultation = {
  consultation_id: string
  patient_id: string
  ticket_id?: string
  doctor_id: string
  service_type: ServiceType
  consult_date: string
  created_at: number
  chief_complaint: string
  treatment_notes: string
  vitals?: Vitals
  correction_of?: string // corrections are new entries that point at the original
  sync?: 'local' // saved on this computer while offline, waiting to sync
}

export type Diagnosis = {
  diagnosis_id: string
  consultation_id: string
  description: string
  icd10_code: string
}

export type LabOrder = {
  lab_id: string
  patient_id: string
  consultation_id?: string
  requested_by: string
  test_name: string
  status: 'requested' | 'resulted'
  result?: string
  result_date?: string
  requested_at: number
}

export type DocStatus = 'draft' | 'signed' | 'voided'

export type PrescriptionItem = {
  item_id: string
  prescription_id: string
  drug_name: string
  dose: string
  frequency: string
  quantity: number
}

export type Prescription = {
  prescription_id: string
  consultation_id: string
  patient_id: string // kept for quick lookup; the model reaches the patient through the consultation
  signed_by?: string
  doctor_id: string
  status: DocStatus
  issued_at?: number
  created_at: number
  document_no?: string
  signature?: string
  void_reason?: string
  replaces?: string
  items: PrescriptionItem[]
}

export type DocumentRow = {
  document_id: string
  patient_id: string
  consultation_id?: string
  doctor_id: string
  signed_by?: string
  doc_type: 'Medical certificate'
  purpose: string
  findings: string
  rest_days?: number
  remarks?: string
  status: DocStatus
  issued_at?: number
  created_at: number
  document_no?: string
  signature?: string
  void_reason?: string
  replaces?: string
}

export type ScanKind = 'Chart' | 'Prescription' | 'Lab result' | 'Certificate'

export type ScannedPage = {
  page_id: string
  patient_id: string
  file: string // data URL of an uploaded scan, or "sample:<n>" for seeded sample pages
  kind: ScanKind
  page_date: string
  uploaded_by: string
  uploaded_at: number
}

export type Allergy = { allergy_id: string; patient_id: string; substance: string; reaction: string; severity: 'Mild' | 'Moderate' | 'Severe' }

export type StaffRole = 'doctor' | 'desk' | 'nurse'

export type Staff = {
  staff_id: string
  name: string
  role: StaffRole
  title: string
  license_no?: string
  ptr_no?: string
  services?: ServiceType[]
  room?: string
  signature_image?: string // data URL drawn by the doctor; falls back to a script-font rendering of the name
  pin?: string // never the PIN itself: "" when one is set, absent when not
  active?: boolean // false = cannot sign in
  must_change_password?: boolean
}

export type AuditAction = 'create' | 'edit' | 'sign' | 'void' | 'verify' | 'check-in' | 'call' | 'import' | 'upload' | 'sync' | 'flag' | 'status' | 'link' | 'backup'

export type AuditLog = {
  log_id: string
  staff_id: string
  action: AuditAction
  table_name: string
  record_id: string
  summary: string
  logged_at: number
  detail?: string
}

export type NetworkMode = 'online' | 'lan' | 'offline'
