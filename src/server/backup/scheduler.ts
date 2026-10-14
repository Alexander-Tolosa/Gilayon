import { getDb } from '../db'
import { backupConfig, configProblem, createBackup } from './backup'
import { eq } from 'drizzle-orm'
import { meta } from '../../../db/schema'

/** "02:00" -> minutes after midnight. */
export function parseAt(at: string | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at ?? '')
  const mins = m ? Number(m[1]) * 60 + Number(m[2]) : 120
  return mins >= 0 && mins < 1440 ? mins : 120
}

const HOUR = 3_600_000

/**
 * Is a backup due? Yes once today's slot has passed without a good backup since it, or if the last
 * good backup is over 26 hours old (the PC was off at 02:00). Failed attempts wait 30 minutes.
 */
export function isDue(now: Date, lastOkAt: number | null, lastAttemptAt: number | null, atMinutes: number): boolean {
  if (lastAttemptAt !== null && now.getTime() - lastAttemptAt < 0.5 * HOUR) return false
  const slot = new Date(now)
  slot.setHours(0, 0, 0, 0)
  slot.setMinutes(atMinutes)
  if (lastOkAt === null) return true
  if (now.getTime() - lastOkAt > 26 * HOUR) return true
  return now >= slot && lastOkAt < slot.getTime()
}

const g = globalThis as unknown as { __himsogBackup?: NodeJS.Timeout }

/** Runs inside the server process, so it works with the embedded database and a real PostgreSQL alike. */
export function startBackupScheduler() {
  if (g.__himsogBackup || process.env.BACKUP_ENABLED === '0') return
  const cfg = backupConfig()
  const problem = configProblem(cfg)
  if (problem) {
    console.warn(`[backup] Scheduled backups are off. ${problem}`)
    return
  }
  const at = parseAt(process.env.BACKUP_AT)
  let lastAttempt: number | null = null
  let running = false
  const tick = async () => {
    if (running) return
    try {
      const db = await getDb()
      const [row] = await db.select().from(meta).where(eq(meta.key, 'last_backup'))
      const last = row?.value as { ok?: boolean; at?: number } | undefined
      const lastOk = last?.ok && typeof last.at === 'number' ? last.at : ((row?.value as { at?: number } | undefined)?.at ?? null)
      if (!isDue(new Date(), lastOk, lastAttempt, at)) return
      running = true
      lastAttempt = Date.now()
      const r = await createBackup(db, cfg)
      console.log(`[backup] ${r.file} (${r.bytes} bytes)${r.offsite ? (r.offsite.ok ? ', copied off-site' : `, off-site copy failed: ${r.offsite.error}`) : ''}`)
    } catch (e) {
      console.error('[backup] failed:', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }
  g.__himsogBackup = setInterval(() => void tick(), 60_000)
  g.__himsogBackup.unref?.()
  setTimeout(() => void tick(), 30_000).unref?.()
  console.log(`[backup] Nightly backup scheduled for ${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')} into ${cfg.dir}${cfg.offsiteDir ? ` and ${cfg.offsiteDir}` : ''}`)
}
