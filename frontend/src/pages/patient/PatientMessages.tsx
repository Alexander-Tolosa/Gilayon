import { Clock, Phone, ShieldCheck } from '@phosphor-icons/react'
import { ChatThread } from '../../components/ChatThread'
import { Avatar, Card, PageHeader } from '../../components/ui'
import { STAFF } from '../../data/seed'
import { fmtTime } from '../../lib/utils'
import { useDoctor } from '../../store/store'
import { useSelf } from './shared'

export default function PatientMessages() {
  const me = useSelf()
  const doc = useDoctor(me.doctorId)
  return (
    <div>
      <PageHeader title="Messages" subtitle="Talk to your care team securely" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="flex h-[calc(100dvh-280px)] min-h-[480px] flex-col overflow-hidden lg:h-[calc(100dvh-220px)]">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <div className="flex -space-x-2">
              <Avatar name={doc?.name ?? ''} src={doc?.photo} size="sm" />
              <Avatar name={STAFF[0].name} src={STAFF[0].photo} size="sm" />
            </div>
            <div>
              <p className="text-sm font-semibold">Care team</p>
              <p className="text-xs text-muted">{doc?.name} and the front desk</p>
            </div>
          </div>
          <ChatThread patientId={me.id} viewer="patient" authorName={me.name} className="flex-1" autoReply />
        </Card>
        <div className="hidden flex-col gap-4 lg:flex">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Clock size={18} className="text-brand-600" /> Replies within 1 business day
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Messages are read by {doc?.name ?? 'your doctor'} and the front desk between {doc ? fmtTime(doc.hours[0]) : '9 AM'} and {doc ? fmtTime(doc.hours[1]) : '5 PM'}.
            </p>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <Phone size={18} weight="fill" /> Emergency?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Do not use messages for emergencies. Call 911 or go to the nearest emergency room.</p>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={18} className="text-brand-600" /> Private
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Only your care team can read this thread. It becomes part of your health record.</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
