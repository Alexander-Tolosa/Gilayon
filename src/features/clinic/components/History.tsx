import { CloudArrowUp, FileText, Flask, PencilSimple, Pill, Printer, Prohibit } from '@phosphor-icons/react'
import { Badge, Button } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { useT } from '../lib/i18n'
import { fmtDay, fmtStampOf } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { Consultation, DocStatus } from '../types'

export function DocStatusBadge({ status }: { status: DocStatus }) {
  const t = useT()
  return status === 'signed' ? <Badge tone="ok">{t('Signed')}</Badge> : status === 'voided' ? <Badge tone="danger">{t('Voided')}</Badge> : <Badge tone="warn">{t('Not yet signed')}</Badge>
}

/** Append-only consultation history. Corrections appear as their own entries, linked to the original. */
export function VisitHistory({ patientId, compact, onCorrect }: { patientId: string; compact?: boolean; onCorrect?: (c: Consultation) => void }) {
  const t = useT()
  const { data, staffById } = useClinic()
  const consults = data.consultations.filter((c) => c.patient_id === patientId).sort((a, b) => b.created_at - a.created_at)
  if (!consults.length)
    return <p className="rounded-2xl bg-canvas p-5 text-base text-ink-2">{t('No digital consultations yet. Older visits are in the paper folder; see Old paper records.')}</p>
  return (
    <ol className="flex flex-col gap-3">
      {consults.map((c) => {
        const doc = staffById(c.doctor_id)
        const dx = data.diagnoses.filter((d) => d.consultation_id === c.consultation_id)
        const rx = data.prescriptions.filter((r) => r.consultation_id === c.consultation_id)
        const mc = data.documents.filter((d) => d.consultation_id === c.consultation_id)
        const labs = data.labs.filter((l) => l.consultation_id === c.consultation_id)
        const corrections = consults.filter((x) => x.correction_of === c.consultation_id)
        return (
          <li key={c.consultation_id} id={`entry-${c.consultation_id}`} className={cn('rounded-3xl border bg-surface p-5', c.correction_of ? 'border-brand-200 bg-brand-50/40' : 'border-line')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  {c.correction_of && <span className="mr-2 rounded-full bg-brand-600 px-2.5 py-0.5 text-sm font-semibold text-white">{t('Correction')}</span>}
                  {c.chief_complaint}
                </p>
                <p className="text-[15px] text-muted">
                  {fmtDay(c.consult_date)} · {t(c.service_type)} · {doc?.name} · entered {fmtStampOf(c.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.sync === 'local' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-sm font-semibold text-danger">
                    <CloudArrowUp size={16} /> Saved on this computer · {t('waiting to sync')}
                  </span>
                )}
                {onCorrect && !c.correction_of && c.sync !== 'local' && (
                  <Button size="sm" variant="ghost" icon={<PencilSimple size={16} />} onClick={() => onCorrect(c)}>
                    Add correction
                  </Button>
                )}
              </div>
            </div>
            {!compact && <p className="mt-3 max-w-[75ch] text-base leading-relaxed text-ink-2">{c.treatment_notes}</p>}
            {c.vitals && !compact && (
              <p className="mt-2 text-[15px] text-muted">
                BP {c.vitals.bp ?? '—'} · Temp {c.vitals.temperature ?? '—'} °C · Pulse {c.vitals.pulse ?? '—'} · RR {c.vitals.respiration ?? '—'} · Height {c.vitals.height ?? '—'} cm · Weight {c.vitals.weight ?? '—'} kg
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {dx.map((d) => (
                <Badge key={d.diagnosis_id} tone="brand">
                  {d.icd10_code ? `${d.icd10_code} ` : ''}
                  {d.description}
                </Badge>
              ))}
            </div>
            {(rx.length > 0 || mc.length > 0 || labs.length > 0) && (
              <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                {rx.map((r) => (
                  <li key={r.prescription_id} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <Pill size={18} className="text-brand-600" />
                    <span className="font-medium">{r.items.map((i) => `${i.drug_name} ${i.dose}`).join(', ')}</span>
                    <DocStatusBadge status={r.status} />
                    {r.document_no && <span className="font-mono text-sm text-danger">{r.document_no}</span>}
                    {r.status === 'voided' && <span className="text-sm text-muted">({r.void_reason})</span>}
                    <button type="button" onClick={() => window.open(`/print/rx/${r.prescription_id}`, '_blank')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                      <Printer size={14} /> {t('Print')}
                    </button>
                  </li>
                ))}
                {mc.map((d) => (
                  <li key={d.document_id} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <FileText size={18} className="text-brand-600" />
                    <span className="font-medium">
                      {t('Medical certificate')}: {d.purpose}
                      {d.rest_days ? `, ${d.rest_days} day${d.rest_days > 1 ? 's' : ''} rest` : ''}
                    </span>
                    <DocStatusBadge status={d.status} />
                    {d.document_no && <span className="font-mono text-sm text-danger">{d.document_no}</span>}
                    {d.status === 'voided' && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted">
                        <Prohibit size={14} /> {d.void_reason}
                      </span>
                    )}
                    <button type="button" onClick={() => window.open(`/print/mc/${d.document_id}`, '_blank')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                      <Printer size={14} /> {t('Print')}
                    </button>
                  </li>
                ))}
                {labs.map((l) => (
                  <li key={l.lab_id} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <Flask size={18} className="text-brand-600" />
                    <span className="font-medium">{l.test_name}</span>
                    {l.status === 'resulted' ? <span className="text-ink-2">{l.result}</span> : <Badge tone="warn">{t('Waiting for result')}</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {corrections.length > 0 && <p className="mt-3 text-sm font-medium text-brand-700">Corrected by {corrections.length} later entr{corrections.length > 1 ? 'ies' : 'y'}. This original is kept unchanged.</p>}
          </li>
        )
      })}
    </ol>
  )
}
