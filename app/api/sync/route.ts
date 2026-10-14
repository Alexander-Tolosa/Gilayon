import { clientOp } from '../../../db/schema'
import { audit, nowMs } from '@/server/core'
import { route, z } from '@/server/http'
import { ConsultSchema } from '@/server/schemas'
import { saveConsultation } from '@/server/services/clinical'
import { eq } from 'drizzle-orm'

const Body = z.object({ ops: z.array(z.object({ op_id: z.string().min(1), kind: z.literal('consult'), input: ConsultSchema })).max(200) })

/** Applies a browser's offline queue. Each op id is recorded, so replaying the same batch changes nothing. */
export const POST = route({ roles: ['doctor'], body: Body }, async ({ tx, actor, body }) => {
  const applied: string[] = []
  for (const op of body.ops) {
    const [seen] = await tx.select().from(clientOp).where(eq(clientOp.op_id, op.op_id))
    if (!seen) {
      await saveConsultation(tx, actor, op.input, { viaSync: true })
      await tx.insert(clientOp).values({ op_id: op.op_id, kind: op.kind, staff_id: actor.staff_id, applied_at: nowMs() })
    }
    applied.push(op.op_id)
  }
  if (applied.length) await audit(tx, actor.staff_id, { action: 'sync', table: 'client_op', record: applied[0], summary: `Synced ${applied.length} offline ${applied.length === 1 ? 'entry' : 'entries'}` })
  return { applied }
})
