import { z } from 'zod'
import { todayKey } from '../features/clinic/lib/helpers'

/* Shared field rules, so every route checks dates and lengths the same way. */

const isRealDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** A calendar day as YYYY-MM-DD that really exists (no 2026-02-30). */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').refine(isRealDay, 'not a real date')

/** A birthdate: a real day, not in the future and not before 1900. */
export const Birthdate = IsoDate.refine((s) => s >= '1900-01-01' && s <= todayKey(), 'must be between 1900 and today')

/** Short free text (names, offices, reasons). */
export const Short = (max = 200) => z.string().max(max)

/** Clinical notes. Long, but bounded so one request cannot fill the database. */
export const Note = z.string().max(10_000)

export const RxItem = z.object({ drug_name: z.string().min(1).max(200), dose: Short(100), frequency: Short(200), quantity: z.number().int().positive().max(1000) })

export const ConsultSchema = z.object({
  consultation_id: z.string().min(1).max(64),
  patient_id: z.string().min(1),
  ticket_id: z.string().optional(),
  service_type: z.enum(['Medical', 'Dental', 'Laboratory']),
  chief_complaint: z.string().min(1).max(500),
  treatment_notes: Note,
  vitals: z.object({ bp: Short(20).optional(), temperature: Short(10).optional(), pulse: Short(10).optional(), weight: Short(10).optional() }).optional(),
  diagnoses: z.array(z.object({ description: Short(300), icd10_code: Short(16) })).max(20),
  rx: z.array(RxItem).max(30),
  certificate: z.object({ doc_type: z.enum(['Medical certificate', 'Dental report']).optional(), purpose: Short(300), findings: z.string().max(2000), rest_days: z.number().int().min(0).max(365).optional(), remarks: z.string().max(1000).optional() }).optional(),
  labs: z.array(Short(200)).max(30),
  correction_of: z.string().optional(),
  rx_id: z.string().min(1).max(64),
  doc_id: z.string().min(1).max(64),
  lab_ids: z.array(z.string().max(64)),
})

/** A change to a draft prescription or certificate (also sent from the offline outbox). */
export const DraftPatch = z.object({
  items: z.array(RxItem).max(30).optional(),
  purpose: Short(300).optional(),
  findings: z.string().max(2000).optional(),
  rest_days: z.number().int().min(0).max(365).nullable().optional(),
  remarks: z.string().max(1000).nullable().optional(),
})

/** A new person at the front desk or as a dependent. */
export const NewPerson = z.object({
  full_name: z.string().trim().min(1).max(120),
  birthdate: Birthdate,
  sex: z.enum(['Female', 'Male']),
  contact: Short(120),
  civil_status: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
  philhealth_pin: Short(20).optional(),
  pwd_id: Short(40).optional(),
})
