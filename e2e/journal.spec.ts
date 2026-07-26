// Journal-entry runner flow against the mocked backend.
import { test, expect, login } from './fixtures'
import type { Page } from '@playwright/test'
import { MUGG_CONFIG, MUGG_CORRECT, MUGG_ID } from './journal-fixture'

const accountLabel = (id: string) => MUGG_CONFIG.options.find((o) => o.id === id)!.label
const rowLabel = (id: string) => MUGG_CONFIG.rows.find((r) => r.id === id)!.label

async function fillEntry(
  page: Page,
  rowId: string,
  entry: { debit: string; credit: string; amount: string },
) {
  await page
    .getByLabel(`${rowLabel(rowId)} — debit account`)
    .selectOption({ label: accountLabel(entry.debit) })
  await page
    .getByLabel(`${rowLabel(rowId)} — credit account`)
    .selectOption({ label: accountLabel(entry.credit) })
  await page.getByLabel(`${rowLabel(rowId)} — amount`).fill(entry.amount)
}

test.beforeEach(async ({ mock }) => {
  mock.seedPractice()
  mock.seedJournal()
  mock.seed([
    {
      title: '06 — From Trial Balance to Financial Statements',
      slug: '06-from-trial-balance-to-financial-statements',
      content: '# Trial balance',
      folder: 'FFA',
    },
  ])
})

test('journal runner: scenario, progress across 30 cells, gated submit', async ({ page }) => {
  await login(page)
  await page.goto(`/#/practice/run/${MUGG_ID}`)
  await expect(
    page.getByRole('heading', { name: /Preparing financial statements/ }),
  ).toBeVisible()

  // The trial balance scenario renders as a markdown table.
  await expect(page.getByText('Trial balance as at 31 December 20X7')).toBeVisible()

  await expect(page.getByText('0 of 30 entries completed')).toBeVisible()
  await fillEntry(page, 'closing-inv', {
    debit: 'inventories',
    credit: 'is-closing',
    amount: '647',
  })
  await expect(page.getByText('3 of 30 entries completed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit answers' })).toBeDisabled()
  await expect(page.getByText('27 left to answer')).toBeVisible()
})

test('journal submit: amounts scored, reversal caught, error log filled', async ({
  page,
  mock,
}) => {
  await login(page)
  await page.goto(`/#/practice/run/${MUGG_ID}`)
  await expect(page.getByText('0 of 30 entries completed')).toBeVisible()

  for (const [rowId, entry] of Object.entries(MUGG_CORRECT)) {
    await fillEntry(page, rowId, {
      debit: entry.debit,
      credit: entry.credit,
      amount: String(entry.amount),
    })
  }
  // Two deliberate mistakes: prepayment amount uses the full $180, and the
  // contra entry has its accounts reversed.
  await page.getByLabel(`${rowLabel('elec-prepay')} — amount`).fill('180')
  await fillEntry(page, 'contra', {
    debit: MUGG_CORRECT['contra'].credit,
    credit: MUGG_CORRECT['contra'].debit,
    amount: String(MUGG_CORRECT['contra'].amount),
  })

  await page.getByRole('button', { name: 'Submit answers' }).click()

  const summary = page.getByRole('status')
  await expect(summary).toContainText('27/30')
  await expect(summary).toContainText('8/10')

  // Amount feedback shows your figure vs the correct one.
  const prepayRow = page.locator('.result-row', { hasText: 'electricity prepayment' })
  await expect(prepayRow.getByText('Your answer:')).toBeVisible()
  await expect(prepayRow.getByText('180').first()).toBeVisible()
  await expect(prepayRow.getByText('Correct answer:')).toBeVisible()

  // Reversed accounts: both account cells wrong, amount right.
  const contraRow = page.locator('.result-row', { hasText: 'contra entry' })
  await expect(contraRow.getByText('— incorrect')).toHaveCount(2)

  // The corrected journal table includes the amounts.
  await expect(page.getByRole('heading', { name: 'Correct journal entries' })).toBeVisible()

  // 3 wrong cells → 3 error-log rows (2 account cells + 1 amount cell).
  expect(mock.errors).toHaveLength(3)
  expect(mock.errors.some((e) => e.cell === 'amount')).toBe(true)

  await expect(page.getByRole('link', { name: 'Review source note' })).toBeVisible()
})

test('mobile journal layout keeps every field usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto(`/#/practice/run/${MUGG_ID}`)
  await expect(page.getByText('0 of 30 entries completed')).toBeVisible()
  await fillEntry(page, 'dep-mv', { debit: 'dep-expense', credit: 'acc-dep-mv', amount: '435' })
  await expect(page.getByText('3 of 30 entries completed')).toBeVisible()
})

test('editor can open the journal question in its dedicated builder', async ({ page, mock }) => {
  mock.role = 'admin'
  await login(page)
  await page.goto('/#/builder')
  await page
    .getByRole('link', { name: /Preparing financial statements/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Edit journal question' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Learner preview' })).toBeVisible()

  // Preview: answer one item correctly, check locally.
  await fillEntry(page, 'closing-inv', { debit: 'inventories', credit: 'is-closing', amount: '647' })
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(page.getByRole('status')).toContainText('3/30')

  // Publish gate: clear an amount and expect an actionable error.
  await page.getByRole('group', { name: 'Item 1', exact: true }).getByLabel('Amount ($)').fill('')
  await page.getByRole('button', { name: 'Publish update' }).click()
  await expect(page.getByText("Can't publish yet")).toBeVisible()
  await expect(page.getByText('has no correct amount')).toBeVisible()
})
