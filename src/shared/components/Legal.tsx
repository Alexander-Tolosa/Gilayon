import { ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { Modal } from './ui'
import { cn } from '../lib/utils'

export type LegalKind = 'privacy' | 'disclaimer'

/** Shown wherever the app is introduced. Gilayon follows the Act's principles but does not claim certification. */
export function PrivacyNotice() {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
      <p>
        Gilayon handles personal and sensitive personal information under the <strong className="text-ink">Data Privacy Act of 2012 (Republic Act No. 10173)</strong> and its Implementing Rules and Regulations.
      </p>
      <ul className="space-y-2.5">
        {[
          ['What is collected', "Name, birthdate, sex, employee or dependent details, contact numbers, allergies, consultation notes, prescriptions, certificates, lab results and scanned pages of old folders."],
          ['Why', 'Only to give care at the HMO-Clinic, issue medical documents, run the queue and prepare the clinic census.'],
          ['Who can see it', 'Clinic staff by role. Consultation notes and signing are for doctors only. Every view and change is written to an audit trail that cannot be deleted.'],
          ['Where it is kept', "On the clinic's own server inside the office, with encrypted connections and encrypted backups. Records are not kept in the browser after sign-out."],
          ['Your rights', 'You may ask to be informed, to access your record, to correct it, and to object or file a complaint with the National Privacy Commission. Ask at the front desk or through the clinic\'s data protection officer.'],
        ].map(([h, b]) => (
          <li key={h} className="rounded-2xl bg-canvas px-4 py-3">
            <p className="font-semibold text-ink">{h}</p>
            <p className="mt-0.5">{b}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Gilayon is designed on the Act's principles: access by role, an audit log, backups, and data staying on the clinic's server. It does not claim certification. The clinic's data protection officer should review it before real patient data is used.</p>
    </div>
  )
}

export function Disclaimer() {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">
      <p>Gilayon is a prototype built by Team KasCoders for the Iloilo Provincial Government 2026 Startup Hackathon Challenge (HMO-Clinic).</p>
      <p>
        <strong className="text-ink">This demo uses synthetic patient data only.</strong> Names, records and photos are made up. Do not enter real patient information until the clinic has reviewed and approved the system.
      </p>
      <p>Gilayon records and organizes the clinic's work. It does not give medical advice or replace a doctor's judgment, and documents are valid only when signed by a licensed physician.</p>
    </div>
  )
}

const TITLES: Record<LegalKind, { title: string; icon: ReactNode }> = {
  privacy: { title: 'Data Privacy Act notice', icon: <ShieldCheck size={22} weight="fill" className="text-brand-600" /> },
  disclaimer: { title: 'Disclaimer', icon: <WarningCircle size={22} weight="fill" className="text-warn" /> },
}

/** Text links that open the notice or the disclaimer in a modal. */
export function LegalLinks({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const [open, setOpen] = useState<LegalKind | null>(null)
  const link = cn('whitespace-nowrap underline-offset-4 transition hover:underline', linkClassName)
  return (
    <>
      <span className={cn('inline-flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
        <button type="button" className={link} onClick={() => setOpen('privacy')}>
          Data Privacy Act notice
        </button>
        <button type="button" className={link} onClick={() => setOpen('disclaimer')}>
          Disclaimer
        </button>
      </span>
      <LegalModal kind={open} onClose={() => setOpen(null)} />
    </>
  )
}

export function LegalModal({ kind, onClose }: { kind: LegalKind | null; onClose: () => void }) {
  const shown = kind ?? 'privacy'
  return (
    <Modal
      open={kind !== null}
      onClose={onClose}
      wide={shown === 'privacy'}
      title={
        <span className="flex items-center gap-2">
          {TITLES[shown].icon} {TITLES[shown].title}
        </span>
      }
    >
      {shown === 'privacy' ? <PrivacyNotice /> : <Disclaimer />}
    </Modal>
  )
}
