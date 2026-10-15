import { ArrowsClockwise, Copy, Trash, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button, Modal, useToast } from '../../../shared/components/ui'
import { fmtDay } from '../lib/helpers'
import { useT } from '../lib/i18n'
import { useClinic, type PendingOp } from '../store/store'

/** The text of a refused entry, so the doctor can paste it into a fresh consultation if it cannot be resent. */
function asText(op: PendingOp, name: string) {
  if (op.kind === 'consult') {
    const c = op.input
    return [
      `Patient: ${name}`,
      `Written: ${new Date(op.at).toLocaleString()}`,
      `Chief complaint: ${c.chief_complaint}`,
      `Notes: ${c.treatment_notes}`,
      c.diagnoses.length ? `Diagnosis: ${c.diagnoses.map((d) => `${d.description} (${d.icd10_code})`).join('; ')}` : '',
      c.rx.length ? `Prescription: ${c.rx.map((r) => `${r.drug_name} ${r.dose}, ${r.frequency}, #${r.quantity}`).join('; ')}` : '',
      c.certificate ? `Certificate: ${c.certificate.purpose}; ${c.certificate.findings}${c.certificate.rest_days ? `; ${c.certificate.rest_days} day(s) rest` : ''}` : '',
      c.labs.length ? `Labs: ${c.labs.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (op.kind === 'folder_scan') return `Scanned paper folder${op.input.patient_hint ? ` (${op.input.patient_hint})` : ''}, captured ${new Date(op.input.captured_at).toLocaleString()}`
  if (op.kind === 'scan') return `Scanned ${op.input.scan_kind.toLowerCase()} page for ${name}, dated ${op.input.page_date}`
  return `Change to a draft ${op.input.doc_kind === 'rx' ? 'prescription' : 'certificate'}`
}

/**
 * Offline entries the server refused stay on this computer until their author deals with them. A banner
 * on every clinic screen says so; nothing is thrown away without the person choosing to.
 */
export function RejectedOutbox() {
  const { rejected, retryRejected, discardRejected, personOfPatient } = useClinic()
  const t = useT()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  if (!rejected.length) return null
  const nameOf = (op: PendingOp) => (op.kind === 'edit_draft' || op.kind === 'folder_scan' ? '' : (personOfPatient(op.input.patient_id)?.full_name ?? 'a patient'))

  const copy = async (op: PendingOp) => {
    try {
      await navigator.clipboard.writeText(asText(op, nameOf(op)))
      toast({ tone: 'ok', title: t('Copied'), body: t('Paste it into a new consultation or a note.') })
    } catch {
      toast({ tone: 'warn', title: t('Could not copy'), body: t('Select the text and copy it by hand.') })
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-danger-soft px-5 py-4 text-left text-base font-semibold text-danger">
        <Warning size={22} weight="fill" className="shrink-0" />
        <span className="flex-1">
          {rejected.length} {rejected.length === 1 ? t('offline entry was refused by the server') : t('offline entries were refused by the server')}. {t('They are kept on this computer. Review them.')}
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Entries the server refused')} subtitle={t('Nothing here has reached the patient record yet.')} wide>
        <ul className="flex flex-col gap-3">
          {rejected.map((op) => (
            <li key={op.op_id} className="rounded-2xl border border-line p-4">
              <p className="text-base font-semibold">
                {op.kind === 'consult' ? t('Consultation') : op.kind === 'scan' ? t('Scanned page') : t('Draft change')}
                {nameOf(op) && ` · ${nameOf(op)}`} · <span className="font-normal text-muted">{fmtDay(new Date(op.at).toISOString().slice(0, 10))}</span>
              </p>
              <p className="mt-1 text-[15px] text-danger">{op.rejected?.reason}</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-sans text-sm text-ink-2">{asText(op, nameOf(op))}</pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Copy size={16} />} onClick={() => copy(op)}>
                  {t('Copy text')}
                </Button>
                <Button size="sm" variant="secondary" icon={<ArrowsClockwise size={16} />} onClick={() => void retryRejected(op.op_id)}>
                  {t('Send again')}
                </Button>
                {confirm === op.op_id ? (
                  <Button size="sm" variant="danger" icon={<Trash size={16} />} onClick={() => void discardRejected(op.op_id).then(() => setConfirm(null))}>
                    {t('Yes, discard it')}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" icon={<Trash size={16} />} onClick={() => setConfirm(op.op_id)}>
                    {t('Discard')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
