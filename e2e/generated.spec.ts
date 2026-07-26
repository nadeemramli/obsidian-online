// Generated-case flow: generate → staged run → results with fresh-variant CTA.
import { test, expect, login } from './fixtures'

test('learner generates a fresh sole-trader case and completes stage 1', async ({
  page,
  mock,
}) => {
  mock.seedFernleaf()
  await login(page)
  await page.goto('/#/practice/statements')
  // Two families offer generation; the sole-trader card comes first.
  await page.getByRole('button', { name: /Generate a fresh case/ }).first().click()

  // The runner opens on the generated case (deterministic mock seed).
  await expect(page.getByRole('heading', { name: /generated/ })).toBeVisible()
  const caseRow = mock.generatedCases[0]
  const keys = mock.generatedKeys[0].keys
  expect(caseRow.seed).toBe(mock.generateSeed)
  await expect(page.getByText('trial balance as at 31 December')).toBeVisible()
  await expect(page.getByText('0 of 18 entries completed')).toBeVisible()

  // Fill stage 1 perfectly straight from the (test-side) key.
  const stage0 = caseRow.stages[0]
  for (const [rowId, key] of Object.entries(keys[0].rows) as Array<[string, any]>) {
    const label = stage0.config.rows.find((r: any) => r.id === rowId)!.label
    const opt = (id: string) => stage0.config.options.find((o: any) => o.id === id)!.label
    await page.getByLabel(`${label} — debit account`).selectOption({ label: opt(key.debit) })
    await page.getByLabel(`${label} — credit account`).selectOption({ label: opt(key.credit) })
    await page.getByLabel(`${label} — amount`).fill(String(key.amount))
  }
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('18/18')

  // The attempt targets the generated case, not an item.
  expect(mock.attempts).toHaveLength(1)
  expect(mock.attempts[0].generated_case_id).toBe(caseRow.id)
  expect(mock.attempts[0].stage_index).toBe(0)
  expect(mock.attempts[0].item_id).toBeNull()
  expect(mock.sessions[0].lane).toBe('statements')
  expect(mock.sessions[0].generated_case_id).toBe(caseRow.id)

  // Stage 2 is the statement of profit or loss proforma.
  await page.getByRole('button', { name: 'Next stage →' }).click()
  await expect(page.getByText('Stage 2 — Statement of profit or loss').first()).toBeVisible()
  await expect(page.getByLabel('Revenue — amount')).toBeVisible()
})

test('generated case results offer another generated variant', async ({ page, mock }) => {
  mock.seedFernleaf()
  await login(page)
  await page.goto('/#/practice/statements')
  await page.getByRole('button', { name: /Generate a fresh case/ }).first().click()
  await expect(page.getByText('0 of 18 entries completed')).toBeVisible()

  const caseRow = mock.generatedCases[0]
  const keys = mock.generatedKeys[0].keys
  for (let stage = 0; stage < 3; stage++) {
    const cfg = caseRow.stages[stage].config
    for (const [rowId, key] of Object.entries(keys[stage].rows) as Array<[string, any]>) {
      const label = cfg.rows.find((r: any) => r.id === rowId)!.label
      if (stage === 0) {
        const opt = (id: string) => cfg.options.find((o: any) => o.id === id)!.label
        await page.getByLabel(`${label} — debit account`).selectOption({ label: opt(key.debit) })
        await page.getByLabel(`${label} — credit account`).selectOption({ label: opt(key.credit) })
        await page.getByLabel(`${label} — amount`).fill(String(key.amount))
      } else {
        await page.getByLabel(`${label} — amount`).fill(String(key.amount))
      }
    }
    await page.getByRole('button', { name: 'Submit answers' }).click()
    await page
      .getByRole('button', { name: stage < 2 ? 'Next stage →' : 'Finish case' })
      .click()
  }

  await expect(page.getByRole('heading', { name: 'Case complete' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('49/49')
  await expect(page.getByText('No root errors')).toBeVisible()
  await expect(page.getByText('freshly generated variant')).toBeVisible()

  // One click → a brand-new variant (mock uses a different seed for realism).
  mock.generateSeed = 54321
  await page.getByRole('button', { name: /generate an altered case/ }).click()
  await expect(page.getByText('0 of 18 entries completed')).toBeVisible()
  expect(mock.generatedCases).toHaveLength(2)
  expect(mock.generatedCases[1].seed).toBe(54321)
})
