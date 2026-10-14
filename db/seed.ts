/*
  Loads the synthetic demo data (every name and record is invented) into an empty database.
  Run with: npm run db:seed        (add --reset to wipe first)
*/
import { sql } from 'drizzle-orm'
import { buildSeed, STAFF } from '../src/features/clinic/data/seed'
import { todayKey } from '../src/features/clinic/lib/helpers'
import { hashSecret } from '../src/server/auth'
import { getDb, type Db, type Q } from '../src/server/db'
import * as t from './schema'

const TABLES = ['client_op', 'session', 'audit_log', 'prescription_item', 'prescription', 'document', 'lab_order', 'diagnosis', 'consultation', 'queue_ticket', 'scanned_page', 'allergy', 'family_history', 'patient_relationship', 'patient', 'employee', 'person', 'priority_category', 'staff', 'counter', 'meta']

export const DEMO_PASSWORD = 'demo-password'
export const DEMO_PIN = '1234'

async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}

/** TRUNCATE, not DELETE: the append-only triggers (rightly) refuse row deletes, and a reset is not a row edit. */
export async function wipe(db: Q) {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((n) => `"${n}"`).join(', ')} CASCADE`))
}

export async function seed(db: Db) {
  const d = buildSeed()
  const password_hash = await hashSecret(DEMO_PASSWORD)
  const pin_hash = await hashSecret(DEMO_PIN)
  await db.transaction(async (tx) => {
    // Keep signed-in sessions across a reset so the person pressing "Reset demo data" stays signed in.
    const keep = await tx.select().from(t.session)
    await wipe(tx)
    // The immutability triggers are about live data; the seed inserts final states directly.
    await tx.insert(t.staff).values(
      STAFF.map((s) => ({
        staff_id: s.staff_id,
        name: s.name,
        role: s.role,
        title: s.title,
        license_no: s.license_no ?? null,
        ptr_no: s.ptr_no ?? null,
        services: s.services ?? null,
        room: s.room ?? null,
        password_hash,
        pin_hash: s.role === 'doctor' ? pin_hash : null,
      })),
    )
    if (keep.length) await tx.insert(t.session).values(keep)
    await tx.insert(t.priorityCategory).values(d.categories)
    await chunked(d.persons, 500, (p) => tx.insert(t.person).values(p))
    await chunked(d.employees, 500, (p) => tx.insert(t.employee).values(p))
    await chunked(d.patients, 500, (p) =>
      tx.insert(t.patient).values(p.map((x) => ({ ...x, pwd_id: x.pwd_id ?? null, philhealth_pin: x.philhealth_pin ?? null, legacy_folder_no: x.legacy_folder_no ?? null, hr_flag: x.hr_flag ?? null }))),
    )
    await chunked(d.relationships, 500, (p) => tx.insert(t.patientRelationship).values(p))
    await chunked(d.familyHistory, 500, (p) => tx.insert(t.familyHistory).values(p.map((x) => ({ ...x, notes: x.notes ?? null }))))
    await chunked(d.allergies, 500, (p) => tx.insert(t.allergy).values(p))
    await chunked(d.tickets, 500, (p) =>
      tx.insert(t.queueTicket).values(p.map((x) => ({ ...x, reason: x.reason ?? null, called_at: x.called_at ?? null, done_at: x.done_at ?? null, doctor_id: x.doctor_id ?? null }))),
    )
    await chunked(d.consultations, 300, (p) => tx.insert(t.consultation).values(p.map((x) => ({ ...x, ticket_id: x.ticket_id ?? null, vitals: x.vitals ?? null, correction_of: x.correction_of ?? null }))))
    await chunked(d.diagnoses, 500, (p) => tx.insert(t.diagnosis).values(p))
    await chunked(d.labs, 500, (p) => tx.insert(t.labOrder).values(p.map((x) => ({ ...x, consultation_id: x.consultation_id ?? null, result: x.result ?? null, result_date: x.result_date ?? null }))))
    const rxRow = (x: (typeof d.prescriptions)[number]) => ({
      prescription_id: x.prescription_id,
      consultation_id: x.consultation_id,
      patient_id: x.patient_id,
      signed_by: x.signed_by ?? null,
      doctor_id: x.doctor_id,
      status: x.status,
      issued_at: x.issued_at ?? null,
      created_at: x.created_at,
      document_no: x.document_no ?? null,
      signature: x.signature ?? null,
      void_reason: x.void_reason ?? null,
      replaces: x.replaces ?? null,
    })
    // Seed rows may be signed already, so insert them as signed in one statement (no later UPDATE).
    await chunked(d.prescriptions, 300, (p) => tx.insert(t.prescription).values(p.map(rxRow)))
    await chunked(
      d.prescriptions.flatMap((r) => r.items),
      500,
      (p) => tx.insert(t.prescriptionItem).values(p),
    )
    await chunked(d.documents, 300, (p) =>
      tx.insert(t.document).values(
        p.map((x) => ({
          ...x,
          consultation_id: x.consultation_id ?? null,
          signed_by: x.signed_by ?? null,
          rest_days: x.rest_days ?? null,
          remarks: x.remarks ?? null,
          issued_at: x.issued_at ?? null,
          document_no: x.document_no ?? null,
          signature: x.signature ?? null,
          void_reason: x.void_reason ?? null,
          replaces: x.replaces ?? null,
        })),
      ),
    )
    await chunked(d.scans, 500, (p) => tx.insert(t.scannedPage).values(p))
    await chunked(d.audit, 500, (p) => tx.insert(t.auditLog).values(p.map((x) => ({ ...x, detail: x.detail ?? null, read_at: null }))))
    const today = todayKey()
    const maxToday = Math.max(0, ...d.tickets.filter((x) => x.day === today).map((x) => x.queue_no))
    await tx.insert(t.counter).values([
      { key: 'rx', value: d.counters.rx },
      { key: 'mc', value: d.counters.mc },
      { key: 'patient', value: d.counters.patient },
      { key: `queue:${today}`, value: maxToday },
    ])
    await tx.insert(t.meta).values([
      { key: 'last_import', value: d.lastImport },
      { key: 'last_backup_at', value: Date.now() },
    ])
  })
}

// CLI entry: `tsx db/seed.ts`
if (process.argv[1]?.endsWith('seed.ts')) {
  const db = await getDb()
  await seed(db)
  console.log(`Seeded demo data. Staff password: ${DEMO_PASSWORD}, doctor PIN: ${DEMO_PIN}`)
  process.exit(0)
}
