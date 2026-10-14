import { Camera, ChatText, Microphone, MicrophoneSlash, PhoneDisconnect, VideoCamera, VideoCameraSlash } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../../shared/lib/utils'
import { Avatar } from '../../../shared/components/ui'

/**
 * Telehealth video stage. The remote party is a still photo in this prototype;
 * the self-view uses the real camera when the viewer allows it.
 */
export function VideoCall({ remoteName, remotePhoto, selfName, selfPhoto, onEnd, onToggleChat, compact }: { remoteName: string; remotePhoto?: string; selfName: string; selfPhoto?: string; onEnd: () => void; onToggleChat?: () => void; compact?: boolean }) {
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(false)
  const [secs, setSecs] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => {
      clearInterval(t)
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  const toggleCam = async () => {
    if (cam) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
      setCam(false)
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = s
      setCam(true)
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = s
      })
    } catch {
      setCam(false)
    }
  }

  const f = (n: number) => String(n).padStart(2, '0')

  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-brand-950', compact ? 'aspect-[4/3]' : 'aspect-[4/3] sm:aspect-video')}>
      {remotePhoto ? <img src={remotePhoto} alt={remoteName} className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 grid place-items-center"><Avatar name={remoteName} size="xl" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/70 via-transparent to-brand-950/30" />

      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-950/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-[#ff6b6b]" /> <span className="tabular">{`${f(Math.floor(secs / 60))}:${f(secs % 60)}`}</span>
        </span>
        <span className="hidden rounded-full bg-brand-950/60 px-3 py-1 text-xs text-white backdrop-blur sm:inline">End-to-end encrypted</span>
      </div>
      <p className="absolute bottom-20 left-4 text-sm font-medium text-white drop-shadow sm:bottom-24">{remoteName}</p>

      <div className={cn('absolute right-4 top-4 overflow-hidden rounded-2xl bg-brand-900 ring-2 ring-white/30', compact ? 'h-20 w-28' : 'h-24 w-32 sm:h-32 sm:w-44')}>
        {cam ? (
          <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <Avatar name={selfName} src={selfPhoto} size="md" />
          </div>
        )}
        <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-white drop-shadow">You</span>
      </div>

      <div className="glass absolute inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-2 rounded-full p-1.5">
        <CallBtn label={mic ? 'Mute' : 'Unmute'} onClick={() => setMic(!mic)} active={!mic}>
          {mic ? <Microphone size={18} /> : <MicrophoneSlash size={18} />}
        </CallBtn>
        <CallBtn label={cam ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCam} active={!cam}>
          {cam ? <VideoCamera size={18} /> : <VideoCameraSlash size={18} />}
        </CallBtn>
        {onToggleChat && (
          <CallBtn label="Chat" onClick={onToggleChat}>
            <ChatText size={18} />
          </CallBtn>
        )}
        <CallBtn label="Take snapshot for chart" onClick={() => {}}>
          <Camera size={18} />
        </CallBtn>
        <button onClick={onEnd} aria-label="End call" className="inline-flex h-11 items-center gap-2 rounded-full bg-danger px-5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95">
          <PhoneDisconnect size={18} weight="fill" /> <span className="hidden sm:inline">End</span>
        </button>
      </div>
    </div>
  )
}

function CallBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn('grid size-11 place-items-center rounded-full transition active:scale-95', active ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:text-brand-700')}>
      {children}
    </button>
  )
}
