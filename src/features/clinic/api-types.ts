import type { ClinicData } from './data/seed'

/** What GET /api/state returns: the clinic records the signed-in staff member may see. */
export type Snapshot = Omit<ClinicData, 'counters'> & {
  offsite: { pending: number; lastAt: number }
}

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
