import { ArrowsClockwise, FileText, Pill, Printer, Prohibit, Signature } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Input, Modal, Tabs, Textarea, useToast } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { PinModal } from '../components/ClinicComponents'
import { useT } from '../lib/i18n'
import { fmtStampOf } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { DocStatus } from '../types'
import { DocStatusBadge } from './history'

type Row = { kind: 'rx' | 'doc'; id: string; patientId: string; status: DocStatus; no?: string; title: string; detail: string; when: number; doctorId: string; voidReason?: string; replaces?: string }

/** Every prescription and certificate. Signed documents are never edited: void with a reason, then reissue. */
export default function Documents() {
  const t = useT()
  const toast = useToast()
  const { data, me, personOfPatient, staffById, signDocuments, voidDocument, reissueDocument, editDraft, online } = useClinic()
  const [tab, setTab] = useState<'draft' | 'signed' | 'voided'>('draft')
  const [q, setQ] = useState('')
  const [voiding, setVoiding] = useState<Row | null>(null)
  const [reason, setReason] = useState('')
  const [signing, setSigning] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)

  const rows = useMemo<Row[]>(() => {
    const rx: Row[] = data.prescriptions.map((r) => ({ kind: 'rx', id: r.prescription_id, patientId: r.patient_id, status: r.status, no: r.document_no, title: t('Prescription'), detail: r.items.map((i) => `${i.drug_name} ${i.dose}`).join(', '), when: r.issued_at ?? r.created_at, doctorId: r.doctor_id, voidReason: r.void_reason, replaces: r.replaces }))
    const mc: Row[] = data.documents.map((d) => ({ kind: 'doc', id: d.document_id, patientId: d.patient_id, status: d.status, no: d.document_no, title: t('Medical certificate'), detail: `${d.purpose}${d.rest_days ? `, ${d.rest_days} day${d.rest_days > 1 ? 's' : ''} rest` : ''}`, when: d.issued_at ?? d.created_at, doctorId: d.doctor_id, voidReason: d.void_reason, replaces: d.replaces }))
    return [...rx, ...mc].sort((a, b) => b.when - a.when)
  }, [data.prescriptions, data.documents, t])

  const visible = rows.filter((r) => r.status === tab).filter((r) => !q || `${personOfPatient(r.patientId)?.full_name} ${r.no ?? ''} ${r.detail}`.toLowerCase().includes(q.toLowerCase()))
  const counts = { draft: rows.filter((r) => r.status === 'draft').length, signed: rows.filter((r) => r.status === 'signed').length, voided: rows.filter((r) => r.status === 'voided').length }

  return (
    <div>
      <PageTitle title={t('Documents')} sub="Each document carries the doctor's name, license and PTR numbers, signature and a document number." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'draft', label: t('Not yet signed'), count: counts.draft },
            { value: 'signed', label: t('Signed'), count: counts.signed },
            { value: 'voided', label: t('Voided'), count: counts.voided },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient or document no." className="h-12 text-base sm:w-80" />
      </div>
      <ul className="flex flex-col gap-3">
        {visible.slice(0, 80).map((r) => {
          const p = personOfPatient(r.patientId)
          const doc = staffById(r.doctorId)
          const replaced = r.replaces ? rows.find((x) => x.id === r.replaces) : undefined
          return (
            <li key={r.id}>
              <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">{r.kind === 'rx' ? <Pill size={24} /> : <FileText size={24} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {r.title}
                    {r.no && <span className="font-mono text-base text-danger">{r.no}</span>}
                    <DocStatusBadge status={r.status} />
                  </p>
                  <p className="truncate text-base text-ink-2">
                    <Link to={`/clinic/patients/${r.patientId}`} className="font-semibold text-ink hover:underline">
                      {p?.full_name}
                    </Link>{' '}
                    · {r.detail}
                  </p>
                  <p className="text-sm text-muted">
                    {doc?.name} · {fmtStampOf(r.when)}
                    {replaced && ` · replaces ${replaced.no}`}
                    {r.voidReason && ` · voided: ${r.voidReason}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Printer size={16} />} onClick={() => window.open(`/print/${r.kind === 'rx' ? 'rx' : 'mc'}/${r.id}`, '_blank')}>
                    {t('Print')}
                  </Button>
                  {r.status === 'draft' && r.doctorId === me?.staff_id && (
                    <>
                      {r.kind === 'doc' && (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          Edit draft
                        </Button>
                      )}
                      <Button size="sm" icon={<Signature size={16} />} disabled={!online} onClick={() => setSigning(r)}>
                        {t('Sign')}
                      </Button>
                    </>
                  )}
                  {r.status === 'signed' && (
                    <Button size="sm" variant="danger" icon={<Prohibit size={16} />} onClick={() => setVoiding(r)}>
                      {t('Void')}
                    </Button>
                  )}
                  {r.status === 'voided' && !rows.some((x) => x.replaces === r.id) && (
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<ArrowsClockwise size={16} />}
                      onClick={() => {
                        reissueDocument(r.kind, r.id)
                        setTab('draft')
                        toast({ tone: 'info', title: 'Replacement drafted', body: 'Review it, then sign with your PIN.' })
                      }}
                    >
                      {t('Reissue')}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
        {visible.length === 0 && <li className="rounded-3xl bg-surface p-8 text-center text-lg text-ink-2">Nothing here.</li>}
      </ul>

      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={`${t('Void')} ${voiding?.no ?? ''}`}
        subtitle="The document keeps its row with the reason. Issue a corrected one afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoiding(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 4}
              onClick={() => {
                voidDocument(voiding!.kind, voiding!.id, reason.trim())
                toast({ tone: 'warn', title: `${voiding!.no} voided`, body: 'Recorded in the audit trail. Use Reissue to draft the corrected document.' })
                setVoiding(null)
                setReason('')
                setTab('voided')
              }}
            >
              {t('Void')}
            </Button>
          </>
        }
      >
        <Field label={`${t('Reason')} *`}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong number of rest days" className="text-base" autoFocus />
        </Field>
      </Modal>

      {editing && <EditCertificate id={editing.id} onClose={() => setEditing(null)} save={(patch) => editDraft('doc', editing.id, patch)} />}

      <PinModal
        open={!!signing}
        onClose={() => setSigning(null)}
        title={`${t('Sign')}: ${signing?.title ?? ''}`}
        onSubmit={(pin) => {
          const r = signDocuments([{ kind: signing!.kind, id: signing!.id }], pin)
          if (r === 'ok') {
            toast({ tone: 'ok', title: 'Signed', body: 'A document number was issued. Print it from the Signed tab.' })
            setTab('signed')
          }
          return r
        }}
      />
    </div>
  )
}

function EditCertificate({ id, onClose, save }: { id: string; onClose: () => void; save: (patch: { purpose: string; findings: string; rest_days: number; remarks?: string }) => void }) {
  const { data } = useClinic()
  const d = data.documents.find((x) => x.document_id === id)!
  const [f, setF] = useState({ purpose: d.purpose, findings: d.findings, rest_days: d.rest_days ?? 0, remarks: d.remarks ?? '' })
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Edit draft certificate"
      subtitle="Drafts can be changed until they are signed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              save({ ...f, remarks: f.remarks || undefined })
              onClose()
            }}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purpose">
          <Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} className="h-12 text-base" />
        </Field>
        <Field label="Rest days">
          <Input type="number" min={0} value={f.rest_days} onChange={(e) => setF({ ...f, rest_days: Number(e.target.value) })} className="h-12 text-base" />
        </Field>
        <Field label="Findings" className="sm:col-span-2">
          <Textarea value={f.findings} onChange={(e) => setF({ ...f, findings: e.target.value })} className="text-base" />
        </Field>
        <Field label="Remarks" optional className="sm:col-span-2">
          <Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} className="h-12 text-base" />
        </Field>
      </div>
    </Modal>
  )
}
