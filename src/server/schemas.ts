import { z } from 'zod'

export const ConsultSchema = z.object({
  consultation_id: z.string().min(1),
  patient_id: z.string().min(1),
  ticket_id: z.string().optional(),
  service_type: z.enum(['Medical', 'Dental', 'Laboratory']),
  chief_complaint: z.string().min(1),
  treatment_notes: z.string(),
  vitals: z.object({ bp: z.string().optional(), temperature: z.string().optional(), pulse: z.string().optional(), weight: z.string().optional() }).optional(),
  diagnoses: z.array(z.object({ description: z.string(), icd10_code: z.string() })),
  rx: z.array(z.object({ drug_name: z.string().min(1), dose: z.string(), frequency: z.string(), quantity: z.number().int().positive() })),
  certificate: z.object({ purpose: z.string(), findings: z.string(), rest_days: z.number().int().optional(), remarks: z.string().optional() }).optional(),
  labs: z.array(z.string()),
  correction_of: z.string().optional(),
  rx_id: z.string().min(1),
  doc_id: z.string().min(1),
  lab_ids: z.array(z.string()),
})
