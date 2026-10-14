import { DownloadSimple, FileCsv, UploadSimple } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { Button, Card, Input, Modal, useToast } from '../../components/ui'
import { downloadCSV } from '../../lib/utils'
import { PageTitle } from '../ClinicShell'
import { useT } from '../i18n'
import { ageOf, fmtDay, fmtStampOf, matchScore } from '../lib'
import { useClinic } from '../store'
import type { Sex } from '../types'

type Row = { employee_no: string; full_name: string; birthdate: string; sex: Sex; office: string; position: string; contact?: string }

const HEADERS = ['employee_no', 'full_name', 'birthdate', 'sex', 'office', 'position', 'contact']

function parseCSV(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  const split = (line: string) => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = !q
      else if (c === ',' && !q) {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const head = split(lines[0]).map((h) => h.toLowerCase())
  if (!HEADERS.slice(0, 6).every((h) => head.includes(h))) throw new Error(`The file needs these columns: ${HEADERS.join(', ')}`)
  return lines.slice(1).map((l) => {
    const cells = split(l)
    const get = (k: string) => cells[head.indexOf(k)] ?? ''
    const sex = get('sex').toLowerCase().startsWith('m') ? 'Male' : 'Female'
    return { employee_no: get('employee_no').toUpperCase(), full_name: get('full_name'), birthdate: get('birthdate'), sex, office: get('office'), position: get('position'), contact: get('contact') }
  })
}

/** The HR employee list. Importing it creates the patient records (synthetic data in the demo). */
export default function EmployeeImport() {
  const t = useT()
  const toast = useToast()
  const { data, importEmployees, online } = useClinic()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<{ rows: Row[]; source: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const list = useMemo(
    () =>
      data.employees
        .map((e) => ({ e, p: data.persons.find((x) => x.person_id === e.person_id)! }))
        .filter((r) => !q || matchScore(q, r.p.full_name, [r.e.employee_no, r.e.office]) >= 0.45)
        .sort((a, b) => a.p.full_name.localeCompare(b.p.full_name)),
    [data.employees, data.persons, q],
  )

  const currentRows = (): Row[] => data.employees.map((e) => {
    const p = data.persons.find((x) => x.person_id === e.person_id)!
    return { employee_no: e.employee_no, full_name: p.full_name, birthdate: p.birthdate, sex: p.sex, office: e.office, position: e.position, contact: p.contact }
  })

  const sampleUpdate = () => {
    const rows = currentRows()
    // Two transfers and five new hires, so the preview shows every kind of change.
    rows[10] = { ...rows[10], office: 'Provincial Health Office' }
    rows[25] = { ...rows[25], position: 'Administrative Officer III' }
    const hires: Row[] = [
      { employee_no: 'IPG-2026-0102', full_name: 'Rhea Mae Billones', birthdate: '1998-02-11', sex: 'Female', office: 'Provincial Accounting Office', position: 'Accountant I', contact: '0917 220 1841' },
      { employee_no: 'IPG-2026-0103', full_name: 'Jerome Panes', birthdate: '1995-09-30', sex: 'Male', office: 'Provincial Engineering Office', position: 'Engineer II', contact: '0918 551 0923' },
      { employee_no: 'IPG-2026-0104', full_name: 'Lea Grabato', birthdate: '1990-12-03', sex: 'Female', office: 'Provincial Health Office', position: 'Nurse I', contact: '0919 402 7715' },
      { employee_no: 'IPG-2026-0105', full_name: 'Nestor Alinsug', birthdate: '1966-04-21', sex: 'Male', office: 'Provincial General Services Office', position: 'Driver II', contact: '0921 113 6650' },
      { employee_no: 'IPG-2026-0106', full_name: 'Cherry Sustento', birthdate: '2000-07-08', sex: 'Female', office: 'Provincial Social Welfare and Development Office', position: 'Social Welfare Assistant', contact: '0995 870 2214' },
    ]
    setPreview({ rows: [...rows, ...hires], source: 'Sample HR update (synthetic)' })
  }

  const diff = useMemo(() => {
    if (!preview) return null
    let created = 0
    let updated = 0
    for (const r of preview.rows) {
      const e = data.employees.find((x) => x.employee_no === r.employee_no)
      if (!e) created++
      else {
        const p = data.persons.find((x) => x.person_id === e.person_id)!
        if (e.office !== r.office || e.position !== r.position || p.full_name !== r.full_name) updated++
      }
    }
    return { created, updated, unchanged: preview.rows.length - created - updated }
  }, [preview, data.employees, data.persons])

  return (
    <div>
      <PageTitle
        title={t('Employee list')}
        sub={`${data.employees.length} employees from HR · last import ${fmtStampOf(data.lastImport.at)} (${data.lastImport.source})`}
        actions={
          <>
            <Button variant="secondary" size="lg" icon={<DownloadSimple size={20} />} onClick={() => downloadCSV('hr-employee-list.csv', currentRows())}>
              Download CSV
            </Button>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  setPreview({ rows: parseCSV(await f.text()), source: f.name })
                } catch (err) {
                  toast({ tone: 'warn', title: 'Could not read the file', body: (err as Error).message })
                }
                e.target.value = ''
              }}
            />
            <Button size="lg" icon={<UploadSimple size={20} />} disabled={!online} onClick={() => input.current?.click()}>
              Import CSV
            </Button>
          </>
        }
      />
      <Card className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-3 text-base text-ink-2">
          <FileCsv size={28} className="text-brand-600" /> Importing the list creates or updates patient records. Details come from HR, so staff do not retype them.
        </p>
        <Button variant="soft" onClick={sampleUpdate} disabled={!online}>
          Try a sample HR update
        </Button>
      </Card>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by name or employee ID')} className="mb-4 h-14 text-lg" />
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[9rem_1.4fr_7rem_1.6fr_1.2fr] gap-4 bg-canvas px-5 py-3 text-[15px] font-medium text-muted lg:grid">
          <span>{t('Employee ID')}</span>
          <span>{t('Full name')}</span>
          <span>{t('Age')}</span>
          <span>{t('Office')}</span>
          <span>{t('Position')}</span>
        </div>
        <ul className="divide-y divide-line">
          {list.slice(0, 80).map(({ e, p }) => (
            <li key={e.employee_id} className="grid grid-cols-1 gap-1 px-5 py-3 text-base lg:grid-cols-[9rem_1.4fr_7rem_1.6fr_1.2fr] lg:gap-4">
              <span className="font-mono text-brand-800">{e.employee_no}</span>
              <span className="font-semibold">{p.full_name}</span>
              <span className="tabular text-ink-2">
                {ageOf(p.birthdate)} · {fmtDay(p.birthdate).replace(/^\w+ \d+, /, '')}
              </span>
              <span className="text-ink-2">{e.office}</span>
              <span className="text-ink-2">{e.position}</span>
            </li>
          ))}
        </ul>
        {list.length > 80 && <p className="border-t border-line px-5 py-3 text-sm text-muted">Showing 80 of {list.length}. Search to narrow down.</p>}
      </Card>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Preview import"
        subtitle={preview?.source}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => {
                const r = importEmployees(preview!.rows, preview!.source)
                toast({ tone: 'ok', title: 'Employee list imported', body: `${r.created} new patient records, ${r.updated} updated, ${r.unchanged} unchanged.` })
                setPreview(null)
              }}
            >
              Import {preview?.rows.length} rows
            </Button>
          </>
        }
      >
        {diff && (
          <div className="grid grid-cols-3 gap-3">
            {[
              ['New', diff.created, 'patient records created'],
              ['Updated', diff.updated, 'office, position or name'],
              ['Unchanged', diff.unchanged, 'no changes'],
            ].map(([k, n, s]) => (
              <div key={String(k)} className="rounded-2xl bg-canvas p-4">
                <p className="text-sm text-muted">{k}</p>
                <p className="text-3xl font-semibold tabular">{n}</p>
                <p className="text-sm text-muted">{s}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[15px] text-muted">Every change is written to the audit trail. Use synthetic data only in the demo.</p>
      </Modal>
    </div>
  )
}
