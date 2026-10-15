import { expect, test, type Page } from '@playwright/test'

/*
  The clinic's main paths, end to end in a real browser against a freshly seeded demo database:
  public pages, front-desk check-in to a queue number, a doctor's signed consultation, an offline
  note that syncs on reconnect, and the letterhead and audit trail settings.
*/

type Role = 'doctor' | 'desk' | 'nurse'

/** Signs in with the first account of a role. The demo server fills in the shared demo password. */
async function signIn(page: Page, role: Role) {
  await page.goto(`/clinic/login?role=${role}`)
  await expect(page.locator('#pw')).toHaveValue('demo-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(role === 'doctor' ? /\/clinic\/doctor$/ : /\/clinic\/checkin$/)
}

/** Reads the signed-in snapshot straight from the API, to check what reached the server. */
function serverState(page: Page) {
  return page.evaluate(async () => {
    const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
    const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
    return (await res.json()) as { patients: { patient_id: string }[]; consultations: { patient_id: string; chief_complaint: string }[]; tickets: { patient_id: string; status: string }[] }
  })
}

async function setConnection(page: Page, mode: 'Online' | 'This computer disconnected') {
  await page.locator('header').getByRole('button').filter({ hasText: /Online|Offline|Clinic network/ }).first().click()
  await page.getByRole('button').filter({ hasText: new RegExp(`^${mode}`) }).click()
  await page.keyboard.press('Escape')
}

test.describe('public pages', () => {
  test('landing buttons lead to sign-in and the role chooser, and the privacy notice opens', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every health record')
    await page.locator('header').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/clinic\/login$/)
    await page.goto('/')
    await page.locator('header').getByRole('link', { name: 'Get started' }).click()
    await expect(page.getByRole('heading', { name: 'Which one are you?' })).toBeVisible()
    await page.goto('/')
    await page.locator('footer').getByRole('button', { name: 'Data Privacy Act notice' }).click()
    await expect(page.getByRole('dialog')).toContainText('Republic Act No. 10173')
  })

  test('the sign-in screen fits one 900px screen for every role', async ({ page }) => {
    for (const role of ['doctor', 'desk', 'nurse'] as const) {
      await page.goto(`/clinic/login?role=${role}`)
      await expect(page.locator('#pw')).toBeVisible()
      const [scroll, height] = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight])
      expect(scroll, role).toBeLessThanOrEqual(height)
    }
  })

  test('the waiting screen shows queue numbers without signing in', async ({ page }) => {
    await page.goto('/waiting')
    await expect(page.getByText(/[URP]-\d{3}/).first()).toBeVisible()
  })
})

test.describe('front desk', () => {
  test('verifies a patient against the HR list and issues a queue number', async ({ page }) => {
    await signIn(page, 'desk')
    await page.getByRole('button', { name: 'Maria Lourdes Villanueva', exact: true }).click()
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva .*IPG-2004-0318/ }).click()
    await page.getByRole('button', { name: /Demo: fill from ID/ }).click()
    await expect(page.getByRole('heading', { name: 'Check the paper folder' })).toBeVisible()
    await page.getByRole('button', { name: /^Folder found/ }).click()
    await page.getByRole('button', { name: 'Details match the paper folder' }).click()
    await page.getByRole('button', { name: 'Check and continue' }).click()
    await page.getByRole('button', { name: /Next: Priority lane/ }).click()
    await page.getByRole('button', { name: 'Medical', exact: true }).click()
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[URP]-\d{3}$/)).toBeVisible()
    await expect(page.getByText('Please wait for your number to be called.')).toBeVisible()
    await page.goto('/clinic/queue')
    await expect(page.getByText('Maria Lourdes Villanueva').first()).toBeVisible()
  })

  test('registers someone who is not on the HR list, checks the paper cabinet and issues a queue number', async ({ page }) => {
    await signIn(page, 'desk')
    await page.getByRole('button', { name: 'Not on the employee list?' }).click()
    await page.getByRole('button', { name: 'New patient', exact: true }).click()
    await page.getByRole('textbox', { name: 'Full name' }).fill('Zenaida Quirino-Abalos')
    await page.locator('input[type=date]').fill('1988-02-14')
    await page.getByRole('textbox', { name: /^Employee ID/ }).fill('IPG-2026-0001')
    await page.getByRole('button', { name: 'Register person' }).click()
    await expect(page.getByRole('heading', { name: 'Check the paper folder' })).toBeVisible()
    // The queue number waits for the cabinet check.
    await expect(page.getByRole('button', { name: 'Check and continue' })).toBeDisabled()
    await page.getByRole('button', { name: /^No folder/ }).click()
    await page.getByRole('button', { name: 'Check and continue' }).click()
    await page.getByRole('button', { name: /Next: Priority lane/ }).click()
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[URP]-\d{3}$/)).toBeVisible()
    const state = await serverState(page)
    const person = state.persons.find((p) => p.full_name === 'Zenaida Quirino-Abalos')!
    const patient = state.patients.find((p) => p.person_id === person.person_id)!
    expect(patient.paper_status).toBe('none')
    expect(state.employees.find((e) => e.person_id === person.person_id)?.employee_no).toBe('IPG-2026-0001')
    expect(patient.hr_flag).toBeUndefined()
  })

  test('the nurse has exactly the receptionist menu', async ({ page }) => {
    const menu = async () => (await page.locator('aside nav').first().getByRole('link').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim())
    await signIn(page, 'desk')
    const desk = await menu()
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await signIn(page, 'nurse')
    expect(await menu()).toEqual(desk)
    await page.goto('/clinic/settings')
    await expect(page).toHaveURL(/\/clinic\/checkin$/)
  })
})

test.describe('doctor', () => {
  test('sees the dashboard, then consults and signs with a PIN', async ({ page }) => {
    await signIn(page, 'doctor')
    for (const label of ['Waiting for you', 'Drafts to sign', 'Seen today', 'New changes']) await expect(page.getByText(label, { exact: true })).toBeVisible()
    await expect(page.getByText('Census')).toBeVisible()
    const resume = page.getByRole('button', { name: 'Resume' })
    if (await resume.count()) await resume.first().click()
    else {
      await page.getByRole('button', { name: 'Call next patient' }).click()
      await page.getByRole('button', { name: /Start consultation/ }).first().click()
    }
    await expect(page).toHaveURL(/\/clinic\/consult\//)
    await page.getByRole('button', { name: 'Fever', exact: true }).click()
    await page.getByRole('button', { name: 'Save and sign' }).click()
    const pin = page.getByRole('dialog')
    for (const d of '1234') await pin.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('Consultation saved')).toBeVisible()
    await expect(page.getByText(/RX-\d{4}-\d{6}/)).toBeVisible()
  })

  test('a note written offline waits on the computer and syncs on reconnect', async ({ page }) => {
    await signIn(page, 'doctor')
    const before = await serverState(page)
    const patient = before.patients.find((p) => !before.consultations.some((c) => c.patient_id === p.patient_id))!
    await page.goto(`/clinic/consult/${patient.patient_id}`)
    await expect(page.getByRole('button', { name: 'Cough and colds', exact: true })).toBeVisible()
    await setConnection(page, 'This computer disconnected')
    await page.getByRole('button', { name: 'Cough and colds', exact: true }).click()
    // Offline, "Save and sign" also becomes "Save consultation" (signing needs the server); either keeps the note.
    await page.getByRole('button', { name: 'Save consultation', exact: true }).first().click()
    await expect(page.getByText('Saved on this computer').first()).toBeVisible()
    expect((await serverState(page)).consultations.some((c) => c.patient_id === patient.patient_id)).toBe(false)
    await setConnection(page, 'Online')
    await expect.poll(async () => (await serverState(page)).consultations.filter((c) => c.patient_id === patient.patient_id).length, { timeout: 20_000 }).toBe(1)
  })

  test('sets the clinic letterhead, which prints, and exports the full audit trail', async ({ page }) => {
    await signIn(page, 'doctor')
    await page.goto('/clinic/settings')
    await page.locator('#clinic-name').fill('E2E Capitol Clinic')
    await page.locator('#clinic-license_no').fill('DOH-E2E-01')
    await page.getByRole('button', { name: 'Save letterhead' }).click()
    await expect(page.getByText('Letterhead saved')).toBeVisible()
    const day = new Date().toLocaleDateString('en-CA')
    await page.goto(`/print/report/${day}`)
    await expect(page.locator('.print-page header')).toContainText('E2E Capitol Clinic')
    await expect(page.locator('.print-page header')).toContainText('License No. DOH-E2E-01')
    await page.goto('/clinic/audit')
    await expect(page.getByText(/Updated the clinic letterhead \(E2E Capitol Clinic\)/)).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export full log' }).click()
    expect((await download).suggestedFilename()).toMatch(/^gilayon-audit-trail-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

/** Reads one whole-clinic snapshot as the signed-in user, for checks the screens do not show directly. */
function snapshot(page: Page) {
  return page.evaluate(async () => {
    const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
    const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
    return (await res.json()) as {
      patients: { patient_id: string; person_id: string }[]
      persons: { person_id: string; full_name: string; birthdate: string; sex: string }[]
      employees: { person_id: string }[]
      consultations: { patient_id: string }[]
      merged: Record<string, string>
      mergedRecords: { patient_id: string; into: string }[]
    }
  })
}

test.describe('corrections', () => {
  test('a signed prescription is voided with a reason and reissued as a draft that names it', async ({ page }) => {
    await signIn(page, 'doctor')
    const before = await serverState(page)
    // A patient with no visit yet, taken from the end of the list so it does not clash with the other tests.
    const patient = before.patients.filter((p) => !before.consultations.some((c) => c.patient_id === p.patient_id)).at(-1)!
    await page.goto(`/clinic/consult/${patient.patient_id}`)
    await page.getByRole('button', { name: 'Fever', exact: true }).click()
    await page.getByRole('button', { name: 'Save and sign' }).click()
    const pin = page.getByRole('dialog')
    for (const d of '1234') await pin.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('Consultation saved')).toBeVisible()
    const rxNo = (await page.getByText(/RX-\d{4}-\d{6}/).first().innerText()).match(/RX-\d{4}-\d{6}/)![0]

    await page.goto('/clinic/documents')
    await page.getByRole('tab', { name: /^Signed/ }).click()
    await page.getByPlaceholder('Patient or document no.').fill(rxNo)
    const signed = page.locator('li').filter({ hasText: rxNo })
    await signed.getByRole('button', { name: 'Void' }).click()
    // A reason is required: the button stays off until one is written.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Void', exact: true })).toBeDisabled()
    await dialog.getByRole('textbox').fill('Wrong dose written')
    await dialog.getByRole('button', { name: 'Void', exact: true }).click()

    // It stays on the Voided tab with its reason, and cannot be edited back.
    const voided = page.locator('li').filter({ hasText: rxNo })
    await expect(voided).toContainText('voided: Wrong dose written')
    await expect(voided.getByRole('button', { name: 'Void' })).toHaveCount(0)
    await voided.getByRole('button', { name: 'Reissue' }).click()

    // The replacement is an unsigned draft that names the voided document.
    await expect(page.getByText('Replacement drafted')).toBeVisible()
    await page.getByPlaceholder('Patient or document no.').fill('')
    const draft = page.locator('li').filter({ hasText: `replaces ${rxNo}` })
    await expect(draft).toHaveCount(1)
    await expect(draft.getByRole('button', { name: 'Sign' })).toBeVisible()
    // It is offered only once: the voided original has no Reissue button now.
    await page.getByRole('tab', { name: /^Voided/ }).click()
    await expect(page.locator('li').filter({ hasText: rxNo }).getByRole('button', { name: 'Reissue' })).toHaveCount(0)

    // Sign the replacement with the PIN: it gets its own number.
    await page.getByRole('tab', { name: /^Not yet signed/ }).click()
    await page.locator('li').filter({ hasText: `replaces ${rxNo}` }).getByRole('button', { name: 'Sign' }).click()
    const sign = page.getByRole('dialog')
    for (const d of '1234') await sign.getByRole('button', { name: d, exact: true }).click()
    await page.getByRole('tab', { name: /^Signed/ }).click()
    const replacement = page.locator('li').filter({ hasText: `replaces ${rxNo}` })
    await expect(replacement).toHaveCount(1)
    await expect(replacement).toContainText(/RX-\d{4}-\d{6}/)
  })

  test('two records of one person are merged on the Duplicates screen, fold under the survivor, and a doctor undoes it', async ({ page }) => {
    await signIn(page, 'doctor')
    const s = await snapshot(page)
    // The demo data has no true duplicate pair, so register a second record for a dependent who already has visits.
    const hr = new Set(s.employees.map((e) => e.person_id))
    const original = s.patients.find((p) => !hr.has(p.person_id) && s.consultations.some((c) => c.patient_id === p.patient_id))!
    const person = s.persons.find((p) => p.person_id === original.person_id)!
    const principal = s.patients.find((p) => hr.has(p.person_id))!
    const created = await page.evaluate(
      async ({ principalId, person }) => {
        const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
        const res = await fetch(`/api/patients/${principalId}/dependents`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ person: { full_name: person.full_name, birthdate: person.birthdate, sex: person.sex, contact: '0900 000 0000', civil_status: 'Single' }, type: 'Sibling', mdr: false }),
        })
        return { ok: res.ok, body: await res.json() }
      },
      { principalId: principal.patient_id, person },
    )
    expect(created.ok).toBe(true)
    const extraId = created.body.patient_id as string

    await page.goto('/clinic/patients/duplicates')
    const row = page.locator('li').filter({ hasText: person.full_name }).first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Review' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Are these the same person?')
    // The record with the visit history is the one suggested to keep.
    await expect(dialog.getByRole('button', { name: 'Keeping this record' })).toHaveCount(1)
    await dialog.getByRole('button', { name: 'Merge records' }).click()
    await expect(page.getByText('Records merged')).toBeVisible()

    // The new record is folded away; its visits-bearing twin survives and says what it absorbed.
    const merged = await snapshot(page)
    expect(merged.merged[extraId]).toBe(original.patient_id)
    expect(merged.patients.some((p) => p.patient_id === extraId)).toBe(false)
    expect(merged.consultations.filter((c) => c.patient_id === original.patient_id).length).toBe(s.consultations.filter((c) => c.patient_id === original.patient_id).length)
    await page.goto(`/clinic/patients/${original.patient_id}`)
    await expect(page.getByText('Includes records merged into this one')).toBeVisible()

    // A doctor undoes it with a reason; the record comes back as its own patient.
    await page.getByRole('button', { name: 'Undo merge' }).click()
    const undo = page.getByRole('dialog')
    await expect(undo.getByRole('button', { name: 'Undo merge' })).toBeDisabled()
    await undo.getByRole('textbox').fill('Merged by mistake in the test')
    await undo.getByRole('button', { name: 'Undo merge' }).click()
    await expect(page.getByText('Merge undone')).toBeVisible()
    await expect(page.getByText('Includes records merged into this one')).toHaveCount(0)
    const restored = await snapshot(page)
    expect(restored.merged[extraId]).toBeUndefined()
    expect(restored.patients.some((p) => p.patient_id === extraId)).toBe(true)
  })
})
