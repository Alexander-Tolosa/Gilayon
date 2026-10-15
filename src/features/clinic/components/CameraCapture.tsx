import { Camera, FlipHorizontal, VideoCamera, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Modal, Select, useToast } from '../../../shared/components/ui'

/*
  Takes the picture of a paper form with a camera attached to this computer (a clinic webcam, or the
  camera on a tablet). The browser only allows this on a secure page, which is why the clinic installs
  its own certificate; on a plain http page the button explains that instead of failing silently.

  The picture is handed back as a JPEG data URL and goes straight to the clinic server, exactly like an
  uploaded file. Nothing is recorded and nothing leaves the PC.
*/

const WANT_WIDTH = 2560 // ask for the most the camera has; the reader wants small print to be legible
const MIRROR_KEY = 'gilayon-camera-mirror'

/*
  Some cameras, and some laptop drivers, hand over a mirrored picture: writing on the page comes out
  backwards, which the reader cannot make sense of. There is no way to ask the camera which it is doing,
  so the person is given a switch. It turns the preview and the saved picture together, so what they
  line up is what gets read, and the choice is remembered on this computer.
*/
const savedMirror = () => {
  try {
    return localStorage.getItem(MIRROR_KEY) === '1'
  } catch {
    return false // storage can be blocked; not mirroring is the usual case
  }
}

export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const toast = useToast()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [error, setError] = useState('')
  // Worked out during render, not stored: a browser without camera support never changes its mind.
  const unsupported = typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia
  const blocked = unsupported
    ? typeof window !== 'undefined' && !window.isSecureContext
      ? 'A camera only works on a secure page. Open the clinic address (https) rather than a plain http one, or use "Upload a photo" instead.'
      : 'This browser cannot open a camera. Use "Upload a photo" instead.'
    : error
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState('')
  const [mirror, setMirror] = useState(savedMirror)

  const toggleMirror = () => {
    const next = !mirror
    setMirror(next)
    try {
      localStorage.setItem(MIRROR_KEY, next ? '1' : '0')
    } catch {
      /* the switch still works for this session */
    }
  }

  /** Releases the camera. Pure, so the effect below can call it without starting another render. */
  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const start = useCallback(
    async (id?: string) => {
      stop()
      if (!navigator.mediaDevices?.getUserMedia) return // the message for this is worked out during render
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: id ? { deviceId: { exact: id }, width: { ideal: WANT_WIDTH }, height: { ideal: 1440 } } : { facingMode: { ideal: 'environment' }, width: { ideal: WANT_WIDTH }, height: { ideal: 1440 } },
          audio: false,
        })
        setError('')
        stream.current = s
        if (video.current) {
          video.current.srcObject = s
          await video.current.play().catch(() => undefined)
        }
        const track = s.getVideoTracks()[0]
        const st = track.getSettings()
        setSize(`${st.width ?? 0} x ${st.height ?? 0}`)
        setReady(true)
        // Device labels are only given out once permission has been granted, so the list is read after.
        const all = await navigator.mediaDevices.enumerateDevices()
        setDevices(all.filter((d) => d.kind === 'videoinput'))
        setDeviceId(st.deviceId ?? id ?? '')
      } catch (e) {
        const name = e instanceof DOMException ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'The browser blocked the camera. Allow camera access for this site, then try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this computer.'
              : name === 'NotReadableError'
                ? 'The camera is in use by another program. Close that program and try again.'
                : 'The camera could not be opened.',
        )
      }
    },
    [stop],
  )

  useEffect(() => {
    if (open) void start()
    else stop()
    return stop
  }, [open, start, stop])

  const close = () => {
    stop()
    setReady(false)
    onClose()
  }

  const take = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (mirror) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0)
    // 0.92 keeps the small print sharp; the reader works from this image, not a thumbnail.
    const data = canvas.toDataURL('image/jpeg', 0.92)
    if (data.length < 5000) {
      toast({ tone: 'warn', title: 'The picture came out empty', body: 'Give the camera a moment to focus, then try again.' })
      return
    }
    stop()
    setReady(false)
    onCapture(data)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Take a picture of the form"
      subtitle="Fill the frame with the page, keep it flat, and avoid a shadow across the middle."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">{ready ? `Camera at ${size}` : ''}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" icon={<X size={18} />} onClick={close}>
              Cancel
            </Button>
            <Button size="lg" className="h-14" icon={<Camera size={22} />} disabled={!ready} onClick={take}>
              Take the picture
            </Button>
          </div>
        </div>
      }
    >
      {blocked ? (
        <div className="rounded-2xl bg-warn-soft p-5 text-base text-warn">{blocked}</div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-brand-950">
            {/* A4 is taller than it is wide: the guide shows where the page should sit. */}
            <video ref={video} playsInline muted style={mirror ? { transform: 'scaleX(-1)' } : undefined} className="mx-auto block max-h-[60dvh] w-full object-contain" />
            <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/50" />
            {!ready && (
              <p className="absolute inset-0 grid place-items-center text-base text-white">
                <VideoCamera size={28} className="animate-pulse" />
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" icon={<FlipHorizontal size={18} />} onClick={toggleMirror}>
              {mirror ? 'Stop flipping' : 'Flip left to right'}
            </Button>
            <span className="text-sm text-muted">Use this if the writing on the page comes out backwards.</span>
          </div>
          {devices.length > 1 && (
            <Select value={deviceId} onChange={(e) => void start(e.target.value)} className="mt-4 h-12 text-base" aria-label="Which camera">
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </Select>
          )}
        </>
      )}
    </Modal>
  )
}
