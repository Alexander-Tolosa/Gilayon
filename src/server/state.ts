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
import { isDemoServer } from './env'
import { getClinicProfile } from './services/clinic'
import { todayKey } from '../features/clinic/lib/helpers'

/** The newest audit entries sent with every snapshot. Older ones are paged in by GET /api/audit. */
export const AUDIT_LIMIT = 3000

/** dup -> final survivor for every merged patient (follows chains, tolerates a loop). */
export function mergeMap(patients: { patient_id: string; merged_into: string | null }[]) {
  const direct = new Map(patients.filter((p) => p.merged_into).map((p) => [p.patient_id, p.merged_into!]))
  const out: Record<string, string> = {}
  for (const id of direct.keys()) {
    let cur = id
    const seen = new Set<string>()
    while (direct.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      cur = direct.get(cur)!
    }
    if (cur !== id) out[id] = cur
  }
  return out
}

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

/**
 * Someone still on a temporary password sees only their own account (enough for the "choose your own
 * password" screen), not the clinic's records: a temporary password may have been read off a note.
 */
async function temporaryPasswordSnapshot(q: Q, actor: Actor): Promise<Snapshot> {
  const [self] = await q.select().from(t.staff).where(eq(t.staff.staff_id, actor.staff_id))
  return {
    persons: [], employees: [], patients: [], relationships: [], familyHistory: [], allergies: [], categories: [], tickets: [], consultations: [], diagnoses: [], labs: [], prescriptions: [], documents: [], scans: [], audit: [],
    staff: self ? [staffForSignedIn(self)] : [],
    offsite: { pending: 0, lastAt: 0 },
    merged: {},
    auditSeenAt: 0,
    mergedRecords: [],
    notDuplicates: [],
    lastImport: { at: 0, count: 0, source: '' },
    clinic: await getClinicProfile(q),
    demo: isDemoServer(),
  }
}

export async function loadSnapshot(q: Q, actor: Actor): Promise<Snapshot> {
  if (actor.must_change_password) return temporaryPasswordSnapshot(q, actor)
  const doctor = actor.role === 'doctor'
  const [persons, employees, patients, relationships, familyHistory, allergies, categories, tickets, consultations, diagnoses, labs, rx, rxItems, documents, scans, staff, audit, imp, backupAt, clinic] =
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
      getClinicProfile(q),
    ])
  const itemsByRx = new Map<string, Prescription['items']>()
  for (const i of rxItems) {
    const list = itemsByRx.get(i.prescription_id) ?? []
    list.push(i as Prescription['items'][number])
    itemsByRx.set(i.prescription_id, list)
  }
  // The backup's own log entry is written just after the copy, so it must not count as unsaved work.
  // Merged records are shown together under the surviving patient; the rows themselves are untouched.
  const merged = mergeMap(patients)
  const canon = (id: string) => merged[id] ?? id
  const gone = new Set(Object.keys(merged))
  const gonePersons = new Set(patients.filter((p) => gone.has(p.patient_id)).map((p) => p.person_id))
  const seen = new Set<string>()
  const relationshipsView = relationships
    .map((r) => ({ ...r, patient_id: canon(r.patient_id), related_patient_id: canon(r.related_patient_id) }))
    .filter((r) => {
      const key = `${r.patient_id}|${r.related_patient_id}|${r.relationship_type}`
      if (r.patient_id === r.related_patient_id || seen.has(key)) return false
      seen.add(key)
      return true
    })
  const dedupe = <T,>(rows: T[], key: (r: T) => string) => {
    const k = new Set<string>()
    return rows.filter((r) => (k.has(key(r)) ? false : (k.add(key(r)), true)))
  }
  const personName = new Map((persons as Person[]).map((p) => [p.person_id, p.full_name]))
  const mergedRecords = patients
    .filter((p) => gone.has(p.patient_id))
    .map((p) => ({ patient_id: p.patient_id, into: merged[p.patient_id], full_name: personName.get(p.person_id) ?? '', patient_no: p.patient_no, merged_at: p.merged_at ?? undefined, merged_by: p.merged_by ?? undefined }))
  const [nd] = await q.select().from(t.meta).where(eq(t.meta.key, 'not_duplicates'))
  // Each doctor has their own "seen up to" mark. The first time one is needed it starts at now, so a
  // new doctor is not greeted by the whole history as "unread".
  let auditSeenAt = 0
  if (doctor) {
    const key = `audit_seen:${actor.staff_id}`
    const [row] = await q.select().from(t.meta).where(eq(t.meta.key, key))
    auditSeenAt = (row?.value as number | undefined) ?? Date.now()
    if (!row) await q.insert(t.meta).values({ key, value: auditSeenAt }).onConflictDoNothing()
  }
  const offsitePending = doctor ? audit.filter((a) => a.logged_at > backupAt && a.action !== 'backup').length : 0
  return {
    persons: (persons as Person[]).filter((p) => !gonePersons.has(p.person_id)),
    employees: (employees as Employee[]).filter((e) => !gonePersons.has(e.person_id)),
    patients: patients.filter((r) => !gone.has(r.patient_id)).map((r) => strip<Patient>(r)),
    relationships: relationshipsView as PatientRelationship[],
    familyHistory: dedupe(
      familyHistory.map((r) => ({ ...strip<FamilyHistory>(r), patient_id: canon(r.patient_id) })),
      (r) => `${r.patient_id}|${r.relative.toLowerCase()}|${r.condition.toLowerCase()}`,
    ),
    allergies: dedupe(
      (allergies as Allergy[]).map((a) => ({ ...a, patient_id: canon(a.patient_id) })),
      (a) => `${a.patient_id}|${a.substance.toLowerCase()}`,
    ),
    categories: categories as PriorityCategory[],
    tickets: tickets.map((r) => ({ ...strip<QueueTicket>(r), patient_id: canon(r.patient_id) })),
    consultations: consultations.map((r) => ({ ...strip<Consultation>(r), patient_id: canon(r.patient_id) })),
    diagnoses: diagnoses as Diagnosis[],
    labs: labs.map((r) => ({ ...strip<LabOrder>(r), patient_id: canon(r.patient_id) })),
    prescriptions: rx.map((r) => ({ ...strip<Prescription>(r), patient_id: canon(r.patient_id), items: itemsByRx.get(r.prescription_id) ?? [] })),
    documents: documents.map((r) => ({ ...strip<DocumentRow>(r), patient_id: canon(r.patient_id) })),
    // Files on the server are served through /api/scans/<id>/file (signed-in staff only).
    scans: scans.map((r) => ({ ...r, patient_id: canon(r.patient_id), file: r.file.startsWith('disk:') ? `/api/scans/${r.page_id}/file` : r.file })) as ScannedPage[],
    staff: staff.map(staffForSignedIn),
    audit: audit.map((r) => strip<AuditLog>(r)),
    offsite: { pending: offsitePending, lastAt: backupAt },
    merged,
    auditSeenAt,
    mergedRecords,
    notDuplicates: (nd?.value as string[] | undefined) ?? [],
    lastImport: (imp[0]?.value as Snapshot['lastImport'] | undefined) ?? { at: 0, count: 0, source: '' },
    clinic,
    demo: isDemoServer(),
  }
}

/** Public waiting screen: today's queue numbers and lanes only. No names, reasons, patient ids or earlier days. */
export async function loadPublicQueue(q: Q) {
  const [tickets, categories, staff, clinic] = await Promise.all([q.select().from(t.queueTicket).where(eq(t.queueTicket.day, todayKey())), q.select().from(t.priorityCategory), q.select().from(t.staff).where(eq(t.staff.active, true)), getClinicProfile(q)])
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
    // The letterhead and the demo flag are not secret: the sign-in page and waiting screen use them.
    clinic,
    demo: isDemoServer(),
  }
}
