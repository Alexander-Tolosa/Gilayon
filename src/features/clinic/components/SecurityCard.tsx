import { LockKey, LockSimpleOpen, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Badge, Card } from '../../../shared/components/ui'
import type { SecurityStatus } from '../api-types'
import { useClinic } from '../store/store'

const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]'

/** Is this computer talking to the server over an encrypted connection, and is the certificate healthy? */
export function SecurityCard() {
  const { fetchSecurity } = useClinic()
  const [st, setSt] = useState<SecurityStatus | null>(null)
  const [here] = useState(() => ({ secure: window.location.protocol === 'https:', host: window.location.hostname }))

  useEffect(() => {
    void fetchSecurity().then(setSt)
  }, [fetchSecurity])

  const exposed = !here.secure && !isLocal(here.host)
  const cert = st?.cert

  return (
    <Card className="p-6 xl:col-span-2">
      <p className="flex items-center gap-2 text-lg font-semibold">
        {here.secure ? <LockKey size={22} weight="fill" /> : <LockSimpleOpen size={22} />} Secure connection
      </p>

      {here.secure ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
          <Badge tone="ok">Encrypted</Badge> This computer is connected to the clinic server over HTTPS ({here.host}).
        </p>
      ) : exposed ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            This connection to the clinic server is <b>not encrypted</b>: patient records and passwords cross the network in plain text.
            {st?.cert.present ? (
              <>
                {' '}
                Use <b>https://{here.host}:{st.httpsPort}</b> instead.
              </>
            ) : (
              <> HTTPS has not been set up on the server yet (see the README, section HTTPS).</>
            )}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-muted">This screen is open on the server itself, so nothing crosses the network.</p>
      )}

      {cert?.present && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-canvas px-4 py-3">
            <p className="text-sm text-muted">Server certificate</p>
            <p className="text-base font-semibold">{cert.daysLeft !== undefined && cert.daysLeft >= 0 ? `${cert.daysLeft} days left` : 'Expired'}</p>
            {cert.notAfter && <p className="text-sm text-muted">until {new Date(cert.notAfter).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
          </div>
          <div className="rounded-2xl bg-canvas px-4 py-3 sm:col-span-2">
            <p className="text-sm text-muted">Valid for these addresses</p>
            <p className="break-words text-base font-semibold">{cert.names?.join(', ')}</p>
          </div>
        </div>
      )}

      {cert?.problem && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0" />
          <span>{cert.problem}</span>
        </p>
      )}

      {st?.fingerprint && (
        <p className="mt-3 text-sm text-muted">
          Clinic CA fingerprint, to compare when you install the certificate on a new PC:
          <span className="mt-1 block break-all font-mono text-[13px] text-ink-2">{st.fingerprint}</span>
        </p>
      )}
    </Card>
  )
}
