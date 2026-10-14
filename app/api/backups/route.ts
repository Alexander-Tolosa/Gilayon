import { route } from '@/server/http'
import { backupStatus, createBackup } from '@/server/backup/backup'
import { HttpError } from '@/server/core'

export const dynamic = 'force-dynamic'

/** Last backup, the configuration check, and the files in the backup folder. */
export const GET = route({ roles: ['doctor'], read: true }, ({ db }) => backupStatus(db))

/** "Back up now". Runs outside the request transaction: a backup reads the whole database itself. */
export const POST = route({ roles: ['doctor'], read: true }, async ({ db }) => {
  try {
    return await createBackup(db)
  } catch (e) {
    throw new HttpError(500, e instanceof Error ? e.message : 'The backup failed.')
  }
})
