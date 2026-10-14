import { Buildings, Clock, VideoCamera } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { DOCTORS } from '../data/seed'
import type { Appointment } from '../data/types'
import { cn, dayOffset, fmtDate, fmtTime } from '../lib/utils'
import { useStore } from '../store/store'
import { Avatar, Button, Chip, Field, Modal, Select, Textarea, useToast } from './ui'

const SLOTS = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00']

/**
 * Shared booking flow.
 * Patients create a "requested" appointment; front desk books directly as "confirmed".
 */
export function BookingModal({ open, onClose, patientId, asStaff, defaultDoctorId }: { open: boolean; onClose: () => void; patientId?: string; asStaff?: boolean; defaultDoctorId?: string }) {
  const { appointments, patients, bookAppointment } = useStore()
  const toast = useToast()
  const [pid, setPid] = useState(patientId ?? patients[0]?.id)
  const [doctorId, setDoctorId] = useState(defaultDoctorId ?? 'd1')
  const [date, setDate] = useState(dayOffset(1))
  const [time, setTime] = useState('')
  const [mode, setMode] = useState<Appointment['mode']>('In-person')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const dates = useMemo(() => Array.from({ length: 10 }, (_, n) => dayOffset(n + (asStaff ? 0 : 1))), [asStaff])
  const doctor = DOCTORS.find((d) => d.id === doctorId)!
  const taken = new Set(appointments.filter((a) => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled').map((a) => a.time))
  const slots = SLOTS.filter((s) => s >= doctor.hours[0] && s < doctor.hours[1])

  const submit = () => {
    if (!time) return setError('Pick a time slot.')
    if (reason.trim().length < 3) return setError('Add a short reason for the visit.')
    bookAppointment({ patientId: pid!, doctorId, date, time, mode, reason: reason.trim(), status: asStaff ? 'confirmed' : 'requested', reminders: { sms: true, email: true } })
    toast({
      tone: 'ok',
      title: asStaff ? 'Appointment booked' : 'Request sent',
      body: asStaff ? `${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtTime(time)} with ${doctor.name}. Reminders scheduled.` : 'The front desk will confirm shortly. You will get a text and email.',
    })
    setTime('')
    setReason('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={asStaff ? 'Book an appointment' : 'Book a visit'}
      subtitle={asStaff ? 'Booked directly as confirmed' : 'Choose a doctor, a day and a time that works for you'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{asStaff ? 'Book appointment' : 'Request appointment'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {asStaff && !patientId && (
          <Field label="Patient" htmlFor="bk-p">
            <Select id="bk-p" value={pid} onChange={(e) => setPid(e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.id}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Doctor">
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {DOCTORS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDoctorId(d.id)
                  setTime('')
                }}
                className={cn('flex w-40 shrink-0 flex-col items-center rounded-2xl border p-3 text-center transition', doctorId === d.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line hover:border-brand-200')}
              >
                <Avatar name={d.name} src={d.photo} size="lg" />
                <span className="mt-2 w-full truncate text-[13px] font-semibold">{d.name}</span>
                <span className="w-full truncate text-xs text-muted">{d.specialty}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Day">
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDate(d)
                  setTime('')
                }}
                className={cn('flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition', date === d ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-200')}
              >
                <span className={cn('text-[11px]', date === d ? 'text-brand-100' : 'text-muted')}>{fmtDate(d, { weekday: 'short' })}</span>
                <span className="text-lg font-semibold tabular">{fmtDate(d, { day: 'numeric' })}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Available times with ${doctor.name}`}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {slots.map((s) => {
              const busy = taken.has(s)
              return (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => setTime(s)}
                  className={cn(
                    'h-10 rounded-full border text-[13px] font-medium tabular transition',
                    busy ? 'border-line bg-canvas text-faint line-through' : time === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong text-ink-2 hover:border-brand-300',
                  )}
                >
                  {fmtTime(s)}
                </button>
              )
            })}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
          <Field label="Visit type">
            <div className="flex gap-2">
              <Chip selected={mode === 'In-person'} onClick={() => setMode('In-person')}>
                <Buildings size={14} /> In clinic
              </Chip>
              <Chip selected={mode === 'Telehealth'} onClick={() => setMode('Telehealth')}>
                <VideoCamera size={14} /> Video
              </Chip>
            </div>
          </Field>
          <Field label="Reason for visit" htmlFor="bk-r" error={error || undefined}>
            <Textarea id="bk-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Follow-up on blood test results" className="min-h-20" />
          </Field>
        </div>
        {time && (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <Clock size={16} weight="fill" /> {fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} at {fmtTime(time)} · {mode === 'Telehealth' ? 'Video visit' : doctor.room}
          </p>
        )}
      </div>
    </Modal>
  )
}
