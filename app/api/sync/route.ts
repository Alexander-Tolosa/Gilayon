import { eq } from 'drizzle-orm'
import { clientOp } from '../../../db/schema'
import { audit, nowMs } from '@/server/core'
import { route, z } from '@/server/http'
import { ConsultSchema, DraftPatch, IsoDate } from '@/server/schemas'
import { editDraft, saveConsultation } from '@/server/services/clinical'
import { processQueued, queueFolderScan } from '@/server/services/recognition'
import { uploadScan } from '@/server/services/records'

const Op = z.discriminatedUnion('kind', [
  z.object({ op_id: z.string().min(1), kind: z.literal('consult'), input: ConsultSchema }),
  z.object({
    op_id: z.string().min(1),
    kind: z.literal('scan'),
    input: z.object({
      page_id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
      patient_id: z.string().min(1),
      file: z.string(),
      scan_kind: z.enum(['Chart', 'Prescription', 'Lab result', 'Certificate', 'Dental']),
      page_date: IsoDate,
      category: z.enum(['Old folder', 'Outside report']).optional(),
      source_clinic: z.string().max(120).optional(),
      report_date: z.string().optional(),
    }),
  }),
  z.object({
    op_id: z.string().min(1),
    kind: z.literal('folder_scan'),
    input: z.object({
      scan_id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
      file: z.string(),
      captured_at: z.number(),
      patient_hint: z.string().max(200).optional(),
    }),
  }),
  z.object({
    op_id: z.string().min(1),
    kind: z.literal('edit_draft'),
    input: z.object({
      doc_kind: z.enum(['rx', 'doc']),
      id: z.string().min(1),
      patch: DraftPatch,
    }),
  }),
])

const Body = z.object({ ops: z.array(Op).max(200) })

/**
 * Applies a browser's offline queue in order. Each op id is recorded, so replaying the same batch
 * changes nothing. Notes, drafts and photos may be entered offline; signing and queue numbers may not.
 */
export const POST = route({ roles: ['doctor', 'desk', 'nurse'], body: Body }, async ({ tx, actor, body }) => {
  const applied: string[] = []
  let queued = false
  const rejected: { op_id: string; reason: string }[] = []
  for (const op of body.ops) {
    const [seen] = await tx.select().from(clientOp).where(eq(clientOp.op_id, op.op_id))
    if (!seen) {
      // A savepoint per op: one bad entry must not throw away the rest of the queue.
      try {
        await tx.transaction(async (sp) => {
          if (op.kind === 'consult') {
            if (actor.role !== 'doctor') throw new Error('Only a doctor can save consultations.')
            await saveConsultation(sp, actor, op.input, { viaSync: true })
          } else if (op.kind === 'scan') {
            await uploadScan(sp, actor, op.input.patient_id, op.input.file, op.input.scan_kind, op.input.page_date, op.input.page_id, { category: op.input.category, source_clinic: op.input.source_clinic, report_date: op.input.report_date })
          } else if (op.kind === 'folder_scan') {
            await queueFolderScan(sp, actor, op.input)
            queued = true
          } else {
            if (actor.role !== 'doctor') throw new Error('Only a doctor can edit drafts.')
            await editDraft(sp, actor, op.input.doc_kind, op.input.id, op.input.patch)
          }
          await sp.insert(clientOp).values({ op_id: op.op_id, kind: op.kind, staff_id: actor.staff_id, applied_at: nowMs() })
        })
      } catch (e) {
        rejected.push({ op_id: op.op_id, reason: e instanceof Error ? e.message : 'Rejected' })
        continue
      }
    }
    applied.push(op.op_id)
  }
  if (applied.length) await audit(tx, actor.staff_id, { action: 'sync', table: 'client_op', record: applied[0], summary: `Synced ${applied.length} offline ${applied.length === 1 ? 'entry' : 'entries'}` })
  // Photos are read after this transaction commits, so OCR never holds the database.
  if (queued) setTimeout(() => void processQueued(), 300)
  return { applied, rejected }
})
