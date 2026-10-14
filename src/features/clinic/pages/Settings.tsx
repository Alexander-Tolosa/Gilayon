import { ArrowCounterClockwise, Eraser, FloppyDisk, LockKey } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field, Input, Modal, useToast } from '../../../shared/components/ui'
import { PageTitle } from '../ClinicShell'
import { LaneBadge, Signature } from '../components/ClinicComponents'
import { BackupCard } from '../components/BackupCard'
import { ChangePasswordForm, StaffManager } from '../components/StaffAdmin'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'

/** Doctor settings: priority lanes, staff, the signature and PIN used to sign, and the demo reset. */
export default function Settings() {
  const t = useT()
  const toast = useToast()
  const { data, me, updateCategoryRank, setSignatureImage, changePin, resetDemo } = useClinic()
  const [pin, setPin] = useState({ current: '', next: '' })
  const [reset, setReset] = useState(false)
  if (!me) return null

  return (
    <div>
      <PageTitle title={t('Settings')} sub="Doctor in charge: priority lanes, staff, and how you sign." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-lg font-semibold">{t('Priority lane')} ranks</p>
          <p className="text-[15px] text-muted">Lower rank is called first. Within the same rank, first come, first served. These are the team's suggestion; the clinic should confirm them.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {data.categories.map((c) => (
              <li key={c.category_id} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                <LaneBadge category={c.category_id} />
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((r) => (
                    <button key={r} onClick={() => updateCategoryRank(c.category_id, r)} aria-pressed={c.rank === r} className={`grid size-11 place-items-center rounded-xl text-lg font-semibold transition ${c.rank === r ? 'bg-brand-600 text-white' : 'bg-surface text-ink-2 ring-1 ring-line hover:ring-brand-300'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <p className="text-lg font-semibold">My signature</p>
          <p className="text-[15px] text-muted">Applied to documents you sign with your PIN, next to your license and PTR numbers.</p>
          <div className="mt-4 rounded-2xl bg-canvas p-4">
            <p className="text-sm text-muted">Current</p>
            <Signature staff={me} />
          </div>
          <SignaturePad
            onSave={(dataUrl) => {
              setSignatureImage(dataUrl)
              toast({ tone: 'ok', title: 'Signature saved', body: 'Logged in the audit trail.' })
            }}
          />
          <form
            className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!/^\d{4}$/.test(pin.next)) return toast({ tone: 'warn', title: 'The new PIN must be 4 digits' })
              if (!(await changePin(pin.current, pin.next))) return toast({ tone: 'warn', title: 'Current PIN is incorrect' })
              setPin({ current: '', next: '' })
              toast({ tone: 'ok', title: 'PIN changed' })
            }}
          >
            <Field label="Current PIN">
              <Input type="password" inputMode="numeric" maxLength={4} value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value })} className="h-12 text-base" />
            </Field>
            <Field label="New PIN">
              <Input type="password" inputMode="numeric" maxLength={4} value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value })} className="h-12 text-base" />
            </Field>
            <Button type="submit" size="lg" icon={<LockKey size={18} />}>
              Change PIN
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <p className="text-lg font-semibold">My password</p>
          <p className="mb-4 text-[15px] text-muted">Used to sign in. Your signing PIN above is separate.</p>
          <ChangePasswordForm />
        </Card>

        <StaffManager />

        <BackupCard />

        <Card className="p-6">
          <p className="text-lg font-semibold">Demo data</p>
          <p className="text-[15px] text-muted">Everything here is synthetic. Reset before each run-through to get a clean queue for today.</p>
          <Button variant="danger" size="lg" className="mt-4" icon={<ArrowCounterClockwise size={18} />} onClick={() => setReset(true)}>
            Reset demo data
          </Button>
        </Card>
      </div>
      <Modal
        open={reset}
        onClose={() => setReset(false)}
        title="Reset demo data?"
        subtitle="Replaces every record, queue ticket and document with a fresh synthetic seed for today."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReset(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo()
                setReset(false)
                toast({ tone: 'ok', title: 'Demo data reset' })
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-base text-ink-2">You will stay signed in.</p>
      </Modal>
    </div>
  )
}

function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#152a63'
  }, [])
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  return (
    <div className="mt-4">
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-2xl border-2 border-dashed border-line-strong bg-white"
        onPointerDown={(e) => {
          drawing.current = true
          const ctx = canvas.current!.getContext('2d')!
          const [x, y] = pos(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          canvas.current!.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvas.current!.getContext('2d')!
          const [x, y] = pos(e)
          ctx.lineTo(x, y)
          ctx.stroke()
          setEmpty(false)
        }}
        onPointerUp={() => (drawing.current = false)}
        aria-label="Draw your signature"
      />
      <div className="mt-2 flex gap-2">
        <Button
          variant="ghost"
          icon={<Eraser size={18} />}
          onClick={() => {
            const c = canvas.current!
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
            setEmpty(true)
          }}
        >
          Clear
        </Button>
        <Button variant="soft" icon={<FloppyDisk size={18} />} disabled={empty} onClick={() => onSave(canvas.current!.toDataURL('image/png'))}>
          Save signature
        </Button>
      </div>
    </div>
  )
}
