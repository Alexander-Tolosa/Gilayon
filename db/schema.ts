/*
  Gilayon PostgreSQL schema. Column names match src/features/clinic/types.ts so a row maps straight
  to the frontend type. Ids are text (uuids for new rows; the demo staff keep readable ids).
  Timestamps are epoch milliseconds (bigint) because the frontend model and every screen already use them.
  Age is never stored; it is derived from birthdate.
*/
import { bigint, boolean, index, integer, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core'

const ms = (name: string) => bigint(name, { mode: 'number' })

export const person = pgTable('person', {
  person_id: text().primaryKey(),
  full_name: text().notNull(),
  birthdate: text().notNull(), // YYYY-MM-DD
  sex: text().$type<'Female' | 'Male'>().notNull(),
  contact: text().notNull().default(''),
})

export const employee = pgTable('employee', {
  employee_id: text().primaryKey(),
  person_id: text().notNull().unique().references(() => person.person_id),
  employee_no: text().notNull().unique(),
  office: text().notNull(),
  position: text().notNull(),
})

export const patient = pgTable('patient', {
  patient_id: text().primaryKey(),
  person_id: text().notNull().unique().references(() => person.person_id),
  patient_no: text().notNull().unique(),
  civil_status: text().$type<'Single' | 'Married' | 'Widowed' | 'Separated'>().notNull(),
  pwd_id: text(),
  philhealth_pin: text(),
  legacy_folder_no: text(),
  created_at: ms('created_at').notNull(),
  created_by: text().notNull(),
  hr_flag: text(),
  /**
   * What the front desk found when it looked in the paper cabinet (folders are filed by name, so
   * many have no number). Null means nobody has checked yet; a ticket cannot be issued until someone does.
   */
  paper_status: text().$type<'on_file' | 'none'>(),
  paper_checked_at: ms('paper_checked_at'),
  paper_checked_by: text(),
  /**
   * Set when this record was found to be the same person as another and merged into it. Nothing is
   * moved or deleted (signed documents and consultations are immutable): screens simply show the
   * records together under the surviving patient, and a doctor can undo the merge.
   */
  merged_into: text(),
  merged_at: ms('merged_at'),
  merged_by: text(),
})

export const patientRelationship = pgTable('patient_relationship', {
  relationship_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  related_patient_id: text().notNull().references(() => patient.patient_id),
  relationship_type: text().$type<'Spouse' | 'Child' | 'Parent' | 'Sibling'>().notNull(),
  listed_in_mdr: boolean().notNull().default(false),
})

export const familyHistory = pgTable('family_history', {
  history_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  relative: text().notNull(),
  condition: text().notNull(),
  notes: text(),
})

export const allergy = pgTable('allergy', {
  allergy_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  substance: text().notNull(),
  reaction: text().notNull(),
  severity: text().$type<'Mild' | 'Moderate' | 'Severe'>().notNull(),
})

export const priorityCategory = pgTable('priority_category', {
  category_id: text().primaryKey(),
  name: text().notNull(),
  rank: integer().notNull(),
})

export const staff = pgTable('staff', {
  staff_id: text().primaryKey(),
  name: text().notNull(),
  role: text().$type<'doctor' | 'desk' | 'nurse'>().notNull(),
  title: text().notNull(),
  license_no: text(),
  ptr_no: text(),
  services: text().array(),
  room: text(),
  signature_image: text(),
  password_hash: text().notNull(),
  pin_hash: text(),
  /** Deactivated accounts cannot sign in and keep their history. Staff are never deleted. */
  active: boolean().notNull().default(true),
  /** Set when an admin created the account or reset the password: the person must choose their own first. */
  must_change_password: boolean().notNull().default(false),
})

export const session = pgTable('session', {
  token_hash: text().primaryKey(),
  staff_id: text().notNull().references(() => staff.staff_id),
  created_at: ms('created_at').notNull(),
  expires_at: ms('expires_at').notNull(),
  // Last time the person was active at the screen (a heartbeat). Null means "since sign-in".
  last_seen_at: ms('last_seen_at'),
})

export const queueTicket = pgTable(
  'queue_ticket',
  {
    ticket_id: text().primaryKey(),
    patient_id: text().notNull().references(() => patient.patient_id),
    category_id: text().notNull().references(() => priorityCategory.category_id),
    categories: text().array().notNull(),
    verified_by: text().notNull(),
    is_returning: boolean().notNull().default(false),
    queue_no: integer().notNull(),
    service_type: text().$type<'Medical' | 'Dental' | 'Laboratory'>().notNull(),
    reason: text(),
    status: text().$type<'waiting' | 'called' | 'in_consult' | 'done' | 'left'>().notNull(),
    checked_in_at: ms('checked_in_at').notNull(),
    called_at: ms('called_at'),
    done_at: ms('done_at'),
    doctor_id: text(),
    day: text().notNull(), // YYYY-MM-DD
  },
  (t) => [unique('queue_ticket_day_no').on(t.day, t.queue_no), index('queue_ticket_day').on(t.day)],
)

export const consultation = pgTable('consultation', {
  consultation_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  ticket_id: text().unique().references(() => queueTicket.ticket_id),
  doctor_id: text().notNull(),
  service_type: text().$type<'Medical' | 'Dental' | 'Laboratory'>().notNull(),
  consult_date: text().notNull(),
  created_at: ms('created_at').notNull(),
  chief_complaint: text().notNull(),
  treatment_notes: text().notNull(),
  vitals: jsonb().$type<{ bp?: string; temperature?: string; pulse?: string; weight?: string }>(),
  correction_of: text(),
})

export const diagnosis = pgTable('diagnosis', {
  diagnosis_id: text().primaryKey(),
  consultation_id: text().notNull().references(() => consultation.consultation_id),
  description: text().notNull(),
  icd10_code: text().notNull(),
})

export const labOrder = pgTable('lab_order', {
  lab_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  consultation_id: text(),
  requested_by: text().notNull(),
  test_name: text().notNull(),
  status: text().$type<'requested' | 'resulted'>().notNull(),
  result: text(),
  result_date: text(),
  requested_at: ms('requested_at').notNull(),
})

export const prescription = pgTable('prescription', {
  prescription_id: text().primaryKey(),
  consultation_id: text().notNull().references(() => consultation.consultation_id),
  patient_id: text().notNull().references(() => patient.patient_id),
  signed_by: text(),
  doctor_id: text().notNull(),
  status: text().$type<'draft' | 'signed' | 'voided'>().notNull(),
  issued_at: ms('issued_at'),
  created_at: ms('created_at').notNull(),
  document_no: text().unique(),
  signature: text(),
  void_reason: text(),
  replaces: text(),
})

export const prescriptionItem = pgTable('prescription_item', {
  item_id: text().primaryKey(),
  prescription_id: text().notNull().references(() => prescription.prescription_id),
  drug_name: text().notNull(),
  dose: text().notNull(),
  frequency: text().notNull(),
  quantity: integer().notNull(),
})

export const document = pgTable('document', {
  document_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  consultation_id: text(),
  doctor_id: text().notNull(),
  signed_by: text(),
  doc_type: text().$type<'Medical certificate'>().notNull(),
  purpose: text().notNull(),
  findings: text().notNull(),
  rest_days: integer(),
  remarks: text(),
  status: text().$type<'draft' | 'signed' | 'voided'>().notNull(),
  issued_at: ms('issued_at'),
  created_at: ms('created_at').notNull(),
  document_no: text().unique(),
  signature: text(),
  void_reason: text(),
  replaces: text(),
})

export const scannedPage = pgTable('scanned_page', {
  page_id: text().primaryKey(),
  patient_id: text().notNull().references(() => patient.patient_id),
  file: text().notNull(), // data URL of an upload, or "sample:<n>" for seeded pages
  kind: text().$type<'Chart' | 'Prescription' | 'Lab result' | 'Certificate'>().notNull(),
  page_date: text().notNull(),
  uploaded_by: text().notNull(),
  uploaded_at: ms('uploaded_at').notNull(),
})

export const auditLog = pgTable(
  'audit_log',
  {
    log_id: text().primaryKey(),
    staff_id: text().notNull(),
    action: text().notNull(),
    table_name: text().notNull(),
    record_id: text().notNull(),
    summary: text().notNull(),
    detail: text(),
    logged_at: ms('logged_at').notNull(),
    read_at: ms('read_at'),
  },
  (t) => [index('audit_log_logged_at').on(t.logged_at)],
)

/** Atomic counters: patient numbers, queue numbers per day, document numbers per year. */
export const counter = pgTable('counter', {
  key: text().primaryKey(),
  value: integer().notNull().default(0),
})

export const meta = pgTable('meta', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
})

/** Offline operations already applied, so a retried sync never creates a duplicate. */
export const clientOp = pgTable('client_op', {
  op_id: text().primaryKey(),
  kind: text().notNull(),
  staff_id: text().notNull(),
  applied_at: ms('applied_at').notNull(),
})
