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
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    await page.getByRole('button', { name: /^Yes, open the record/ }).click()
    await page.getByRole('button', { name: /Next: Priority lane/ }).click()
    await page.getByRole('button', { name: 'Medical', exact: true }).click()
    await page.getByRole('button', { name: 'Follow-up', exact: true }).click()
    await page.getByRole('button', { name: 'Issue queue number' }).click()
    await expect(page.getByText(/^[URP]-\d{3}$/)).toBeVisible()
    await expect(page.getByText('Please wait for your number to be called.')).toBeVisible()
    await page.goto('/clinic/queue')
    await expect(page.getByText('Maria Lourdes Villanueva').first()).toBeVisible()
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
