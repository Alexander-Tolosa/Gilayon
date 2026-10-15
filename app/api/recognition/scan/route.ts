import { route, z } from '@/server/http'
import { scanForm } from '@/server/services/recognition'

// Reading a page takes a second or two, so it runs outside a database transaction (read: true).
// reader "handwriting" also runs the local vision model (about half a minute); "replaces" is the draft it supersedes.
export const maxDuration = 300
export const POST = route({ read: true, body: z.object({ file: z.string().min(100), reader: z.enum(['rules', 'handwriting']).optional(), replaces: z.string().max(80).optional() }) }, async ({ tx, actor, body }) =>
  scanForm(tx, actor, body.file, { handwriting: body.reader === 'handwriting', replaces: body.replaces }),
)
