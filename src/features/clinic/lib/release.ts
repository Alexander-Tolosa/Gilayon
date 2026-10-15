import type { ClinicData } from '../data/seed'
import { todayKey } from './helpers'

/** A signed document the front desk deals with: print it, stamp it, hand it to the patient. */
export type StampRow = {
  kind: 'rx' | 'doc'
  id: string
  patientId: string
  doctorId: string
  no?: string
  /** 'Prescription', 'Medical certificate' or 'Dental report'. */
  title: string
  detail: string
  issuedAt: number
  releasedAt?: number
  releasedBy?: string
}

/**
 * Signed documents, each with the time it was stamped and handed over, if it was. Newest first.
 * The hand-off belongs to the visit: only documents signed today wait for a stamp, and anything that
 * was stamped stays listed. Older signed documents are not chased.
 */
export function stampRows(data: Pick<ClinicData, 'prescriptions' | 'documents' | 'releases'>): StampRow[] {
  const released = new Map(data.releases.map((r) => [`${r.kind}:${r.document_id}`, r]))
  const rx = data.prescriptions
    .filter((r) => r.status === 'signed')
    .map<StampRow>((r) => ({
      kind: 'rx',
      id: r.prescription_id,
      patientId: r.patient_id,
      doctorId: r.doctor_id,
      no: r.document_no,
      title: 'Prescription',
      detail: r.items.map((i) => i.drug_name).join(', '),
      issuedAt: r.issued_at ?? r.created_at,
      releasedAt: released.get(`rx:${r.prescription_id}`)?.released_at,
      releasedBy: released.get(`rx:${r.prescription_id}`)?.released_by,
    }))
  const docs = data.documents
    .filter((d) => d.status === 'signed')
    .map<StampRow>((d) => ({
      kind: 'doc',
      id: d.document_id,
      patientId: d.patient_id,
      doctorId: d.doctor_id,
      no: d.document_no,
      title: d.doc_type,
      detail: d.purpose,
      issuedAt: d.issued_at ?? d.created_at,
      releasedAt: released.get(`doc:${d.document_id}`)?.released_at,
      releasedBy: released.get(`doc:${d.document_id}`)?.released_by,
    }))
  const today = todayKey()
  return [...rx, ...docs].filter((r) => r.releasedAt || todayKey(new Date(r.issuedAt)) === today).sort((a, b) => b.issuedAt - a.issuedAt)
}

/** How many signed documents are still waiting for the stamp. */
export const toStampCount = (data: Pick<ClinicData, 'prescriptions' | 'documents' | 'releases'>) => stampRows(data).filter((r) => !r.releasedAt).length
