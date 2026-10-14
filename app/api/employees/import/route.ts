import { route, z } from '@/server/http'
import { applyHrImport, previewHrImport } from '@/server/services/hrimport'

// Values arrive as text, exactly as in the spreadsheet. The server validates every row itself.
const Row = z.object({
  line: z.number().int().optional(),
  employee_no: z.unknown(),
  full_name: z.unknown(),
  birthdate: z.unknown(),
  sex: z.unknown(),
  office: z.unknown().optional(),
  position: z.unknown().optional(),
  contact: z.unknown().optional(),
})

const Body = z.object({ rows: z.array(Row).max(5000), source: z.string().max(200).default('HR list'), dry_run: z.boolean().default(false) })

/** `dry_run: true` shows what would happen without writing anything. */
export const POST = route({ roles: ['doctor'], body: Body }, ({ tx, actor, body }) => (body.dry_run ? previewHrImport(tx, body.rows) : applyHrImport(tx, actor, body.rows, body.source)))
