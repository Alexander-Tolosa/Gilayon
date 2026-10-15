import { FileText, Pill, Printer, SealCheck, Stamp } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input, Tabs, useToast } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { fmtStampOf } from '../lib/helpers'
import { useT } from '../lib/i18n'
import { stampRows } from '../lib/release'
import { useClinic } from '../store/store'

/*
  The last step of a visit: the doctor signed, the document comes back to the front desk, the desk
  prints it, stamps it and hands it to the patient, then marks it here so the doctor and the audit
  trail can see it left the clinic. Signed documents themselves are never changed.
*/
export default function ToStamp() {
  const t = useT()
  const toast = useToast()
  const { data, personOfPatient, staffById, releaseDocument, online } = useClinic()
  const [tab, setTab] = useState<'todo' | 'done'>('todo')
  const [q, setQ] = useState('')
  const rows = useMemo(() => stampRows(data), [data.prescriptions, data.documents, data.releases]) // eslint-disable-line react-hooks/exhaustive-deps
  const todo = rows.filter((r) => !r.releasedAt)
  const done = rows.filter((r) => r.releasedAt).sort((a, b) => b.releasedAt! - a.releasedAt!)
  const shown = (tab === 'todo' ? todo : done).filter((r) => !q || `${personOfPatient(r.patientId)?.full_name} ${r.no ?? ''} ${r.detail}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageTitle title={t('To stamp')} sub={t('Signed documents from the doctor. Print, stamp, hand to the patient, then mark them here.')} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'todo', label: t('To stamp'), count: todo.length },
            { value: 'done', label: t('Stamped'), count: done.length },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Patient or document no.')} className="h-12 text-base sm:w-80" />
      </div>
      <ul className="flex flex-col gap-3">
        {shown.slice(0, 80).map((r) => {
          const p = personOfPatient(r.patientId)
          return (
            <li key={`${r.kind}:${r.id}`}>
              <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">{r.kind === 'rx' ? <Pill size={24} /> : <FileText size={24} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {t(r.title)}
                    {r.no && <span className="font-mono text-base text-danger">{r.no}</span>}
                  </p>
                  <p className="break-words text-base text-ink-2">
                    <Link to={`/clinic/patients/${r.patientId}`} className="font-semibold text-ink hover:underline">
                      {p?.full_name}
                    </Link>{' '}
                    · {r.detail}
                  </p>
                  <p className="text-sm text-muted">
                    {staffById(r.doctorId)?.name} · {t('Signed')} {fmtStampOf(r.issuedAt)}
                    {r.releasedAt && ` · ${t('Stamped')} ${fmtStampOf(r.releasedAt)} ${staffById(r.releasedBy ?? '')?.name ? `${t('by')} ${staffById(r.releasedBy ?? '')?.name}` : ''}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="md" variant="secondary" icon={<Printer size={18} />} onClick={() => window.open(`/print/${r.kind === 'rx' ? 'rx' : 'mc'}/${r.id}`, '_blank')}>
                    {t('Print')}
                  </Button>
                  {!r.releasedAt ? (
                    <Button
                      size="md"
                      icon={<Stamp size={18} />}
                      disabled={!online}
                      onClick={() => {
                        releaseDocument(r.kind, r.id)
                        toast({ tone: 'ok', title: t('Marked as stamped'), body: `${t(r.title)} ${r.no ?? ''} ${t('was given to')} ${p?.full_name ?? ''}.` })
                      }}
                    >
                      {t('Stamped, given to patient')}
                    </Button>
                  ) : (
                    <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ok-soft px-4 text-base font-semibold text-ok">
                      <SealCheck size={20} weight="fill" /> {t('Stamped')}
                    </span>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
        {shown.length === 0 && (
          <li className="rounded-3xl border border-line bg-surface p-8 text-center text-lg text-ink-2">{tab === 'todo' ? t('Nothing to stamp right now.') : t('No stamped documents yet.')}</li>
        )}
      </ul>
    </div>
  )
}
