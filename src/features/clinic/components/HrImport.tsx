import { FileArrowUp, Warning } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Field, Modal, Select, useToast } from '../../../shared/components/ui'
import { detectDelimiter, parseCsv } from '../lib/csv'
import { HR_FIELDS, autoMap, detectDateOrder, normalizeRow, toIsoDate, type DateOrder, type HrField, type HrImportResult, type RawHrRow } from '../lib/hrlist'
import { fmtStampOf } from '../lib/helpers'
import { useT } from '../lib/i18n'
import { useClinic } from '../store/store'

const MAX_BYTES = 5 * 1024 * 1024
const ORDER_LABEL: Record<DateOrder, string> = { iso: 'Year-month-day (1968-03-18)', mdy: 'Month/day/year (03/18/1968)', dmy: 'Day/month/year (18/03/1968)' }

type Parsed = { headers: string[]; body: string[][]; name: string }
type Stage = 'closed' | 'choose' | 'map' | 'review' | 'done'

/** Doctor's HR employee list import: choose a CSV, match its columns, see what would happen, then import. */
export function HrImportCard() {
  const { data, hrImport } = useClinic()
  const toast = useToast()
  const t = useT()
  const [stage, setStage] = useState<Stage>('closed')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [mapping, setMapping] = useState<Partial<Record<HrField, number>>>({})
  const [order, setOrder] = useState<DateOrder>('iso')
  const [orderGuessed, setOrderGuessed] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HrImportResult | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const close = () => {
    setStage('closed')
    setParsed(null)
    setResult(null)
    setError('')
    if (file.current) file.current.value = ''
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError('')
    if (f.size > MAX_BYTES) return setError(t('That file is over 5 MB. Export only the columns listed above, or split the list.'))
    if (/\.xlsx?$/i.test(f.name)) return setError(t('This is an Excel file. In Excel choose File > Save As > "CSV UTF-8", then pick that file.'))
    const text = await f.text()
    const table = parseCsv(text, detectDelimiter(text))
    if (table.length < 2) return setError(t('The file has no data rows. The first row must be the column names.'))
    const [headers, ...body] = table
    const map = autoMap(headers)
    const dateValues = map.birthdate !== undefined ? body.slice(0, 500).map((r) => r[map.birthdate!] ?? '') : []
    const detected = detectDateOrder(dateValues)
    setParsed({ headers, body, name: f.name })
    setMapping(map)
    setOrder(detected ?? 'mdy')
    setOrderGuessed(detected === null)
    setStage('map')
  }

  const rows: RawHrRow[] = useMemo(() => {
    if (!parsed) return []
    const cell = (r: string[], f: HrField) => (mapping[f] === undefined ? '' : (r[mapping[f]!] ?? ''))
    return parsed.body.map((r, i) => ({
      line: i + 2,
      employee_no: cell(r, 'employee_no'),
      full_name: cell(r, 'full_name'),
      // Dates are converted here, with the order the person confirmed; the server only accepts a real YYYY-MM-DD.
      birthdate: toIsoDate(cell(r, 'birthdate'), order) ?? cell(r, 'birthdate'),
      sex: cell(r, 'sex'),
      office: cell(r, 'office'),
      position: cell(r, 'position'),
      contact: cell(r, 'contact'),
    }))
  }, [parsed, mapping, order])

  const sample = rows.slice(0, 5).map((r) => ({ r, n: normalizeRow(r) }))
  const missing = HR_FIELDS.filter((f) => f.required && mapping[f.key] === undefined)

  const check = async () => {
    setBusy(true)
    setError('')
    const res = await hrImport(rows, parsed?.name ?? 'HR list', true)
    setBusy(false)
    if (res.error || !res.result) return setError(res.error ?? t('Could not check the list.'))
    setResult(res.result)
    setStage('review')
  }

  const apply = async () => {
    setBusy(true)
    setError('')
    const res = await hrImport(rows, parsed?.name ?? 'HR list', false)
    setBusy(false)
    if (res.error || !res.result) return setError(res.error ?? t('The import failed.'))
    setResult(res.result)
    setStage('done')
    toast({ tone: 'ok', title: t('HR list imported'), body: `${res.result.created} ${t('new')}, ${res.result.updated} ${t('updated')}.` })
  }

  const nothing = result && result.created + result.updated === 0

  return (
    <Card className="p-6 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{t('HR employee list')}</p>
          <p className="text-[15px] text-muted">
            {t('The list check-in verifies against. Importing creates a record for each new employee and updates names, offices and positions; it never changes a birthdate.')}
          </p>
          <p className="mt-2 text-[15px] text-ink-2">
            {data.lastImport.at ? (
              <>
                {t('Last import:')} <b>{fmtStampOf(data.lastImport.at)}</b> · {data.lastImport.count} {t('rows')} · {data.lastImport.source}
              </>
            ) : (
              t('No list has been imported yet.')
            )}{' '}
            · {data.employees.length} {t('employees on the list now.')}
          </p>
        </div>
        <Button size="lg" icon={<FileArrowUp size={18} />} onClick={() => setStage('choose')}>
          {t('Import HR list')}
        </Button>
      </div>

      <Modal
        open={stage !== 'closed'}
        onClose={close}
        wide
        title={stage === 'done' ? t('Import finished') : t('Import the HR employee list')}
        subtitle={stage === 'choose' ? t('Step 1 of 3: choose the file') : stage === 'map' ? t('Step 2 of 3: match the columns') : stage === 'review' ? t('Step 3 of 3: check, then import') : undefined}
        footer={
          stage === 'choose' ? (
            <Button variant="ghost" onClick={close}>
              {t('Cancel')}
            </Button>
          ) : stage === 'map' ? (
            <>
              <Button variant="ghost" onClick={() => setStage('choose')}>
                {t('Back')}
              </Button>
              <Button onClick={check} disabled={busy || missing.length > 0}>
                {busy ? t('Checking…') : t('Check the list')}
              </Button>
            </>
          ) : stage === 'review' ? (
            <>
              <Button variant="ghost" onClick={() => setStage('map')}>
                {t('Back')}
              </Button>
              <Button onClick={apply} disabled={busy || !!nothing}>
                {busy ? t('Importing…') : nothing ? t('Nothing to import') : `${t('Import')} ${result!.created + result!.updated} ${t('changes')}`}
              </Button>
            </>
          ) : (
            <Button onClick={close}>{t('Done')}</Button>
          )
        }
      >
        {stage === 'choose' && (
          <div>
            <p className="mb-3 rounded-2xl bg-canvas px-4 py-3 text-base text-ink-2">{t('The HR list is optional: it is a second check at the desk. If HR keeps paper records, skip this and type employee details at check-in or on the record.')}</p>
            <p className="text-base text-ink-2">
              {t('Export the HR list from Excel as CSV UTF-8 (File > Save As). The first row must be the column names. Needed: employee ID, full name, birthdate and sex. Office, position and contact number are optional.')}
            </p>
            <input ref={file} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="mt-4 block w-full rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-6 text-base" />
            <p className="mt-3 text-sm text-muted">{t('Up to 5,000 rows and 5 MB. Nothing is saved until you press Import on the last step.')}</p>
          </div>
        )}

        {stage === 'map' && parsed && (
          <div>
            <p className="text-[15px] text-ink-2">
              <b>{parsed.name}</b>: {parsed.body.length} {t('rows')}. {t('Check that each field is matched to the right column.')}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HR_FIELDS.map((f) => (
                <Field key={f.key} label={`${t(f.label)}${f.required ? '' : ` (${t('optional')})`}`} hint={f.hint ? t(f.hint) : undefined}>
                  <Select
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="h-12 text-base"
                  >
                    <option value="">{f.required ? t('Choose a column') : t('Not in the file')}</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `${t('Column')} ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
              <Field label={t('How dates are written')} hint={orderGuessed ? t('Cannot tell from the file: check the sample below.') : t('Worked out from the file.')}>
                <Select value={order} onChange={(e) => setOrder(e.target.value as DateOrder)} className="h-12 text-base">
                  {(Object.keys(ORDER_LABEL) as DateOrder[]).map((o) => (
                    <option key={o} value={o}>
                      {t(ORDER_LABEL[o])}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {missing.length > 0 && <p className="mt-3 text-[15px] font-semibold text-danger">{t('Still to match:')} {missing.map((m) => t(m.label)).join(', ')}.</p>}

            <p className="mb-1 mt-4 text-[15px] font-semibold">{t('What the first rows will become')}</p>
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2">{t('Line')}</th>
                    <th className="px-3 py-2">{t('Employee ID')}</th>
                    <th className="px-3 py-2">{t('Name')}</th>
                    <th className="px-3 py-2">{t('Birthdate')}</th>
                    <th className="px-3 py-2">{t('Sex')}</th>
                    <th className="px-3 py-2">{t('Office')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map(({ r, n }) => (
                    <tr key={r.line} className="border-t border-line">
                      <td className="px-3 py-2 text-muted">{r.line}</td>
                      {n.ok ? (
                        <>
                          <td className="px-3 py-2 font-mono">{n.row.employee_no}</td>
                          <td className="px-3 py-2">{n.row.full_name}</td>
                          <td className="px-3 py-2 tabular">{n.row.birthdate}</td>
                          <td className="px-3 py-2">{n.row.sex}</td>
                          <td className="px-3 py-2">{n.row.office}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3 py-2 text-danger">
                          {n.reason}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(stage === 'review' || stage === 'done') && result && (
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['New employees', result.created],
                ['Updated', result.updated],
                ['Unchanged', result.unchanged],
                ['On the system, not in this file', result.notInList],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-2xl bg-canvas p-4">
                  <p className="text-sm text-muted">{t(String(k))}</p>
                  <p className="text-3xl font-semibold tabular">{v}</p>
                </div>
              ))}
            </div>

            {stage === 'review' && result.notInList > 0 && <p className="mt-3 text-sm text-muted">{t('Employees not in the file are left exactly as they are. Importing never removes anyone.')}</p>}

            {result.conflicts.length > 0 && (
              <div className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">
                <p className="flex items-center gap-2 font-semibold">
                  <Warning size={18} weight="fill" /> {result.conflicts.length} with a different {result.conflicts.length === 1 ? 'birthdate or sex' : 'birthdate or sex'} than the record. Not changed; flagged on the patient for HR.
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {result.conflicts.slice(0, 6).map((c) => (
                    <li key={c.employee_no + c.field}>
                      {c.name} ({c.employee_no}): {c.field} on the list {c.listed}, on the record {c.stored}
                    </li>
                  ))}
                </ul>
                {result.conflicts.length > 6 && <p className="mt-1">and {result.conflicts.length - 6} more.</p>}
              </div>
            )}

            {result.rejected.length > 0 && (
              <div className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
                <p className="flex items-center gap-2 font-semibold">
                  <Warning size={18} weight="fill" /> {result.rejected.length} {result.rejected.length === 1 ? 'row' : 'rows'} will be skipped
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {result.rejected.slice(0, 8).map((r, i) => (
                    <li key={i}>
                      Line {r.line}
                      {r.employee_no ? ` (${r.employee_no})` : ''}: {r.reason}
                    </li>
                  ))}
                </ul>
                {result.rejected.length > 8 && <p className="mt-1">and {result.rejected.length - 8} more.</p>}
              </div>
            )}

            {result.possibleDuplicates.length > 0 && (
              <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-[15px] text-brand-900">
                <p className="font-semibold">
                  <Badge tone="brand">{result.possibleDuplicates.length}</Badge> new {result.possibleDuplicates.length === 1 ? 'employee looks' : 'employees look'} like someone already registered without an employee ID
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {result.possibleDuplicates.slice(0, 5).map((d) => (
                    <li key={d.employee_no}>
                      {d.name} ({d.employee_no}) and record {d.existing_patient_no}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  After the import they appear in{' '}
                  <Link to="/clinic/patients/duplicates" onClick={close} className="font-semibold underline">
                    {t('Possible duplicates')}
                  </Link>
                  , where you can merge them with the HR-listed record kept.
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-[15px] font-semibold text-danger">{error}</p>}
      </Modal>
    </Card>
  )
}
