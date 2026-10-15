import { CloudCheck, DatabaseIcon, HardDrives, Warning } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, useToast } from '../../../shared/components/ui'
import type { BackupStatus } from '../api-types'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'

const HOUR = 3_600_000
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const when = (t: number) => new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Doctor's view of the nightly backup: when it last worked, what failed, and a "back up now" button. */
export function BackupCard() {
  const { fetchBackups, runBackup, data } = useClinic()
  const toast = useToast()
  const t = useT()
  const [st, setSt] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => setSt(await fetchBackups()), [fetchBackups])
  useEffect(() => {
    let live = true
    void fetchBackups().then((v) => live && setSt(v))
    return () => {
      live = false
    }
  }, [fetchBackups, data.offsite.lastAt])

  const go = async () => {
    setBusy(true)
    const problem = await runBackup()
    setBusy(false)
    await load()
    toast(problem ? { tone: 'warn', title: t('Backup failed'), body: problem } : { tone: 'ok', title: t('Backup saved and verified') })
  }

  const lastAt = st?.last?.at
  const stale = st?.configured && (!lastAt || now - lastAt > 36 * HOUR)
  const failed = st?.last && st.last.ok === false

  return (
    <Card className="p-6 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold">
            <HardDrives size={22} /> {t('Backups')}
          </p>
          <p className="text-[15px] text-muted">A verified, encrypted copy of every record and scan, made every night to the backup drive{st?.offsiteConfigured ? ' and the off-site folder' : ''}.</p>
        </div>
        <Button size="lg" icon={<DatabaseIcon size={18} />} onClick={go} disabled={busy || st?.configured === false}>
          {busy ? t('Backing up…') : t('Back up now')}
        </Button>
      </div>

      {st === null && <p className="mt-4 text-muted">{t('Loading…')}</p>}

      {st && !st.configured && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            Backups are not set up. {st.problem} Until they are, a failed disk would lose every record.
          </span>
        </p>
      )}

      {st?.configured && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {st.encrypted ? <Badge tone="ok">{t('Encrypted')}</Badge> : <Badge tone="warn">{t('Not encrypted')}</Badge>}
            {st.offsiteConfigured ? <Badge tone="neutral">{t('Off-site copy on')}</Badge> : <Badge tone="warn">{t('No off-site copy')}</Badge>}
            <Badge tone="neutral">Keeps the last {st.keep}</Badge>
          </div>

          {failed && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
              <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                The last backup attempt failed{st.last?.failed_at ? ` (${when(st.last.failed_at)})` : ''}: {st.last?.error}
              </span>
            </p>
          )}
          {!failed && stale && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">
              <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
              <span>{lastAt ? `No backup for over a day (last: ${when(lastAt)}).` : t('No backup has been made yet.')} Press Back up now, and check that the backup drive is plugged in.</span>
            </p>
          )}
          {st.last?.ok && !stale && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-ok-soft px-4 py-3 text-[15px] text-ok">
              <CloudCheck size={20} weight="fill" /> Last backup {lastAt ? when(lastAt) : ''} · {st.last.bytes ? size(st.last.bytes) : ''}
              {st.last.offsite ? (st.last.offsite.ok ? ' · copied off-site' : ` · off-site copy failed: ${st.last.offsite.error}`) : ''}
            </p>
          )}

          {st.files.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {st.files.slice(0, 6).map((f) => (
                <li key={f.name} className="flex items-center justify-between rounded-xl bg-canvas px-4 py-2 text-sm">
                  <span className="font-mono">{f.name}</span>
                  <span className="text-muted">
                    {when(f.modified)} · {size(f.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
