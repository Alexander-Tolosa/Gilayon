import { desc, eq } from 'drizzle-orm'
import * as t from '../../db/schema'
import type { Snapshot } from '../features/clinic/api-types'
import type {
  Allergy,
  AuditLog,
  Consultation,
  Diagnosis,
  DocumentRow,
  Employee,
  FamilyHistory,
  LabOrder,
  Patient,
  PatientRelationship,
  Person,
  Prescription,
  PriorityCategory,
  QueueTicket,
  ScannedPage,
  Staff,
} from '../features/clinic/types'
import type { Q } from './db'
import { strip, type Actor } from './core'

const AUDIT_LIMIT = 3000

/** Staff fields safe to show anyone, including the public waiting screen and the sign-in page. */
export function publicStaff(s: typeof t.staff.$inferSelect): Staff {
  const { password_hash: _p, pin_hash: _h, signature_image: _s, license_no: _l, ptr_no: _r, ...rest } = s
  return strip<Staff>(rest)
}

/** For signed-in staff: licence, PTR and signature image are printed on documents. Hashes never leave the server. */
function staffForSignedIn(s: typeof t.staff.$inferSelect): Staff {
  const { password_hash: _p, pin_hash, ...rest } = s
  return { ...strip<Staff>(rest), pin: pin_hash ? '' : undefined }
}

export async function lastBackupAt(q: Q) {
  const [row] = await q.select().from(t.meta).where(eq(t.meta.key, 'last_backup_at'))
  return (row?.value as number | undefined) ?? 0
}

export async function loadSnapshot(q: Q, actor: Actor): Promise<Snapshot> {
  const doctor = actor.role === 'doctor'
  const [persons, employees, patients, relationships, familyHistory, allergies, categories, tickets, consultations, diagnoses, labs, rx, rxItems, documents, scans, staff, audit, imp, backupAt] =
    await Promise.all([
      q.select().from(t.person),
      q.select().from(t.employee),
      q.select().from(t.patient),
      q.select().from(t.patientRelationship),
      q.select().from(t.familyHistory),
      q.select().from(t.allergy),
      q.select().from(t.priorityCategory),
      q.select().from(t.queueTicket),
      q.select().from(t.consultation),
      q.select().from(t.diagnosis),
      q.select().from(t.labOrder),
      q.select().from(t.prescription),
      q.select().from(t.prescriptionItem),
      q.select().from(t.document),
      q.select().from(t.scannedPage),
      q.select().from(t.staff),
      doctor ? q.select().from(t.auditLog).orderBy(desc(t.auditLog.logged_at)).limit(AUDIT_LIMIT) : Promise.resolve([]),
      q.select().from(t.meta).where(eq(t.meta.key, 'last_import')),
      lastBackupAt(q),
    ])
  const itemsByRx = new Map<string, Prescription['items']>()
  for (const i of rxItems) {
    const list = itemsByRx.get(i.prescription_id) ?? []
    list.push(i as Prescription['items'][number])
    itemsByRx.set(i.prescription_id, list)
  }
  const offsitePending = doctor ? audit.filter((a) => a.logged_at > backupAt).length : 0
  return {
    persons: persons as Person[],
    employees: employees as Employee[],
    patients: patients.map((r) => strip<Patient>(r)),
    relationships: relationships as PatientRelationship[],
    familyHistory: familyHistory.map((r) => strip<FamilyHistory>(r)),
    allergies: allergies as Allergy[],
    categories: categories as PriorityCategory[],
    tickets: tickets.map((r) => strip<QueueTicket>(r)),
    consultations: consultations.map((r) => strip<Consultation>(r)),
    diagnoses: diagnoses as Diagnosis[],
    labs: labs.map((r) => strip<LabOrder>(r)),
    prescriptions: rx.map((r) => ({ ...strip<Prescription>(r), items: itemsByRx.get(r.prescription_id) ?? [] })),
    documents: documents.map((r) => strip<DocumentRow>(r)),
    // Files on the server are served through /api/scans/<id>/file (signed-in staff only).
    scans: scans.map((r) => ({ ...r, file: r.file.startsWith('disk:') ? `/api/scans/${r.page_id}/file` : r.file })) as ScannedPage[],
    staff: staff.map(staffForSignedIn),
    audit: audit.map((r) => strip<AuditLog>(r)),
    offsite: { pending: offsitePending, lastAt: backupAt },
    lastImport: (imp[0]?.value as Snapshot['lastImport'] | undefined) ?? { at: 0, count: 0, source: '' },
  }
}

/** Public waiting screen: queue numbers and lanes only. No names, reasons or patient ids. */
export async function loadPublicQueue(q: Q) {
  const [tickets, categories, staff] = await Promise.all([q.select().from(t.queueTicket), q.select().from(t.priorityCategory), q.select().from(t.staff).where(eq(t.staff.active, true))])
  return {
    tickets: tickets.map((r) => ({
      ...strip<QueueTicket>(r),
      patient_id: '',
      verified_by: '',
      reason: undefined,
      categories: [r.category_id],
      is_returning: false,
    })),
    categories: categories as PriorityCategory[],
    staff: staff.map(publicStaff),
  }
}
