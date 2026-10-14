import { ArrowLeft, Printer } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../../shared/components/ui'
import { Letterhead, SignatureBlock } from '../components/ClinicComponents'
import { both, fil } from '../lib/i18n'
import { ageOf, fmtDay, fmtMinutes, fmtStampOf, fmtTimeOf, ticketLabel, todayKey } from '../lib/helpers'
import { useClinic } from '../store/store'
import { useDailyReport } from './DailyReport'

/** Print views on the clinic letterhead. "Save as PDF" in the browser's print dialog produces the PDF. */
export default function PrintPage() {
  const { kind = '', id = '' } = useParams()
  return (
    <div className="min-h-[100dvh] bg-mist py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => (history.length > 1 ? history.back() : window.close())}>
          Back
        </Button>
        <p className="hidden text-sm text-muted sm:block">Choose “Save as PDF” in the print dialog for a PDF copy.</p>
        <Button size="lg" icon={<Printer size={20} />} onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>
      {kind === 'rx' && <RxPrint id={id} />}
      {kind === 'mc' && <CertificatePrint id={id} />}
      {kind === 'summary' && <SummaryPrint id={id} />}
      {kind === 'ticket' && <TicketPrint id={id} />}
      {kind === 'report' && <ReportPrint day={id} />}
    </div>
  )
}

const Missing = () => <p className="text-center text-lg text-ink-2">This document was not found on this computer.</p>

function PatientLine({ patientId, date }: { patientId: string; date: string }) {
  const { personOfPatient, patient, employeeOfPerson, principalOf } = useClinic()
  const p = personOfPatient(patientId)!
  const pt = patient(patientId)!
  const emp = employeeOfPerson(p.person_id)
  const principal = principalOf(patientId)
  return (
    <table className="mt-5 w-full text-[10.5pt]">
      <tbody>
        <tr>
          <td className="w-[18%] py-0.5 text-black/60">Patient</td>
          <td className="py-0.5 font-bold">{p.full_name}</td>
          <td className="w-[12%] py-0.5 text-black/60">Date</td>
          <td className="py-0.5">{fmtDay(date)}</td>
        </tr>
        <tr>
          <td className="py-0.5 text-black/60">Age / Sex</td>
          <td className="py-0.5">
            {ageOf(p.birthdate)} / {p.sex}
          </td>
          <td className="py-0.5 text-black/60">Patient no.</td>
          <td className="py-0.5">{pt.patient_no}</td>
        </tr>
        <tr>
          <td className="py-0.5 text-black/60">{emp ? 'Office' : 'Dependent of'}</td>
          <td className="py-0.5" colSpan={3}>
            {emp ? `${emp.office} (${emp.employee_no})` : principal ? `${principal.type} of an IPG employee` : '—'}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

const footer = (no?: string) => (
  <div className="flex justify-between">
    <span>{no ? `Document no. ${no}. Verify with the HMO-Clinic.` : 'Draft, not valid without a signature and document number.'}</span>
    <span>Himsog · synthetic demo data</span>
  </div>
)

function RxPrint({ id }: { id: string }) {
  const { data, staffById, data: d } = useClinic()
  const rx = data.prescriptions.find((r) => r.prescription_id === id)
  if (!rx) return <Missing />
  const doc = staffById(rx.doctor_id)!
  const consult = d.consultations.find((c) => c.consultation_id === rx.consultation_id)
  const allergies = d.allergies.filter((a) => a.patient_id === rx.patient_id)
  return (
    <Letterhead watermark={rx.status === 'voided' ? 'Void' : rx.status === 'draft' ? 'Not signed' : undefined} footer={footer(rx.document_no)}>
      <p className="mt-5 text-center text-[13pt] font-bold uppercase tracking-[0.2em]">Prescription</p>
      <PatientLine patientId={rx.patient_id} date={consult?.consult_date ?? todayKey()} />
      {allergies.length > 0 && <p className="mt-2 text-[10pt] font-bold text-red-700">Allergies: {allergies.map((a) => a.substance).join(', ')}</p>}
      <p className="mt-5 font-serif text-[30pt] leading-none">℞</p>
      <ol className="mt-2 flex flex-col gap-3 pl-6">
        {rx.items.map((i, n) => (
          <li key={i.item_id} className="list-decimal">
            <p className="font-bold">
              {i.drug_name} {i.dose} <span className="font-normal">#{i.quantity}</span>
            </p>
            <p>Sig: {i.frequency}</p>
            {n < rx.items.length - 1 && <span />}
          </li>
        ))}
      </ol>
      {rx.status === 'voided' && <p className="mt-4 rounded border border-red-700 px-3 py-2 font-bold text-red-700">VOIDED: {rx.void_reason}</p>}
      <SignatureBlock staff={doc} signed={rx.status !== 'draft'} documentNo={rx.document_no} issuedAt={rx.issued_at} />
    </Letterhead>
  )
}

function CertificatePrint({ id }: { id: string }) {
  const { data, staffById, personOfPatient, employeeOfPerson, principalOf } = useClinic()
  const doc = data.documents.find((x) => x.document_id === id)
  if (!doc) return <Missing />
  const staff = staffById(doc.doctor_id)!
  const p = personOfPatient(doc.patient_id)!
  const emp = employeeOfPerson(p.person_id)
  const principal = principalOf(doc.patient_id)
  const consult = data.consultations.find((c) => c.consultation_id === doc.consultation_id)
  const dx = consult ? data.diagnoses.filter((d) => d.consultation_id === consult.consultation_id) : []
  const date = consult?.consult_date ?? todayKey()
  const [y, m, dd] = date.split('-').map(Number)
  const start = new Date(y, m - 1, dd)
  const end = new Date(start.getTime() + Math.max(0, (doc.rest_days ?? 1) - 1) * 86_400_000)
  return (
    <Letterhead watermark={doc.status === 'voided' ? 'Void' : doc.status === 'draft' ? 'Not signed' : undefined} footer={footer(doc.document_no)}>
      <p className="mt-6 text-center text-[14pt] font-bold uppercase tracking-[0.2em]">Medical Certificate</p>
      <p className="mt-2 text-right">{fmtDay(date)}</p>
      <p className="mt-6 leading-relaxed">To whom it may concern:</p>
      <p className="mt-3 text-justify leading-relaxed">
        This is to certify that <b>{p.full_name}</b>, {ageOf(p.birthdate)} years old, {p.sex.toLowerCase()},{' '}
        {emp ? (
          <>
            {emp.position} of the {emp.office},
          </>
        ) : (
          <>{principal ? `${principal.type.toLowerCase()} of an employee of the Iloilo Provincial Government,` : ''}</>
        )}{' '}
        was seen and examined at the HMO-Clinic on {fmtDay(date)}.
      </p>
      <p className="mt-4">
        <b>Findings:</b> {doc.findings}
      </p>
      {dx.length > 0 && (
        <p className="mt-1">
          <b>Diagnosis:</b> {dx.map((d) => `${d.description} (${d.icd10_code})`).join('; ')}
        </p>
      )}
      {doc.rest_days ? (
        <p className="mt-1">
          <b>Recommendation:</b> Rest for {doc.rest_days} day{doc.rest_days > 1 ? 's' : ''}, from {fmtDay(todayKey(start))} to {fmtDay(todayKey(end))}.
        </p>
      ) : (
        <p className="mt-1">
          <b>Recommendation:</b> Fit to resume work.
        </p>
      )}
      {doc.remarks && (
        <p className="mt-1">
          <b>Remarks:</b> {doc.remarks}
        </p>
      )}
      <p className="mt-4">This certificate is issued upon the request of the patient for: {doc.purpose.toLowerCase()}.</p>
      {doc.status === 'voided' && <p className="mt-4 rounded border border-red-700 px-3 py-2 font-bold text-red-700">VOIDED: {doc.void_reason}</p>}
      <SignatureBlock staff={staff} signed={doc.status !== 'draft'} documentNo={doc.document_no} issuedAt={doc.issued_at} />
    </Letterhead>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <p className="border-b border-black/30 pb-1 text-[10pt] font-bold uppercase tracking-wide">{both(title)}</p>
      <div className="mt-2">{children}</div>
    </section>
  )
}

/** Patient summary printout, so patients do not need an app. */
function SummaryPrint({ id }: { id: string }) {
  const { data, patient, personOfPatient, staffById } = useClinic()
  // Read once, so a printout does not change its timestamp on every re-render.
  const [printedAt] = useState(() => Date.now())
  const pt = patient(id)
  const p = personOfPatient(id)
  if (!pt || !p) return <Missing />
  const consults = data.consultations.filter((c) => c.patient_id === id).sort((a, b) => b.created_at - a.created_at).slice(0, 5)
  const recentRx = data.prescriptions.filter((r) => r.patient_id === id && r.status === 'signed' && (r.issued_at ?? 0) > printedAt - 90 * 86_400_000)
  const allergies = data.allergies.filter((a) => a.patient_id === id)
  const fh = data.familyHistory.filter((h) => h.patient_id === id)
  const labs = data.labs.filter((l) => l.patient_id === id && l.status === 'resulted').slice(-4)
  return (
    <Letterhead footer={<div className="flex justify-between"><span>Printed {fmtStampOf(printedAt)}. Bring this sheet to your next visit.</span><span>Himsog · synthetic demo data</span></div>}>
      <p className="mt-5 text-center text-[13pt] font-bold uppercase tracking-[0.15em]">Patient summary · {fil('Buod')}</p>
      <PatientLine patientId={id} date={todayKey()} />
      <Section title="Allergies">{allergies.length ? allergies.map((a) => `${a.substance} (${a.reaction}, ${a.severity.toLowerCase()})`).join('; ') : 'None known.'}</Section>
      <Section title="Medicines">
        {recentRx.length ? (
          <ul className="list-disc pl-5">
            {recentRx.flatMap((r) => r.items).map((i) => (
              <li key={i.item_id}>
                {i.drug_name} {i.dose}: {i.frequency}
              </li>
            ))}
          </ul>
        ) : (
          'No prescriptions in the last 90 days.'
        )}
      </Section>
      <Section title="Consultations">
        <table className="w-full text-[10pt]">
          <tbody>
            {consults.map((c) => (
              <tr key={c.consultation_id} className="align-top">
                <td className="w-[22%] py-1">{fmtDay(c.consult_date)}</td>
                <td className="py-1">
                  {c.chief_complaint}. {data.diagnoses.filter((d) => d.consultation_id === c.consultation_id).map((d) => d.description).join(', ')}
                </td>
                <td className="w-[25%] py-1 text-right">{staffById(c.doctor_id)?.name}</td>
              </tr>
            ))}
            {!consults.length && (
              <tr>
                <td>No digital consultations yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      {labs.length > 0 && (
        <Section title="Lab results">
          <ul className="list-disc pl-5">
            {labs.map((l) => (
              <li key={l.lab_id}>
                {l.test_name}: {l.result}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {fh.length > 0 && <Section title="Family history">{fh.map((h) => `${h.relative}: ${h.condition}`).join('; ')}</Section>}
    </Letterhead>
  )
}

function TicketPrint({ id }: { id: string }) {
  const { data } = useClinic()
  const t = data.tickets.find((x) => x.ticket_id === id)
  if (!t) return <Missing />
  const lane = { urgent: 'Urgent', pregnant: 'Pregnant', pwd: 'PWD', senior: 'Senior', regular: 'Regular' }[t.category_id]
  return (
    <div className="print-page mx-auto w-[80mm] bg-white p-5 text-center text-black shadow-lift print:shadow-none">
      <p className="text-[11pt] font-bold uppercase">HMO-Clinic</p>
      <p className="text-[8pt]">Province of Iloilo</p>
      <p className="mt-4 text-[9pt] uppercase tracking-widest">{both('Queue number')}</p>
      <p className="text-[44pt] font-bold leading-none tabular">{ticketLabel(t)}</p>
      <p className="mt-2 text-[10pt] font-bold">
        {both(lane)} · {both(t.service_type)}
      </p>
      <p className="mt-1 text-[9pt]">
        {fmtDay(t.day)} · {fmtTimeOf(t.checked_in_at)}
      </p>
      <p className="mt-4 text-[9pt]">Please wait for your number to be called.</p>
      <p className="text-[9pt] italic">{fil('Please wait for your number to be called.')}</p>
    </div>
  )
}

function ReportPrint({ day }: { day: string }) {
  const r = useDailyReport(day)
  const [generatedAt] = useState(() => Date.now())
  return (
    <Letterhead footer={<div className="flex justify-between"><span>Generated {fmtStampOf(generatedAt)} from the clinic records.</span><span>Himsog · synthetic demo data</span></div>}>
      <p className="mt-5 text-center text-[13pt] font-bold uppercase tracking-[0.15em]">Daily report · {fmtDay(day)}</p>
      <table className="mt-5 w-full border-collapse text-[10.5pt]">
        <tbody>
          {[
            ['Visits (checked in)', r.visits],
            ['Seen by a doctor', r.seen],
            ['New patients / returning', `${r.newPatients} / ${r.returning}`],
            ['Left without being seen', r.left],
            ['Average waiting time (check-in to called)', fmtMinutes(r.avgWait)],
            ['Longest wait', fmtMinutes(r.maxWait)],
            ['Prescriptions issued', r.rxIssued],
            ['Medical certificates issued', r.mcIssued],
            ['Documents voided', r.voided],
            ...r.census.map((c) => [`Census, ${c.period === 'Day' ? 'this day' : c.period === 'Week' ? 'this week so far' : c.period === 'Month' ? 'this month so far' : 'this year so far'} (patients / visits)`, `${c.patients} / ${c.visits}`] as [string, string]),
          ].map(([k, v]) => (
            <tr key={String(k)} className="border-b border-black/15">
              <td className="py-1.5">{k}</td>
              <td className="py-1.5 text-right font-bold tabular">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 grid grid-cols-2 gap-6">
        <Section title="Priority lane">
          {r.byLane.map((l) => (
            <p key={l.lane} className="flex justify-between">
              <span className="capitalize">{l.lane}</span>
              <b>{l.count}</b>
            </p>
          ))}
        </Section>
        <Section title="Service">
          {r.byService.map((s) => (
            <p key={s.service} className="flex justify-between">
              <span>{s.service}</span>
              <b>{s.count}</b>
            </p>
          ))}
        </Section>
        <Section title="Common complaints">
          {r.complaints.map(([c, n]) => (
            <p key={c} className="flex justify-between gap-3">
              <span>{c}</span>
              <b>{n}</b>
            </p>
          ))}
        </Section>
        <Section title="Seen by doctor">
          {r.byDoctor.map((d) => (
            <p key={d.name} className="flex justify-between">
              <span>{d.name}</span>
              <b>{d.count}</b>
            </p>
          ))}
        </Section>
      </div>
      <p className="mt-10 w-72 border-t border-black pt-1 text-center text-[9pt]">Reviewed by the doctor in charge</p>
    </Letterhead>
  )
}
