import { Camera, CheckCircle, Copy, MagnifyingGlass, Scan, UploadSimple, Warning } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Chip, Field, Input, Modal, Select, Textarea, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import type { DocumentReading } from '../api-types'
import { compressImage, fmtDay, todayKey } from '../lib/helpers'
import { useClinic } from '../store/store'
import type { ScanCategory, ScanKind } from '../types'
import { CameraCapture } from './CameraCapture'

/*
  Scan with AI, from anywhere in the doctor's screens: photograph a medical certificate, lab result, dental report or
  prescription, let the local reader write out what is on it, check it, and file the page in the patient's record.

  Nothing is filed until the doctor presses the button. The page is compared with the patient it is for, because the worst
  mistake is a result filed in the wrong person's record. If the reader is not set up or fails, the photo can still be
  attached on its own.
*/

const KINDS: { kind: ScanKind; label: string }[] = [
  { kind: 'Certificate', label: 'Medical certificate' },
  { kind: 'Lab result', label: 'Lab result' },
  { kind: 'Dental', label: 'Dental' },
  { kind: 'Prescription', label: 'Prescription' },
  { kind: 'Chart', label: 'Other page' },
]

export function ScanDocument({ open, onClose, patientId }: { open: boolean; onClose: () => void; /** The patient it is for, when opened from their record. Otherwise the doctor chooses. */ patientId?: string }) {
  const { search, personOfPatient, readDocumentScan, uploadScan, online } = useClinic()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [chosen, setChosen] = useState<string | null>(patientId ?? null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ScanKind>('Certificate')
  const [camera, setCamera] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [reading, setReading] = useState<DocumentReading | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<ScanCategory>('Outside report')
  const [source, setSource] = useState('')
  const [sure, setSure] = useState(false)
  const [checked, setChecked] = useState(false) // the doctor read the text against the paper
  const [fileError, setFileError] = useState('') // what is missing to file the page, shown beside the filing fields

  const reset = () => {
    setImage(null)
    setReading(null)
    setError('')
    setFileError('')
    setText('')
    setDate('')
    setSource('')
    setSure(false)
    setChecked(false)
    setBusy(false)
  }
  // A fresh screen each time it opens, for the patient it was opened for.
  useEffect(() => {
    if (!open) return
    reset()
    setChosen(patientId ?? null)
    setQuery('')
    setCategory('Outside report')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId])

  const person = chosen ? personOfPatient(chosen) : undefined
  const hits = query.trim().length >= 2 ? search(query, 6).filter((h) => h.patient) : []
  const outside = category === 'Outside report'
  const mismatch = reading?.name_matches === false

  const read = async (data: string) => {
    if (!chosen) return
    reset()
    setImage(data)
    setBusy(true)
    const out = await readDocumentScan(data, kind, chosen)
    setBusy(false)
    if (out.error || !out.reading) {
      setError(out.error ?? 'The page could not be read.')
      return
    }
    setReading(out.reading)
    setText(out.reading.text.join('\n'))
    setDate(out.reading.date)
    setSource(out.reading.issued_by)
  }

  const onFile = async (files: FileList | null) => {
    const f = files?.[0]
    if (fileInput.current) fileInput.current.value = ''
    if (!f) return
    try {
      await read(await compressImage(f, 2000, 0.85))
    } catch {
      toast({ tone: 'warn', title: `${f.name} is not an image`, body: 'Photograph or scan the page as JPG or PNG.' })
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ tone: 'ok', title: 'Copied', body: 'Paste it into a note or a consultation.' })
    } catch {
      toast({ tone: 'warn', title: 'Could not copy', body: 'Select the text and copy it by hand.' })
    }
  }

  /** `withText` false files the photo alone, for when the reader could not read the page. */
  const attach = async (withText: boolean) => {
    if (!chosen || !image) return
    if (outside && !source.trim()) {
      setFileError('Name the clinic or hospital the page came from, or choose Old folder page.')
      return
    }
    setFileError('')
    setBusy(true)
    const ok = await uploadScan(chosen, reading?.image ?? image, kind, date || todayKey(), {
      category,
      source_clinic: outside ? source.trim() : undefined,
      report_date: outside ? date || undefined : undefined,
      text: withText ? text.trim() || undefined : undefined,
    })
    setBusy(false)
    if (!ok) return
    toast({ tone: 'ok', title: `Attached to ${person?.full_name ?? 'the record'}`, body: withText && text.trim() ? 'The page and the text read from it are in the patient record, under Old paper records.' : 'The page is in the patient record, under Old paper records.' })
    onClose()
  }

  /** Where the page is filed, from whom and when. The same after a reading and when the reader failed and only the photo is filed. */
  const filing = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Filed as">
        <Select value={category} onChange={(e) => setCategory(e.target.value as ScanCategory)} className="h-12 text-base">
          <option value="Outside report">Outside clinic report</option>
          <option value="Old folder">Old folder page</option>
        </Select>
      </Field>
      <Field label="Date on the page" optional>
        <Input type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
      </Field>
      {outside && (
        <Field label="From which clinic or hospital?" className="sm:col-span-2">
          <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} className="h-12 text-base" />
        </Field>
      )}
    </div>
  )

  const kindLabel = KINDS.find((k) => k.kind === kind)?.label ?? 'page'
  const canAttach = !!reading && !busy && (!mismatch || sure) && (!text.trim() || checked)

  return (
    <Modal open={open} onClose={onClose} wide title="Scan with AI" subtitle="Photograph a certificate, lab result, dental report or prescription. You check what was read, then it is filed in the patient's record.">
      <div className="flex flex-col gap-5">
        {/* 1. Who it is for */}
        {!chosen ? (
          <div>
            <p className="text-base font-semibold">Which patient is this for?</p>
            <div className="relative mt-2">
              <MagnifyingGlass size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or patient number" className="h-12 pl-12 text-base" aria-label="Search for the patient" />
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {hits.map((h) => (
                <button key={h.patient!.patient_id} type="button" onClick={() => setChosen(h.patient!.patient_id)} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/60">
                  <span className="text-base font-semibold">{h.person.full_name}</span>
                  <span className="text-sm text-muted">
                    {fmtDay(h.person.birthdate)} · {h.patient!.patient_no}
                  </span>
                </button>
              ))}
              {query.trim().length >= 2 && !hits.length && <p className="px-1 text-sm text-muted">No patient with a record matches. A new person is registered at the front desk first.</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50 px-4 py-3">
            <p className="text-base">
              For <b>{person?.full_name}</b>
              {person && <span className="text-muted"> · {fmtDay(person.birthdate)}</span>}
            </p>
            {!patientId && !busy && (
              <button type="button" className="text-sm font-semibold text-brand-700 underline underline-offset-2" onClick={() => (reset(), setChosen(null))}>
                Change patient
              </button>
            )}
          </div>
        )}

        {/* 2. What kind of page, and the photo */}
        {chosen && !reading && (
          <div>
            <p className="text-base font-semibold">What is on the page?</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Kind of page">
              {KINDS.map((k) => (
                <Chip key={k.kind} selected={kind === k.kind} onClick={() => !busy && setKind(k.kind)} className="h-11 text-base">
                  {k.label}
                </Chip>
              ))}
            </div>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files)} />
            <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={(data) => (setCamera(false), void read(data))} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-14" disabled={busy || !online} icon={<Camera size={22} />} onClick={() => setCamera(true)}>
                Take a picture
              </Button>
              <Button size="lg" variant="secondary" className="h-14" disabled={busy || !online} icon={<UploadSimple size={20} />} onClick={() => fileInput.current?.click()}>
                Upload a photo
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">
              {online ? 'Lay the page flat, in good light, with all of it in the picture. It is read on the clinic computer; nothing goes to the internet.' : 'The clinic server cannot be reached. Scan with AI needs it. Use Attach scans on the patient record to keep a photo for later.'}
            </p>
            {busy && (
              <p className="mt-4 flex items-center gap-2 text-base font-medium text-brand-800" role="status">
                <Scan size={24} className="animate-pulse" /> Reading the page. This takes about 15 seconds…
              </p>
            )}
            {error && !busy && (
              <div className="mt-4 rounded-2xl bg-danger-soft p-4" role="alert">
                <p className="flex items-start gap-2 text-base font-semibold text-danger">
                  <Warning size={20} weight="fill" className="mt-0.5 shrink-0" /> {error}
                </p>
                {image && (
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-sm text-ink-2">You can still keep the photo with the record. Say where it came from:</p>
                    {filing}
                    {fileError && (
                      <p className="text-base font-medium text-danger" role="alert">
                        {fileError}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="md" variant="secondary" onClick={() => void read(image)}>
                        Try again
                      </Button>
                      <Button size="md" variant="secondary" onClick={() => void attach(false)}>
                        Attach the photo without reading it
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Check it, then file it */}
        {chosen && reading && image && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div>
              <img src={reading.image ?? image} alt={`The ${kindLabel.toLowerCase()} that was scanned`} className="max-h-80 w-full rounded-2xl border border-line object-contain bg-mist" />
              <button type="button" className="mt-2 text-sm font-semibold text-brand-700 underline underline-offset-2" onClick={() => reset()} disabled={busy}>
                Scan a different page
              </button>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              {mismatch ? (
                <div className="rounded-2xl border-2 border-danger bg-danger-soft p-4" role="alert">
                  <p className="flex items-start gap-2 text-base font-semibold text-danger">
                    <Warning size={22} weight="fill" className="mt-0.5 shrink-0" />
                    <span>
                      This page names <b>{reading.name_on_page}</b>, not {reading.patient_name}.
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-ink-2">Check the paper. A result filed in the wrong person's record can be read as theirs.</p>
                  <label className="mt-3 flex items-center gap-3 text-base font-medium">
                    <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="size-5 accent-brand-600" />
                    It is this patient. File it anyway.
                  </label>
                </div>
              ) : reading.name_matches ? (
                <p className="flex items-center gap-2 text-base font-medium text-ok">
                  <CheckCircle size={20} weight="fill" /> The name on the page matches {reading.patient_name}.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-base text-ink-2">
                  <Warning size={20} className="shrink-0 text-warn" /> The page names no one, so it could not be checked against {reading.patient_name}. Check the paper.
                </p>
              )}

              {filing}

              <Field label="Text read from the page" hint="Check it against the paper and fix anything wrong. It is filed with the page, so it can be searched and copied later.">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} className={cn('min-h-40 font-mono text-[15px] leading-relaxed')} spellCheck={false} />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon={<Copy size={16} />} onClick={() => void copy()} disabled={!text.trim()}>
                  Copy the text
                </Button>
              </div>
              {!!reading.turned && <p className="text-sm text-muted">The photo was sideways, so it was turned upright. The turned photo is the one that is filed.</p>}
              {reading.small === true && (
                <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-base text-ink" role="note">
                  <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-warn" />
                  <span>
                    The larger reader is not installed, so a smaller one read this page. It can add rows and numbers that are not on the paper. Delete any line you cannot find on it.
                  </span>
                </p>
              )}
              {text.trim() && (
                <label className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-base font-medium">
                  <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
                  <span>I read this text against the paper, and every line is on it.</span>
                </label>
              )}

              {fileError && (
                <p className="text-base font-medium text-danger" role="alert">
                  {fileError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button size="lg" className="h-14" icon={<CheckCircle size={22} />} disabled={!canAttach} onClick={() => void attach(true)}>
                  {busy ? 'Attaching…' : `Attach to ${person?.full_name.split(' ')[0] ?? 'the'}'s file`}
                </Button>
                <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
