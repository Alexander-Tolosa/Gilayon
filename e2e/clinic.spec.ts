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

/** Fills what a consultation needs (complaint, notes, one diagnosis) and writes one prescription. */
async function fillConsult(page: Page) {
  await page.getByLabel(/^Chief complaint/).fill('Fever for 2 days')
  await page.getByRole('textbox', { name: /^Treatment notes/ }).fill('Rest, fluids and paracetamol as needed.')
  // The doctor types the diagnosis in their own words; there is no code to pick.
  await page.getByPlaceholder(/Type the diagnosis/).fill('Viral fever')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Viral fever', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add drug' }).click()
  await page.getByLabel('Drug', { exact: true }).fill('Paracetamol')
  await page.getByLabel('Dose', { exact: true }).fill('500 mg')
  await page.getByLabel('How often', { exact: true }).fill('Every 6 hours as needed')
  await page.getByLabel('Quantity', { exact: true }).fill('10')
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
  test('the landing page leads to sign-in, has no Get started, and the privacy notice opens', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every health record')
    await page.locator('header').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/clinic\/login$/)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Get started' })).toHaveCount(0)
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
    // Her folder status is already on record, so the desk is not asked about the folder again.
    await expect(page.getByRole('button', { name: /^Folder found/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Check and continue' }).click()
    await page.getByRole('button', { name: /^Next/ }).click()
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
    await page.getByRole('button', { name: 'Add Patient' }).click()
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
    await page.getByRole('textbox', { name: 'Contact' }).fill('0917 000 0000')
    await page.getByRole('button', { name: /^Next/ }).click()
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[URP]-\d{3}$/)).toBeVisible()
    const state = await serverState(page)
    const person = state.persons.find((p) => p.full_name === 'Zenaida Quirino-Abalos')!
    const patient = state.patients.find((p) => p.person_id === person.person_id)!
    expect(patient.paper_status).toBe('none')
    expect(state.employees.find((e) => e.person_id === person.person_id)?.employee_no).toBe('IPG-2026-0001')
    expect(patient.hr_flag).toBeUndefined()
  })

  test('the nurse gets the same check-in changes: Add Patient, required contact, no Urgent, no repeated folder question', async ({ page }) => {
    await signIn(page, 'nurse')
    // A patient already on record: details arrive filled in and the folder question is not asked again.
    await page.getByRole('button', { name: 'Maria Lourdes Villanueva', exact: true }).click()
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva .*IPG-2004-0318/ }).click()
    await expect(page.getByRole('heading', { name: 'Check the paper folder' })).toBeVisible()
    await expect(page.getByLabel('Birthdate', { exact: true })).not.toHaveValue('')
    await expect(page.getByRole('button', { name: /^Folder found/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).click()

    // A new patient: registered through Add Patient, contact required before the next step.
    await page.getByRole('button', { name: 'Add Patient' }).click()
    await page.getByRole('button', { name: 'New patient', exact: true }).click()
    await page.getByRole('textbox', { name: 'Full name' }).fill('Nilda Parreno-Santos')
    await page.locator('input[type=date]').fill('1975-06-09')
    // Vital signs sit under PhilHealth PIN and PWD ID on the registration form.
    await page.getByRole('textbox', { name: /^Blood pressure/ }).fill('130/85')
    await page.getByRole('textbox', { name: /^Weight/ }).fill('64')
    await page.getByRole('button', { name: 'Register person' }).click()
    await expect(page.getByRole('heading', { name: 'Check the paper folder' })).toBeVisible()
    await page.getByRole('button', { name: /^No folder/ }).click()
    await page.getByRole('button', { name: 'Check and continue' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Required field')).toBeVisible()
    await page.getByRole('textbox', { name: 'Contact' }).fill('0917 111 2222')
    // Typed once at registration, they are still there on this step and travel with the queue number.
    await expect(page.getByRole('textbox', { name: /^Blood pressure/ })).toHaveValue('130/85')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Priority lane' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Urgent/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[RP]-\d{3}$/)).toBeVisible()
    const tickets = await page.evaluate(async () => {
      const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
      const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
      return ((await res.json()) as { tickets: { vitals?: { bp?: string; weight?: string } }[] }).tickets
    })
    expect(tickets.some((x) => x.vitals?.bp === '130/85' && x.vitals?.weight === '64')).toBe(true)

    // The queue board has no Urgent lane and no "Mark urgent".
    await page.goto('/clinic/queue')
    await expect(page.getByRole('button', { name: 'Mark urgent' })).toHaveCount(0)
    await expect(page.getByText('Urgent', { exact: true })).toHaveCount(0)
  })

  test('vital signs typed at registration are already filled in for the doctor', async ({ page }) => {
    await signIn(page, 'desk')
    await page.getByRole('button', { name: 'Add Patient' }).click()
    await page.getByRole('button', { name: 'New patient', exact: true }).click()
    await page.getByRole('textbox', { name: 'Full name' }).fill('Lorna Dimaculangan')
    await page.locator('input[type=date]').fill('1982-11-03')
    await page.getByRole('textbox', { name: /^Blood pressure/ }).fill('118/76')
    await page.getByRole('textbox', { name: /^Body temp/ }).fill('36.9')
    await page.getByRole('textbox', { name: /^Pulse rate/ }).fill('80')
    await page.getByRole('textbox', { name: /^Respiration rate/ }).fill('18')
    await page.getByRole('textbox', { name: /^Height/ }).fill('158')
    await page.getByRole('textbox', { name: /^Weight/ }).fill('55')
    await page.getByRole('button', { name: 'Register person' }).click()
    await page.getByRole('button', { name: /^No folder/ }).click()
    await page.getByRole('button', { name: 'Check and continue' }).click()
    // Still there on the Records step, with no retyping.
    await expect(page.getByRole('textbox', { name: /^Respiration rate/ })).toHaveValue('18')
    await page.getByRole('textbox', { name: 'Contact' }).fill('0917 222 3333')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[RP]-\d{3}$/)).toBeVisible()
    const patientId = await page.evaluate(async () => {
      const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
      const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
      const st = (await res.json()) as { persons: { person_id: string; full_name: string }[]; patients: { patient_id: string; person_id: string }[] }
      const person = st.persons.find((x) => x.full_name === 'Lorna Dimaculangan')!
      return st.patients.find((x) => x.person_id === person.person_id)!.patient_id
    })

    // The doctor opens the patient: the same readings are in the consultation form.
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await signIn(page, 'doctor')
    await page.goto(`/clinic/consult/${patientId}`)
    await expect(page.getByRole('textbox', { name: /^Blood pressure/ })).toHaveValue('118/76')
    await expect(page.getByRole('textbox', { name: /^Body temp/ })).toHaveValue('36.9')
    await expect(page.getByRole('textbox', { name: /^Pulse rate/ })).toHaveValue('80')
    await expect(page.getByRole('textbox', { name: /^Respiration rate/ })).toHaveValue('18')
    await expect(page.getByRole('textbox', { name: /^Height/ })).toHaveValue('158')
    await expect(page.getByRole('textbox', { name: /^Weight/ })).toHaveValue('55')
    await expect(page.getByText(/Taken at the front desk at/)).toBeVisible()

    // A saved draft with a blank box does not hide the desk's reading: the box fills in again on reopening,
    // and what the doctor typed is kept.
    await page.getByRole('textbox', { name: /^Blood pressure/ }).fill('')
    await page.getByRole('textbox', { name: /^Treatment notes/ }).fill('rest and fluids')
    page.on('dialog', (d) => void d.accept()) // typing a note makes closing the page ask first
    await page.reload()
    await expect(page.getByRole('textbox', { name: /^Treatment notes/ })).toHaveValue('rest and fluids')
    await expect(page.getByRole('textbox', { name: /^Blood pressure/ })).toHaveValue('118/76')
  })

  test('a visit with no readings from the front desk says so, instead of showing silent empty boxes', async ({ page }) => {
    await signIn(page, 'doctor')
    // Demo patients have no readings: nobody at the desk took any for them.
    const patientId = await page.evaluate(async () => {
      const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
      const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
      const st = (await res.json()) as { persons: { person_id: string; full_name: string }[]; patients: { patient_id: string; person_id: string }[] }
      const person = st.persons.find((x) => x.full_name === 'Edgardo Villanueva')!
      return st.patients.find((x) => x.person_id === person.person_id)!.patient_id
    })
    await page.goto(`/clinic/consult/${patientId}`)
    await expect(page.getByText(/The front desk took no readings for this visit/)).toBeVisible()
    await expect(page.getByRole('textbox', { name: /^Blood pressure/ })).toHaveValue('')
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
    await expect(page.getByText('Census')).toHaveCount(0)
    const resume = page.getByRole('button', { name: 'Resume' })
    if (await resume.count()) await resume.first().click()
    else {
      await page.getByRole('button', { name: 'Call next patient' }).click()
      await page.getByRole('button', { name: /Start consultation/ }).first().click()
    }
    await expect(page).toHaveURL(/\/clinic\/consult\//)
    await fillConsult(page)
    await page.getByRole('button', { name: 'Save and sign' }).click()
    const pin = page.getByRole('dialog')
    for (const d of '1234') await pin.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('Consultation saved')).toBeVisible()
    await expect(page.getByText(/RX-\d{4}-\d{6}/)).toBeVisible()
  })

  test('signs a prescription and a dental report, and the nurse stamps them from To stamp', async ({ page }) => {
    await signIn(page, 'doctor')
    const resume = page.getByRole('button', { name: 'Resume' })
    if (await resume.count()) await resume.first().click()
    else {
      await page.getByRole('button', { name: 'Call next patient' }).click()
      await page.getByRole('button', { name: /Start consultation/ }).first().click()
    }
    await expect(page).toHaveURL(/\/clinic\/consult\//)
    // Records from other clinics can be scanned in without leaving the consultation.
    await expect(page.getByText('Records from other clinics')).toBeVisible()
    await fillConsult(page)
    // Lab requests are typed too, not picked from a fixed list.
    await page.getByLabel('Lab test', { exact: true }).fill('Fasting blood sugar')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Fasting blood sugar', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: /Issue a/ }).check()
    await page.getByRole('button', { name: 'Dental report', exact: true }).click()
    await page.getByRole('button', { name: 'Save and sign' }).click()
    const pin = page.getByRole('dialog')
    for (const d of '1234') await pin.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('Consultation saved')).toBeVisible()
    await expect(page.getByText(/RX-\d{4}-\d{6}/)).toBeVisible()
    await expect(page.getByText(/DR-\d{4}-\d{6}/)).toBeVisible()
    await expect(page.getByText(/Sent to the front desk to be stamped/)).toBeVisible()
    const labNames = await page.evaluate(async () => {
      const token = JSON.parse(sessionStorage.getItem('himsog-token') ?? 'null')
      const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } })
      return ((await res.json()) as { labs: { test_name: string }[] }).labs.map((l) => l.test_name)
    })
    expect(labNames).toContain('Fasting blood sugar')

    // The nurse finds both under To stamp, marks them, and they move to Stamped.
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await signIn(page, 'nurse')
    await page.locator('aside nav').first().getByRole('link', { name: /To stamp/ }).click()
    await expect(page).toHaveURL(/\/clinic\/stamp$/)
    await expect(page.getByText(/DR-\d{4}-\d{6}/).first()).toBeVisible()
    const mark = page.getByRole('button', { name: 'Stamped, given to patient' })
    const waiting = await mark.count()
    expect(waiting).toBeGreaterThanOrEqual(2)
    await mark.first().click()
    await expect(mark).toHaveCount(waiting - 1)
    await page.getByRole('tab', { name: /^Stamped/ }).click()
    await expect(page.getByText(/(RX|DR|MC)-\d{4}-\d{6}/).first()).toBeVisible()
  })

  test('a note written offline waits on the computer and syncs on reconnect', async ({ page }) => {
    await signIn(page, 'doctor')
    const before = await serverState(page)
    const patient = before.patients.find((p) => !before.consultations.some((c) => c.patient_id === p.patient_id))!
    await page.goto(`/clinic/consult/${patient.patient_id}`)
    await expect(page.getByLabel(/^Chief complaint/)).toBeVisible()
    await setConnection(page, 'This computer disconnected')
    await fillConsult(page)
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
    await fillConsult(page)
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
    // The demo data has no true duplicate pair, so register a second record for a dependent who already has visits
    // (confirmed, as the desk does after the possible-duplicate warning).
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
          body: JSON.stringify({ person: { full_name: person.full_name, birthdate: person.birthdate, sex: person.sex, contact: '0900 000 0000', civil_status: 'Single' }, type: 'Sibling', mdr: false, confirmed: true }),
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

test.describe('scanning an old folder', () => {
  test('reads a form, is corrected against the records, and saves once a person confirms', async ({ page }) => {
    await signIn(page, 'desk')
    await page.goto('/clinic/scan')

    await page.getByRole('button', { name: 'Villanueva (clean print)' }).click()
    // Local OCR on the server PC: a few seconds, no internet.
    await expect(page.getByText(/Read in \d/)).toBeVisible({ timeout: 60_000 })
    // The header says in plain words what was read; the engine names are in its tooltip, for support.
    // (The handwriting reader is off in these tests, see playwright.config.ts, so only typed text was read.)
    await expect(page.getByText('Typed text only')).toBeVisible()
    await expect(page.getByTitle(/Tesseract 7 \(local\)/)).toBeVisible()

    // The patient was found from the form itself, and the fields came out of the page.
    await expect(page.getByText('Maria Lourdes Villanueva').first()).toBeVisible()
    await expect(page.getByText(/Matched by name and birthdate/)).toBeVisible()
    await expect(page.getByLabel('Birthdate', { exact: true })).toHaveValue('1968-03-18')
    await expect(page.getByLabel('Sex', { exact: true })).toHaveValue('Female')
    await expect(page.getByLabel('Allergy 1', { exact: true })).toHaveValue(/PENICILLIN/)

    // Nothing reaches the record until a person says so.
    await page.getByRole('button', { name: /I checked every field/ }).click()
    await expect(page.getByText('Saved to the record')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/fields were read correctly/)).toBeVisible()

    // The measured numbers come from that confirmation, not from a fixed figure.
    await page.getByRole('tab', { name: 'Accuracy and speed' }).click()
    await expect(page.getByText('Field accuracy')).toBeVisible()
    await expect(page.getByText(/%$/).first()).toBeVisible()
  })

  test('Scan with AI from check-in returns to check-in after the nurse confirms', async ({ page }) => {
    await signIn(page, 'nurse')
    await page.getByRole('button', { name: 'Maria Lourdes Villanueva', exact: true }).click()
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva .*IPG-2004-0318/ }).click()
    await expect(page.getByRole('heading', { name: 'Check the paper folder' })).toBeVisible()
    await page.getByRole('button', { name: 'Check and continue' }).click()
    await expect(page.getByRole('button', { name: 'Scan with AI' })).toBeVisible()
    // Readings typed at the desk before the detour must still be there when the nurse comes back.
    await page.getByLabel('Blood pressure (mmHg)').fill('118/76')
    await page.getByLabel('Weight (kg)').fill('61')
    await page.locator('input[type=file]').nth(1).setInputFiles('public/forms/sample-villanueva.png')

    // The read form opens on the verify screen, for this patient.
    await expect(page.getByText(/Read in \d/)).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /I checked every field/ }).click()
    await expect(page.getByText('Saved to the record')).toBeVisible({ timeout: 30_000 })

    // One click takes the nurse back to where they were: the same patient, at the records step.
    await page.getByRole('link', { name: 'Back to check-in' }).click()
    await expect(page).toHaveURL(/\/clinic\/checkin\?resume=/)
    await expect(page.getByText('Identity verified')).toBeVisible()
    await expect(page.getByLabel('Blood pressure (mmHg)')).toHaveValue('118/76')
    await expect(page.getByLabel('Weight (kg)')).toHaveValue('61')
  })

  test('a correction is kept, and a line can be added or taken away', async ({ page }) => {
    await signIn(page, 'desk')
    await page.goto('/clinic/scan')
    await page.getByRole('button', { name: 'Dela Cruz (2 allergies)' }).click()
    await expect(page.getByText(/Read in \d/)).toBeVisible({ timeout: 60_000 })

    await page.getByLabel('Contact no.', { exact: true }).fill('0919 554 2299')
    await expect(page.getByText('1 corrected so far')).toBeVisible()

    // A line the machine missed can be added, and taken away again.
    await page.getByRole('button', { name: '+ Add a line the machine missed' }).first().click()
    const added = page.getByLabel('Allergy 3, added by you', { exact: true })
    await expect(added).toBeVisible()
    await page.getByRole('button', { name: 'Remove Allergy 3, added by you' }).click()
    await expect(added).toBeHidden()

    // Clearing a line the machine read counts as a correction rather than disappearing silently.
    await page.getByRole('button', { name: 'Remove Allergy 2' }).click()
    await expect(page.getByText('2 corrected so far')).toBeVisible()

    await page.getByRole('button', { name: /I checked every field/ }).click()
    await expect(page.getByText('Saved to the record')).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('scan with AI for other documents', () => {
  /** Stands in for the model, which is not part of these tests: the page reads as `reading`. */
  async function reads(page: Page, reading: Record<string, unknown>) {
    await page.route('**/api/recognition/document', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reading) }))
  }
  const lab = {
    text: ['CBC', 'Hemoglobin: 128 g/L', 'WBC: 6.2'],
    date: '2026-09-30',
    issued_by: 'Iloilo Doctors Hospital',
    title: 'Laboratory result',
    name_on_page: 'Maria Lourdes Villanueva',
    name_matches: true,
    patient_name: 'Maria Lourdes Villanueva',
  }

  async function openFromDashboard(page: Page) {
    await signIn(page, 'doctor')
    await page.getByRole('button', { name: 'Scan with AI' }).click()
    await page.getByRole('textbox', { name: 'Search for the patient' }).fill('Maria Lourdes Vill')
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva/ }).click()
    await page.getByRole('button', { name: 'Lab result' }).click()
    await page.locator('[role=dialog] input[type=file]').setInputFiles('public/forms/sample-villanueva.png')
  }

  test('files a lab result in the patient record from the dashboard, with the text the doctor checked', async ({ page }) => {
    await reads(page, lab)
    await openFromDashboard(page)

    await expect(page.getByText('The name on the page matches Maria Lourdes Villanueva.')).toBeVisible()
    // What was read is editable: the doctor corrects it before it is filed.
    const text = page.getByRole('textbox', { name: /^Text read from the page/ })
    await expect(text).toHaveValue('CBC\nHemoglobin: 128 g/L\nWBC: 6.2')
    await text.fill('CBC\nHemoglobin: 126 g/L\nWBC: 6.2')
    await page.getByRole('button', { name: /^Attach to Maria/ }).click()
    await expect(page.getByText('Attached to Maria Lourdes Villanueva')).toBeVisible()

    // It is in the record, marked as read, with the corrected text beside the page.
    await page.goto('/clinic/patients')
    await page.getByRole('textbox', { name: 'Search patients' }).fill('Villanueva')
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva HMO/ }).click()
    await page.getByRole('tab', { name: /^Old paper records/ }).click()
    await page.locator('li button', { hasText: 'Text read' }).first().click()
    await expect(page.getByLabel('Text read from this page')).toContainText('Hemoglobin: 126 g/L')
  })

  test('a page that names someone else cannot be filed until the doctor says it is this patient', async ({ page }) => {
    await reads(page, { ...lab, name_on_page: 'NAVARRO, THEODORE', name_matches: false })
    await openFromDashboard(page)

    await expect(page.getByText(/This page names/)).toBeVisible()
    const attach = page.getByRole('button', { name: /^Attach to Maria/ })
    await expect(attach).toBeDisabled()
    await page.getByLabel('It is this patient. File it anyway.').check()
    await expect(attach).toBeEnabled()
    await page.getByLabel('It is this patient. File it anyway.').uncheck()
    await expect(attach).toBeDisabled()
  })

  test('opened from a patient record it is already for that patient, and the photo can be filed when the reader fails', async ({ page }) => {
    await page.route('**/api/recognition/document', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The handwriting model is not installed. Run: ollama pull qwen2.5vl:3b' }) }))
    await signIn(page, 'doctor')
    await page.goto('/clinic/patients')
    await page.getByRole('textbox', { name: 'Search patients' }).fill('Villanueva')
    await page.getByRole('button', { name: /^Maria Lourdes Villanueva HMO/ }).click()
    await page.getByRole('button', { name: 'Scan with AI' }).first().click()
    await expect(page.getByText('For Maria Lourdes Villanueva')).toBeVisible()
    await page.getByRole('button', { name: 'Dental' }).click()
    await page.locator('[role=dialog] input[type=file]').setInputFiles('public/forms/sample-villanueva.png')

    await expect(page.getByText(/model is not installed/)).toBeVisible()
    // An outside report is filed with the place it came from, and the screen says so instead of doing nothing.
    await page.getByRole('button', { name: 'Attach the photo without reading it' }).click()
    await expect(page.getByText('Name the clinic or hospital the page came from')).toBeVisible()
    await page.getByLabel('From which clinic or hospital?').fill('Dental Care Iloilo')
    await page.getByRole('button', { name: 'Attach the photo without reading it' }).click()
    await expect(page.getByText('Attached to Maria Lourdes Villanueva')).toBeVisible()
  })
})
