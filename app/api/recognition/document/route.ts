import { route, z } from '@/server/http'
import { readDocument } from '@/server/services/recognition'

const Body = z.object({
  file: z.string().min(1),
  kind: z.enum(['Certificate', 'Lab result', 'Dental', 'Prescription', 'Chart']),
  patient_id: z.string().min(1),
})

/** Reads one photographed page for the doctor to check. Nothing is saved; filing is the patient's scans endpoint. */
export const POST = route({ roles: ['doctor'], body: Body, read: true }, ({ tx, body }) => readDocument(tx, body.file, body.kind, body.patient_id))

export const maxDuration = 180
