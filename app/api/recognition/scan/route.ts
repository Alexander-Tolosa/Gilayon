import { route, z } from '@/server/http'
import { scanForm } from '@/server/services/recognition'

// Reading a page takes a second or two, so it runs outside a database transaction (read: true).
export const POST = route({ read: true, body: z.object({ file: z.string().min(100) }) }, async ({ tx, actor, body }) => scanForm(tx, actor, body.file))
