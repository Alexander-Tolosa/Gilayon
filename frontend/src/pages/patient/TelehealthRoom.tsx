import { ArrowLeft, Info } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChatThread } from '../../components/ChatThread'
import { VideoCall } from '../../components/VideoCall'
import { Button, Card, EmptyState, useToast } from '../../components/ui'
import { fmtTime } from '../../lib/utils'
import { useDoctor, useStore } from '../../store/store'
import { useSelf } from './shared'

export default function TelehealthRoom() {
  const { id } = useParams()
  const { appointments } = useStore()
  const me = useSelf()
  const appt = appointments.find((a) => a.id === id)
  const doc = useDoctor(appt?.doctorId)
  const navigate = useNavigate()
  const toast = useToast()
  const [chat, setChat] = useState(true)

  if (!appt || !doc) {
    return (
      <Card>
        <EmptyState icon={<Info size={26} />} title="Visit not found" body="This video link has expired or is not yours." action={<Button to="/patient/appointments">My appointments</Button>} />
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} to="/patient/appointments">
          Leave room
        </Button>
        <p className="text-sm text-muted">
          {appt.reason} · {fmtTime(appt.time)}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <div>
          <VideoCall
            remoteName={doc.name}
            remotePhoto={doc.photo.replace('w=240&h=240', 'w=1400&h=900')}
            selfName={me.name}
            selfPhoto={me.photo}
            onToggleChat={() => setChat((c) => !c)}
            onEnd={() => {
              toast({ tone: 'ok', title: 'Visit ended', body: 'Your visit summary will appear in your health record.' })
              navigate('/patient')
            }}
          />
          <Card className="mt-5 p-5">
            <p className="text-sm font-semibold">Before you start</p>
            <ul className="mt-2 grid grid-cols-1 gap-2 text-[13px] text-muted sm:grid-cols-3">
              <li>Find a quiet, private space.</li>
              <li>Have your medicines and glucose log nearby.</li>
              <li>{doc.name} can see your record during the call.</li>
            </ul>
          </Card>
        </div>
        {chat && (
          <Card className="flex h-[560px] flex-col overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <p className="text-sm font-semibold">In-call chat</p>
              <p className="text-xs text-muted">Saved to your record</p>
            </div>
            <ChatThread patientId={me.id} viewer="patient" authorName={me.name} className="flex-1" />
          </Card>
        )}
      </div>
    </div>
  )
}
