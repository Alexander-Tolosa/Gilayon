import { FloppyDisk, ImageSquare, Trash } from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Button, Card, Field, Input, useToast } from '../../../shared/components/ui'
import type { ClinicProfile } from '../api-types'
import { compressImage } from '../lib/helpers'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'

const FIELDS: { key: Exclude<keyof ClinicProfile, 'logo'>; label: string; hint?: string; optional?: boolean }[] = [
  { key: 'header', label: 'Line above the name', hint: 'For example: Republic of the Philippines · Province of Iloilo', optional: true },
  { key: 'name', label: 'Clinic name' },
  { key: 'office', label: 'Office', optional: true },
  { key: 'address', label: 'Address', optional: true },
  { key: 'contact', label: 'Phone or email', optional: true },
  { key: 'license_no', label: 'Clinic license or accreditation no.', hint: 'DOH or PhilHealth number, printed under the address.', optional: true },
]

/** Doctor in charge sets the clinic's own letterhead, printed on prescriptions, certificates, summaries and reports. */
export function ClinicProfileCard() {
  const { data, setClinicProfile, online } = useClinic()
  const toast = useToast()
  const t = useT()
  // Edits start from what the server has; until the first keystroke the form follows live updates.
  const [draft, setDraft] = useState<ClinicProfile | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const value = draft ?? data.clinic
  const set = (patch: Partial<ClinicProfile>) => setDraft({ ...value, ...patch })

  const pickLogo = async (file?: File) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError(t('Choose a PNG, JPG or WebP image.'))
    try {
      set({ logo: await compressImage(file, 320, 0.85) })
      setError('')
    } catch {
      setError(t('That image could not be read.'))
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!value.name.trim()) return setError(t('The clinic name is required.'))
    setBusy(true)
    const problem = await setClinicProfile(value)
    setBusy(false)
    if (problem) return setError(problem)
    setDraft(null)
    setError('')
    toast({ tone: 'ok', title: t('Letterhead saved'), body: t('New prints use it. Logged in the audit trail.') })
  }

  return (
    <Card className="p-6">
      <p className="text-lg font-semibold">{t('Clinic letterhead')}</p>
      <p className="text-[15px] text-muted">{t('Printed at the top of every prescription, certificate, patient summary and daily report.')}</p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-4 rounded-2xl bg-canvas p-4">
          {value.logo ? <img src={value.logo} alt={t('Clinic logo')} className="size-16 rounded-xl bg-white object-contain" /> : <span className="grid size-16 place-items-center rounded-xl bg-brand-600 text-white"><ImageSquare size={28} /></span>}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-medium hover:border-brand-300 hover:text-brand-700">
              <ImageSquare size={18} /> {value.logo ? t('Change logo') : t('Add logo')}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pickLogo(e.target.files?.[0])} />
            </label>
            {value.logo && (
              <Button type="button" variant="ghost" icon={<Trash size={18} />} onClick={() => set({ logo: '' })}>
                {t('Remove')}
              </Button>
            )}
          </div>
        </div>
        {FIELDS.map((f) => (
          <Field key={f.key} label={t(f.label)} hint={f.hint ? t(f.hint) : undefined} optional={f.optional} htmlFor={`clinic-${f.key}`}>
            <Input id={`clinic-${f.key}`} value={value[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} className="h-12 text-base" />
          </Field>
        ))}
        {error && <p className="text-[15px] font-medium text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" icon={<FloppyDisk size={18} />} disabled={busy || !online || !draft}>
            {t('Save letterhead')}
          </Button>
          {draft && (
            <Button type="button" variant="ghost" size="lg" onClick={() => {
                setDraft(null)
                setError('')
              }}>
              {t('Discard changes')}
            </Button>
          )}
        </div>
        {!online && <p className="text-sm text-muted">{t('Saving needs the clinic server.')}</p>}
      </form>
    </Card>
  )
}
