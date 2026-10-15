import { ArrowRight, Camera, CheckCircle, CloudArrowUp, Cpu, FolderOpen, Lightning, PencilLine, Scan, ShieldCheck, Target, Timer, Trash, UploadSimple, Warning, WifiSlash } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useLocation } from 'react-router-dom'
import { Badge, Button, Card, Field, IconButton, Input, Select, Tabs, useToast } from '../../../shared/components/ui'
import { cn } from '../../../shared/lib/utils'
import { PageTitle } from '../ClinicShell'
import { CameraCapture } from '../components/CameraCapture'
import type { PendingScan, RecognitionMetrics, ScanField, ScanReading } from '../api-types'
import { compressImage, fmtDay, todayKey } from '../lib/helpers'
import { useClinic } from '../store/store'

/*
  Old patient arrives -> pull the paper folder -> photograph the intake form -> the clinic server reads it
  (local OCR, plus a local language model when Ollama runs) -> nurse or doctor verifies every field -> saved.
  Nothing here calls the internet. The second tab is the measured accuracy and speed of that pipeline.
*/

const SAMPLES = [
  { file: 'sample-villanueva', label: 'Villanueva (clean print)' },
  { file: 'sample-delacruz', label: 'Dela Cruz (2 allergies)' },
  { file: 'sample-villanueva-photo', label: 'Villanueva (tilted phone photo)' },
]

const GROUPS: { key: ScanField['group']; title: string; one: string }[] = [
  { key: 'identity', title: 'Patient details', one: 'Detail' },
  { key: 'allergy', title: 'Allergies', one: 'Allergy' },
  { key: 'family', title: 'Family history', one: 'Family history' },
  { key: 'medicines', title: 'Regular medicines', one: 'Regular medicines' },
  { key: 'visit', title: 'Last visits', one: 'Visit' },
]
const EXTRA_KEYS: Record<string, string> = { allergy: 'allergy_', family: 'family_', visit: 'visit_' }

/** Milliseconds on a steady clock, for timing how long a person takes to verify a form. */
const clock = () => performance.now()
const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`
const tone = (c: number, review: boolean) => (review || c < 60 ? 'text-warn' : c < 85 ? 'text-ink-2' : 'text-ok')

export default function ScanFolder() {
  const [tab, setTab] = useState<'scan' | 'accuracy'>('scan')
  return (
    <div>
      <PageTitle
        title="Scan old folder"
        sub="Photograph the intake form copied from the paper folder. The clinic server reads it with no internet, then you verify every field before it is saved."
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ value: 'scan', label: 'Scan a folder' }, { value: 'accuracy', label: 'Accuracy and speed' }]} />
      {tab === 'scan' ? <Scanner onDone={() => undefined} /> : <Accuracy />}
    </div>
  )
}

/* ------------------------------------------------------------------ scanner */

function Scanner({ onDone }: { onDone: () => void }) {
  const { data, online, search, patient, personOfPatient, scanFolderForm, confirmFolderScan, pending, captureFolderScan, fetchPendingScans, openPendingScan, discardPendingScan } = useClinic()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const routed = useLocation()
  // Handed over from a patient's "Scan with AI": already read, so it opens straight on verifying.
  const [handed] = useState(() => (routed.state ?? null) as { image?: string; reading?: ScanReading; patientId?: string; returnTo?: string } | null)
  const [image, setImage] = useState<string | null>(handed?.image ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState<ScanReading | null>(handed?.reading ?? null)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((handed?.reading?.fields ?? []).map((f) => [f.key, f.value])))
  const [patientId, setPatientId] = useState(handed?.patientId || handed?.reading?.match?.patient_id || '')
  const [q, setQ] = useState('')
  const shownAt = useRef(0)
  useEffect(() => {
    if (handed?.reading) shownAt.current = clock()
  }, [handed])
  const [camera, setCamera] = useState(false)
  const [fromQueue, setFromQueue] = useState(false)
  const [hint, setHint] = useState('')
  const [queue, setQueue] = useState<PendingScan[]>([])
  const local = pending.filter((o) => o.kind === 'folder_scan')

  const reload = useCallback(async () => {
    const r = await fetchPendingScans()
    if (r) setQueue(r)
  }, [fetchPendingScans])
  // Photos sent from the offline queue show up here once the server has read them.
  useEffect(() => {
    if (!online) return
    let live = true
    void fetchPendingScans().then((r) => {
      if (live && r) setQueue(r)
    })
    return () => {
      live = false
    }
  }, [online, local.length, fetchPendingScans])
  useEffect(() => {
    if (!online || (!local.length && !queue.some((p) => p.status === 'queued'))) return
    const id = setInterval(() => void reload(), 3000)
    return () => clearInterval(id)
  }, [online, local.length, queue, reload])
  const [saved, setSaved] = useState<{ patient_id: string; correct: number; total: number; added: number } | null>(null)

  const reset = () => {
    setImage(null)
    setReading(null)
    setValues({})
    setPatientId('')
    setError('')
    setQ('')
    setSaved(null)
    setFromQueue(false)
  }

  /** No server to read it: the photo and who it is for stay on this computer, and are sent when the server is back. */
  const keepForLater = async (dataUrl: string) => {
    await captureFolderScan(dataUrl, hint.trim() || undefined)
    setHint('')
    toast({ tone: 'ok', title: 'Photo saved on this computer', body: 'It will be sent and read automatically when the clinic server is reachable. Keep working.' })
  }

  const read = async (dataUrl: string) => {
    reset()
    if (!online) return keepForLater(dataUrl)
    setImage(dataUrl)
    setBusy(true)
    const out = await scanFolderForm(dataUrl)
    setBusy(false)
    if (out.offline) {
      setImage(null)
      return keepForLater(dataUrl)
    }
    if (out.error || !out.reading) {
      setError(out.error ?? 'The scan could not be read.')
      return
    }
    setReading(out.reading)
    setValues(Object.fromEntries(out.reading.fields.map((f) => [f.key, f.value])))
    setPatientId(out.reading.match?.patient_id ?? '')
    shownAt.current = clock()
  }

  /** Asks the local vision model to read the same picture, for handwriting the OCR could not read. It replaces the first reading. */
  const readHandwriting = async () => {
    if (!image || !reading) return
    setBusy(true)
    setError('')
    const out = await scanFolderForm(image, { handwriting: true, replaces: reading.event_id })
    setBusy(false)
    if (out.error || !out.reading) {
      setError(out.error ?? 'The handwriting could not be read.')
      return
    }
    setReading(out.reading)
    setValues(Object.fromEntries(out.reading.fields.map((f) => [f.key, f.value])))
    setPatientId((p) => p || (out.reading?.match?.patient_id ?? ''))
  }

  const onFile = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    try {
      // The form text needs more pixels than a thumbnail: keep 2000 px on the long side.
      await read(await compressImage(f, 2000, 0.85))
    } catch {
      toast({ tone: 'warn', title: `${f.name} is not an image`, body: 'Photograph or scan the form as JPG or PNG.' })
    }
    if (input.current) input.current.value = ''
  }

  const trySample = async (file: string) => {
    const res = await fetch(`/forms/${file}.png`)
    await read(await compressImage(new File([await res.blob()], `${file}.png`, { type: 'image/png' }), 2000, 0.85))
  }

  /* What the clinic has typed before, offered while correcting a line. */
  const suggestions = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort().slice(0, 60)
    return {
      allergy: uniq(data.allergies.map((a) => `${a.substance} - ${a.reaction} - ${a.severity.toUpperCase()}`)),
      family: uniq(data.familyHistory.map((f) => `${f.relative.toUpperCase()} - ${f.condition.toUpperCase()}`)),
      visit: uniq(data.consultations.map((c) => c.chief_complaint.toUpperCase())),
      medicines: [] as string[],
      identity: [] as string[],
    } satisfies Record<ScanField['group'], string[]>
  }, [data.allergies, data.familyHistory, data.consultations])

  const hits = useMemo(() => (q.trim().length > 1 ? search(q, 6).filter((h) => h.patient) : []), [q, search])
  const chosen = patient(patientId)
  const chosenName = personOfPatient(patientId)?.full_name

  const changed = reading ? reading.fields.filter((f) => (values[f.key] ?? '') !== f.value).length : 0
  const flagged = reading ? reading.fields.filter((f) => f.review).length : 0

  const save = async () => {
    if (!reading || !patientId || !image) return
    setBusy(true)
    const out = await confirmFolderScan(reading.event_id, { patient_id: patientId, values, review_ms: clock() - shownAt.current, file: fromQueue ? undefined : image })
    setBusy(false)
    if (out.error) {
      toast({ tone: 'warn', title: 'Not saved', body: out.error })
      return
    }
    setSaved({ patient_id: patientId, correct: out.correct ?? 0, total: out.field_count ?? 0, added: out.added ?? 0 })
    void reload()
    onDone()
  }

  const openQueued = async (id: string) => {
    const out = await openPendingScan(id)
    if (out.error || !out.opened) {
      toast({ tone: 'warn', title: 'Could not open this photo', body: out.error })
      return
    }
    const o = out.opened
    reset()
    setImage(o.image)
    setReading(o)
    setValues(Object.fromEntries(o.fields.map((f) => [f.key, f.value])))
    setPatientId(o.match?.patient_id ?? '')
    setQ(o.match ? '' : o.patient_hint)
    setFromQueue(true)
    shownAt.current = clock()
  }

  const discard = async () => {
    if (reading && fromQueue) await discardPendingScan(reading.event_id)
    reset()
    void reload()
  }

  const extraRow = (group: string) => {
    const prefix = EXTRA_KEYS[group]
    if (!prefix) return null
    const n = Object.keys(values).filter((k) => k.startsWith(prefix)).length + 1
    return (
      <button type="button" className="mt-2 text-sm font-medium text-brand-700 underline underline-offset-2" onClick={() => setValues((v) => ({ ...v, [`${prefix}${n}`]: '' }))}>
        + Add a line the machine missed
      </button>
    )
  }

  if (saved) {
    return (
      <Card className="max-w-2xl p-8">
        <p className="flex items-center gap-3 text-2xl font-semibold">
          <CheckCircle size={32} weight="fill" className="text-ok" /> Saved to the record
        </p>
        <p className="mt-3 text-lg text-ink-2">
          {saved.correct} of {saved.total} fields were read correctly before your corrections. {saved.added} allergy or family-history entries were added to {chosenName ?? 'the patient'}'s record, and the scanned page is filed under Old paper records.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {handed?.returnTo && (
            <Button size="lg" to={handed.returnTo} iconRight={<ArrowRight size={20} weight="bold" />}>
              Back to check-in
            </Button>
          )}
          <Button size="lg" variant={handed?.returnTo ? 'secondary' : 'primary'} to={`/clinic/patients/${saved.patient_id}`}>
            Open the record
          </Button>
          <Button size="lg" variant="secondary" onClick={reset}>
            Scan another folder
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <ol className="mb-4 flex flex-col gap-2 text-sm text-muted">
            {['Pull the paper folder', 'Photograph the form', 'Machine reads it', 'You verify', 'Saved to the record'].map((s, i) => {
              const current = (i === 1 && !image) || (i === 2 && busy) || (i === 3 && !!reading)
              return (
                <li key={s} aria-current={current ? 'step' : undefined} className={cn('flex items-center gap-3', current && 'font-semibold text-ink')}>
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold', current ? 'bg-brand-600 text-white' : 'bg-mist')}>{i + 1}</span>
                  {s}
                </li>
              )
            })}
          </ol>
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files)} />
          <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={(data) => { setCamera(false); void read(data) }} />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-14" icon={<Camera size={22} />} disabled={busy} onClick={() => setCamera(true)}>
              {busy ? 'Reading…' : image ? 'Scan another form' : 'Take a picture of the form'}
            </Button>
            <Button size="lg" variant="secondary" className="h-14" icon={<UploadSimple size={20} />} disabled={busy} onClick={() => input.current?.click()}>
              Upload a photo
            </Button>
            <a href="/forms/intake-form-blank.png" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 underline underline-offset-2">
              Blank intake form (print)
            </a>
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted">
            {online ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ok" /> : <WifiSlash size={18} className="mt-0.5 shrink-0 text-warn" />}
            {online ? 'The image goes only to the clinic server PC on your network. It is never sent to the internet.' : 'The clinic server cannot be reached. Keep photographing: each photo is saved on this computer and read once the server is back.'}
          </p>
          {!online && (
            <div className="mt-4 max-w-md">
              <Field label="Whose folder is it? (optional)" hint="Name or folder number. It helps match the right patient later.">
                <Input value={hint} onChange={(e) => setHint(e.target.value)} maxLength={200} className="h-12 text-base" />
              </Field>
            </div>
          )}
          {data.demo && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink-2">Try a synthetic sample form</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SAMPLES.map((s) => (
                  <Button key={s.file} variant="secondary" size="sm" disabled={busy} icon={<UploadSimple size={16} />} onClick={() => trySample(s.file)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
        {(local.length > 0 || queue.length > 0) && (
          <Card className="p-5">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CloudArrowUp size={22} className="text-brand-600" /> Photos waiting
            </p>
            {local.length > 0 && (
              <p className="mt-2 rounded-2xl bg-warn-soft px-4 py-3 text-base text-warn">
                {local.length} photo{local.length === 1 ? '' : 's'} saved on this computer.{' '}
                {online ? 'Sending to the clinic server now…' : 'They go to the clinic server by themselves when it can be reached.'}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {queue.map((p) => (
                <li key={p.event_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
                  <div className="text-base">
                    <b>{p.full_name || p.patient_hint || 'Folder photo'}</b>
                    <span className="block text-sm text-muted">
                      Taken {new Date(p.captured_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {p.status === 'queued' && ' · reading on the server…'}
                      {p.status === 'draft' && ' · ready for you to check'}
                      {p.status === 'failed' && ` · ${p.note}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {p.status === 'draft' && (
                      <Button size="sm" onClick={() => openQueued(p.event_id)}>
                        Check it
                      </Button>
                    )}
                    {p.status !== 'queued' && (
                      <Button size="sm" variant="secondary" icon={<Trash size={16} />} onClick={async () => { await discardPendingScan(p.event_id); void reload() }}>
                        Discard
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {error && (
          <Card className="border-warn bg-warn-soft p-5">
            <p className="flex items-start gap-2 text-base font-medium text-warn">
              <Warning size={22} className="mt-0.5 shrink-0" /> {error}
            </p>
          </Card>
        )}
        {image && (
          <Card className="p-3">
            <img src={image} alt="The scanned form" className="max-h-[70dvh] w-full rounded-xl bg-[#f4efe2] object-contain" />
          </Card>
        )}
      </div>

      <div>
        {busy && !reading && (
          <Card className="p-8">
            <p className="flex items-center gap-3 text-xl font-semibold">
              <Scan size={28} className="animate-pulse text-brand-600" /> Reading the form on this PC…
            </p>
            <p className="mt-2 text-base text-muted">Local OCR first, then the parser. This usually takes a few seconds and needs no internet.</p>
          </Card>
        )}
        {!busy && !reading && !error && (
          <Card className="p-8">
            <p className="flex items-center gap-3 text-xl font-semibold">
              <FolderOpen size={28} className="text-brand-600" /> Waiting for a form
            </p>
            <p className="mt-2 max-w-prose text-base text-ink-2">
              Print the blank intake form, copy the key facts from the paper folder in block letters, then photograph it here. The machine fills in the fields and highlights anything it is unsure about. Nothing reaches the patient record until you confirm.
            </p>
          </Card>
        )}
        {reading && (
          <div className="flex flex-col gap-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ok" icon={<Lightning size={14} />}>Read in {seconds(reading.ocr_ms + reading.parse_ms)}</Badge>
                <Badge tone="neutral" icon={<Cpu size={14} />}>{reading.ocr_engine}</Badge>
                <Badge tone={reading.llm.available ? 'ok' : 'neutral'}>{reading.parse_engine}</Badge>
                {flagged > 0 && <Badge tone="warn" icon={<Warning size={14} />}>{flagged} to check</Badge>}
              </div>
              {!reading.llm.available && <p className="mt-2 text-sm text-muted">Language model: {reading.llm.reason}</p>}
              {!reading.parse_engine.includes('image reader') && !fromQueue && (
                <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-prose text-sm text-ink-2">
                    {busy
                      ? 'Reading the handwriting on this PC. This takes about half a minute and needs no internet.'
                      : changed > 0
                        ? 'Handwriting can only be re-read before you correct anything, so your corrections are not lost.'
                        : reading.vision.available
                          ? `Hard to read? ${reading.vision.model} can look at the picture itself. It reads handwriting better, takes about 30 seconds, and every value it changes is marked for you to check.`
                          : `Handwriting reader: ${reading.vision.reason}`}
                  </p>
                  <Button variant="secondary" size="md" className="shrink-0" icon={<PencilLine size={18} />} disabled={busy || changed > 0 || !reading.vision.available} onClick={() => void readHandwriting()}>
                    {busy ? 'Reading…' : 'Read handwriting'}
                  </Button>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-lg font-semibold">Which patient is this folder for?</p>
              {chosen ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ok-soft p-4">
                  <p className="text-base">
                    <b>{chosenName}</b> <span className="text-ink-2">· {fmtDay(personOfPatient(patientId)?.birthdate ?? '')} · {chosen.patient_no}</span>
                    {reading.match?.patient_id === patientId && <span className="block text-sm text-ok">Matched by {reading.match.by}</span>}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => setPatientId('')}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="mt-3">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the patient by name or number" className="h-12 text-base" aria-label="Search patient" />
                  <ul className="mt-2 flex flex-col gap-2">
                    {[...reading.candidates.map((c) => ({ id: c.patient_id, name: c.full_name, sub: `Possible match · ${fmtDay(c.birthdate)}` })), ...hits.map((h) => ({ id: h.patient!.patient_id, name: h.person.full_name, sub: h.patient!.patient_no }))].map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setPatientId(c.id)} className="flex w-full items-center justify-between rounded-2xl bg-canvas px-4 py-3 text-left text-base hover:bg-mist">
                          <b>{c.name}</b>
                          <span className="text-sm text-muted">{c.sub}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!reading.match && <p className="mt-2 text-sm text-warn">No patient matched this name and birthdate. New patients are registered at Check in first.</p>}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-semibold">Verify what the machine read</p>
                <p className="text-sm text-muted">{changed} corrected so far</p>
              </div>
              {GROUPS.map((g) => {
                const fs = reading.fields.filter((f) => f.group === g.key)
                const added = Object.keys(values).filter((k) => EXTRA_KEYS[g.key] && k.startsWith(EXTRA_KEYS[g.key]) && !reading.fields.some((f) => f.key === k))
                if (!fs.length && !added.length && g.key !== 'identity' && !EXTRA_KEYS[g.key]) return null
                return (
                  <div key={g.key} className="mt-5">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted">{g.title}</p>
                    <div className="mt-2 flex flex-col gap-3">
                      {fs.length === 0 && added.length === 0 && <p className="text-sm text-muted">None read from the form.</p>}
                      {fs.map((f) => (
                        <FieldRow
                          key={f.key}
                          label={f.label}
                          field={f}
                          value={values[f.key] ?? ''}
                          suggest={suggestions[f.group]}
                          onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                          // Clearing a line the machine read is a correction, so it is kept and counted as one.
                          onRemove={EXTRA_KEYS[g.key] && values[f.key] ? () => setValues((s) => ({ ...s, [f.key]: '' })) : undefined}
                        />
                      ))}
                      {added.map((k, i) => (
                        <FieldRow
                          key={k}
                          label={`${g.one} ${fs.length + i + 1}, added by you`}
                          group={g.key}
                          value={values[k]}
                          suggest={suggestions[g.key]}
                          onChange={(v) => setValues((s) => ({ ...s, [k]: v }))}
                          onRemove={() =>
                            setValues((s) => {
                              const { [k]: _gone, ...rest } = s
                              return rest
                            })
                          }
                        />
                      ))}
                    </div>
                    {extraRow(g.key)}
                  </div>
                )
              })}
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                <Button size="lg" className="h-14" icon={<CheckCircle size={22} />} disabled={!patientId || busy} onClick={save}>
                  {busy ? 'Saving…' : 'I checked every field. Save to the record'}
                </Button>
                <Button size="lg" variant="secondary" onClick={discard}>
                  Discard
                </Button>
              </div>
              {!patientId && <p className="mt-2 text-sm text-warn">Choose the patient first.</p>}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

/* Typing a correction should be quicker than typing the whole thing: each field offers what it can. */
const SEXES = ['Female', 'Male']
const CIVIL = ['Single', 'Married', 'Widowed', 'Separated']
const HINTS: Record<string, { hint?: string; mode?: 'numeric' }> = {
  folder: { hint: 'The number on the paper folder.' },
  contact: { hint: 'Mobile as 09XX XXX XXXX, or +63 917 482 1093.', mode: 'numeric' },
  philhealth_pin: { hint: 'Twelve digits.', mode: 'numeric' },
}
const GROUP_HINTS: Record<string, { hint: string }> = {
  allergy: { hint: 'Substance - reaction - severity.' },
  family: { hint: 'Relative - condition.' },
  visit: { hint: 'Date - complaint.' },
}

function FieldRow({
  label,
  field,
  group,
  value,
  suggest,
  onChange,
  onRemove,
}: {
  label: string
  field?: ScanField
  group?: ScanField['group']
  value: string
  suggest?: string[]
  onChange: (v: string) => void
  onRemove?: () => void
}) {
  const key = field?.key ?? ''
  const kind = field?.group ?? group
  const flagged = field?.review
  // Flag a field only while it still holds exactly what the machine read: once corrected, it is settled.
  const unchecked = flagged && value === field?.value
  const listId = useId()
  const hint = HINTS[key] ?? (kind && kind !== 'identity' ? GROUP_HINTS[kind] : undefined)
  const box = cn('h-12 flex-1 text-base', unchecked && 'border-warn bg-warn-soft')
  const options = key === 'sex' ? SEXES : key === 'civil_status' ? CIVIL : null

  return (
    <Field label={label} hint={hint?.hint} className="w-full">
      <div className="flex items-center gap-3">
        {options ? (
          <Select value={options.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)} className={box}>
            <option value="">Not on the form</option>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        ) : key === 'birthdate' ? (
          <Input type="date" max={todayKey()} value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''} onChange={(e) => onChange(e.target.value)} className={box} />
        ) : (
          <>
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              invalid={unchecked}
              inputMode={HINTS[key]?.mode}
              list={suggest?.length ? listId : undefined}
              className={box}
            />
            {suggest?.length ? (
              <datalist id={listId}>
                {suggest.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            ) : null}
          </>
        )}
        {field && (
          <span className={cn('w-20 shrink-0 text-right text-sm tabular', tone(field.confidence, field.review))} title={field.raw ? `OCR read: ${field.raw}` : 'Not found on the form'}>
            {field.review ? 'Check · ' : ''}
            {field.confidence}%
          </span>
        )}
        {onRemove && (
          <IconButton label={`Remove ${label}`} onClick={onRemove} className="shrink-0 text-muted hover:text-danger">
            <Trash size={18} />
          </IconButton>
        )}
      </div>
      {field?.note && value === field.value && <p className="mt-1 text-sm text-brand-700">{field.note}</p>}
    </Field>
  )
}

/* ------------------------------------------------------------------ accuracy + speed dashboard */

const BASE_KEY = 'gilayon-manual-baseline-min'
function useBaseline(): [number, (n: number) => void] {
  const [v, setV] = useState(() => {
    try {
      const n = Number(localStorage.getItem(BASE_KEY))
      return n > 0 ? n : 4
    } catch {
      return 4 // storage can be blocked; the default stands
    }
  })
  return [
    v,
    (n) => {
      setV(n)
      try {
        localStorage.setItem(BASE_KEY, String(n))
      } catch {
        /* ignore */
      }
    },
  ]
}

function Accuracy() {
  const { fetchRecognitionMetrics, data } = useClinic()
  const [m, setM] = useState<RecognitionMetrics | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [baseline, setBaseline] = useBaseline()
  useEffect(() => {
    let live = true
    void fetchRecognitionMetrics().then((r) => {
      if (live) {
        setM(r)
        setLoaded(true)
      }
    })
    return () => {
      live = false
    }
  }, [fetchRecognitionMetrics, data.scans.length])

  if (!loaded) return <p className="text-base text-muted">Loading the numbers…</p>
  if (!m || m.scans === 0) {
    return (
      <Card className="max-w-2xl p-8">
        <p className="flex items-center gap-3 text-xl font-semibold">
          <Target size={28} className="text-brand-600" /> No confirmed scans yet
        </p>
        <p className="mt-2 text-base text-ink-2">Accuracy and speed are measured from real work: every time a nurse or doctor confirms a scanned form, the machine's reading is compared with what they confirmed. Scan and confirm a few forms and the numbers appear here.</p>
      </Card>
    )
  }
  const manual = baseline * 60
  const saved = Math.max(0, manual - m.total_ms / 1000)
  const worst = m.by_field.filter((f) => f.accuracy < 100).slice(0, 4)
  const kpis: [string, string, string, React.ReactNode][] = [
    ['Field accuracy', `${m.accuracy}%`, `${m.correct} of ${m.fields} fields right before correction`, <Target key="a" size={20} />],
    ['Time per folder', seconds(m.total_ms), `${seconds(m.machine_ms)} machine + ${seconds(m.review_ms)} your check`, <Timer key="t" size={20} />],
    ['Compared with typing', `${Math.round((saved / manual) * 100)}% faster`, `Assumes ${baseline} min to type a folder by hand`, <Lightning key="l" size={20} />],
    ['Perfect forms', `${m.perfect} of ${m.scans}`, 'Nothing needed correcting', <CheckCircle key="c" size={20} />],
  ]
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([k, v, s, icon]) => (
          <Card key={k} className="p-5">
            <p className="flex items-center gap-2 text-base text-ink-2">
              {icon} {k}
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular">{v}</p>
            <p className="mt-1 text-sm text-muted">{s}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-lg font-semibold">Accuracy of each scan</p>
          <p className="text-sm text-muted">Share of fields the machine read exactly as the nurse confirmed them.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={m.recent} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e3eaf6" vertical={false} />
                <XAxis dataKey="n" tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} label={{ value: 'Scan', position: 'insideBottom', offset: -2, fill: '#5f6f8a', fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'Accuracy']} />
                <Line type="monotone" dataKey="accuracy" stroke="#2350d6" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">Seconds per folder</p>
          <p className="text-sm text-muted">Machine reading plus the time you took to verify.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.recent} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e3eaf6" vertical={false} />
                <XAxis dataKey="n" tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5f6f8a', fontSize: 12 }} axisLine={false} tickLine={false} unit=" s" />
                <Tooltip cursor={{ fill: '#eef3fc' }} formatter={(v) => [`${v} s`, 'Time']} />
                <Bar dataKey="seconds" fill="#2350d6" radius={[6, 6, 6, 6]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">Accuracy by field</p>
          <ul className="mt-4 flex flex-col gap-3">
            {m.by_field.map((f) => (
              <li key={f.key} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-3 text-base">
                <span className="truncate" title={f.label}>{f.label}</span>
                <span className="h-3 rounded-full bg-mist">
                  <span className={cn('block h-3 rounded-full', f.accuracy >= 95 ? 'bg-ok' : f.accuracy >= 80 ? 'bg-brand-600' : 'bg-warn-soft0')} style={{ width: `${Math.max(2, f.accuracy)}%` }} />
                </span>
                <span className="text-right font-semibold tabular">{f.accuracy}%</span>
              </li>
            ))}
          </ul>
          {worst.length > 0 && <p className="mt-4 text-sm text-muted">Needs the most checking: {worst.map((w) => w.label.toLowerCase()).join(', ')}.</p>}
        </Card>
        <Card className="p-6">
          <p className="text-lg font-semibold">How this is measured</p>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base text-ink-2">
            <li>Accuracy: for each field, the machine's value is compared with the value you confirmed. A field you had to add counts as a miss.</li>
            <li>Speed: machine time is measured by the server; check time runs from when the fields appear until you press save.</li>
            <li>
              Engines used: {m.engines.join('; ') || 'none yet'}. {m.llm.available ? `Local model ${m.llm.model} is running.` : 'Local language model is off, so the rule reader did the parsing.'}
            </li>
            <li>Everything runs on the clinic server PC. No scan, text or number on this page leaves the building.</li>
          </ul>
          <div className="mt-5 max-w-xs">
            <Field label="Typing a folder by hand takes (minutes)" hint="Used only for the comparison above. Time a nurse once and enter it.">
              <Input type="number" min={1} max={30} step={0.5} value={baseline} onChange={(e) => setBaseline(Math.max(1, Number(e.target.value) || 4))} className="h-12 text-base" />
            </Field>
          </div>
          <p className="mt-3 text-sm text-muted">Fastest folder so far: {seconds(m.fastest_ms)} · {m.drafts} read but not yet confirmed.</p>
          <Link to="/clinic/audit" className="mt-2 inline-block text-sm font-medium text-brand-700 underline underline-offset-2">
            Every confirmation is in the audit trail
          </Link>
        </Card>
      </div>
    </div>
  )
}
