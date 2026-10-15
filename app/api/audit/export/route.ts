import { route } from '@/server/http'
import { exportAuditCsv } from '@/server/services/auditlog'

export const dynamic = 'force-dynamic'

/** The whole audit trail as a CSV file. Doctor only; the export is itself written to the audit trail. */
export const POST = route({ roles: ['doctor'] }, async ({ tx, actor }) => {
  const { csv } = await exportAuditCsv(tx, actor)
  const day = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gilayon-audit-trail-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})
