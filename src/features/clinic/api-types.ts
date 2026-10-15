import type { ClinicData } from './data/seed'
import type { AuditLog } from './types'

/** What GET /api/state returns: the clinic records the signed-in staff member may see. */
export type Snapshot = Omit<ClinicData, 'counters'> & {
  offsite: { pending: number; lastAt: number }
  /** A record that was merged into another: old patient id -> the patient it now lives under. */
  merged: Record<string, string>
  /** Activity up to this time has been seen by the signed-in doctor (0 for other roles). */
  auditSeenAt: number
  /** The merged-away records, so the surviving record can say what it absorbed and a doctor can undo it. */
  mergedRecords: MergedRecord[]
  /** Pairs staff said are NOT the same person ("idA|idB", ids sorted), so they stop being suggested. */
  notDuplicates: string[]
  /** Letterhead details printed on every document. */
  clinic: ClinicProfile
  /** True on the demo server (embedded database filled with synthetic data). Hides demo helpers on a real server. */
  demo: boolean
}

/** The clinic's own details for the letterhead. Set by a doctor in Settings. */
export type ClinicProfile = {
  /** Line above the clinic name, e.g. the government unit. */
  header: string
  name: string
  office: string
  address: string
  contact: string
  /** The clinic's own licence or accreditation number (DOH/PhilHealth), if any. */
  license_no: string
  /** Small logo as a data URL; empty for the default mark. */
  logo: string
}

/** What prints until the clinic enters its own details. */
export const DEFAULT_CLINIC: ClinicProfile = {
  header: 'Republic of the Philippines · Province of Iloilo',
  name: 'HMO-Clinic',
  office: 'Office of the Hospital Management Officer',
  address: 'Provincial Capitol, Iloilo City',
  contact: '',
  license_no: '',
  logo: '',
}

/** GET /api/audit: one page of the full audit log, newest first. */
export type AuditPage = { rows: AuditLog[]; more: boolean }

export type MergedRecord = { patient_id: string; into: string; full_name: string; patient_no: string; merged_at?: number; merged_by?: string }

export type ConsultInput = {
  consultation_id: string
  patient_id: string
  ticket_id?: string
  service_type: 'Medical' | 'Dental' | 'Laboratory'
  chief_complaint: string
  treatment_notes: string
  vitals?: { bp?: string; temperature?: string; pulse?: string; weight?: string }
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

export type BackupFile = { name: string; bytes: number; modified: number }

/** GET /api/backups */
export type BackupStatus = {
  configured: boolean
  problem: string | null
  encrypted: boolean
  offsiteConfigured: boolean
  last: { ok: boolean; at?: number; file?: string; bytes?: number; scans?: number; offsite?: { ok: boolean; error?: string } | null; failed_at?: number; error?: string } | null
  files: BackupFile[]
  keep: number
}

/** GET /api/security */
export type SecurityStatus = {
  cert: { present: boolean; names?: string[]; notAfter?: number; daysLeft?: number; caDaysLeft?: number; trustedByCa?: boolean; problem?: string }
  fingerprint: string | null
  httpsPort: number
}
