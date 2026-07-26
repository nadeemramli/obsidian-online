// Practice runner + builder flows against the mocked backend.
import { test, expect, login } from './fixtures'
import type { Page } from '@playwright/test'
import { DUAL_EFFECT_CONFIG, CORRECT } from './practice-fixture'

const optionLabel = (id: string) => DUAL_EFFECT_CONFIG.options.find((o) => o.id === id)!.label
const rowLabel = (id: string) => DUAL_EFFECT_CONFIG.rows.find((r) => r.id === id)!.label

const debitSelect = (page: Page, rowId: string) =>
  page.getByLabel(`${rowLabel(rowId)} — debit entry`)
const creditSelect = (page: Page, rowId: string) =>
  page.getByLabel(`${rowLabel(rowId)} — credit entry`)

async function fillAllCorrect(page: Page, except: Record<string, { debit?: string; credit?: string }> = {}) {
  for (const [rowId, correct] of Object.entries(CORRECT)) {
    const debit = except[rowId]?.debit ?? correct.debit
    const credit = except[rowId]?.credit ?? correct.credit
    await debitSelect(page, rowId).selectOption({ label: optionLabel(debit) })
    await creditSelect(page, rowId).selectOption({ label: optionLabel(credit) })
  }
}

async function openActivity(page: Page) {
  await page.goto('/#/practice/specific')
  await page.getByRole('link', { name: /Activity 1: Dual effect/ }).click()
  await expect(page.getByRole('heading', { name: 'Activity 1: Dual effect' })).toBeVisible()
}

test.beforeEach(async ({ mock }) => {
  mock.seedPractice()
  mock.seed([
    {
      title: '05 — Ledger Accounts and Double Entry',
      slug: '05-ledger-accounts-and-double-entry',
      content: '# Ledgers\n\nDouble entry basics.',
      folder: 'FFA',
    },
  ])
})

test('hub shows honest empty-state stats; lane 1 lists the activity', async ({ page }) => {
  await login(page)
  await page.goto('/#/practice')
  await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible()
  await expect(page.getByText('attempts so far')).toBeVisible()
  await expect(page.getByText('no attempts yet')).toBeVisible()
  await page.goto('/#/practice/specific')
  await expect(page.getByRole('link', { name: /Activity 1: Dual effect/ })).toBeVisible()
  await expect(page.getByText('Not attempted')).toBeVisible()
})

test('runner: accessible selectors, live progress, gated submit, reset', async ({ page }) => {
  await login(page)
  await openActivity(page)

  // The instruction note from the reference material is shown.
  await expect(page.getByText('money going in and out of the bank account')).toBeVisible()

  // Every cell is an accessible, labelled select with a placeholder.
  await expect(debitSelect(page, 'sales-cash')).toBeVisible()
  await expect(debitSelect(page, 'sales-cash')).toHaveValue('')
  await expect(page.getByText('0 of 16 entries completed')).toBeVisible()

  // Selecting answers advances progress and never reveals correctness.
  await debitSelect(page, 'sales-cash').selectOption({ label: optionLabel('bank-increase') })
  await expect(page.getByText('1 of 16 entries completed')).toBeVisible()
  await expect(page.getByText('— correct')).toHaveCount(0)

  // Submit stays disabled until every cell is answered.
  const submit = page.getByRole('button', { name: 'Submit answers' })
  await expect(submit).toBeDisabled()
  await expect(page.getByText('15 left to answer')).toBeVisible()
  await fillAllCorrect(page)
  await expect(page.getByText('16 of 16 entries completed')).toBeVisible()
  await expect(submit).toBeEnabled()

  // Reset asks for confirmation and clears.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Clear answers' }).click()
  await expect(page.getByText('0 of 16 entries completed')).toBeVisible()
})

test('submit → row-level feedback, corrected journal, error log, history', async ({
  page,
  mock,
}) => {
  await login(page)
  await openActivity(page)

  // 3 wrong cells: one distractor + a debit/credit reversal.
  await fillAllCorrect(page, {
    'sales-cash': { debit: 'bank-decrease-cash' },
    borrow: { debit: CORRECT.borrow.credit, credit: CORRECT.borrow.debit },
  })
  await page.getByRole('button', { name: 'Submit answers' }).click()

  // Summary: both scoring views, in a status region.
  const summary = page.getByRole('status')
  await expect(summary).toContainText('13/16')
  await expect(summary).toContainText('6/8')

  // Feedback is text + icon, not color alone.
  await expect(page.getByText('— incorrect').first()).toBeVisible()
  await expect(page.getByText('Your answer:').first()).toBeVisible()
  await expect(page.getByText('Correct answer:').first()).toBeVisible()

  // Reversal scored as two wrong cells on the borrow row.
  const borrowRow = page.locator('.result-row', { hasText: 'Borrow money from the bank' })
  await expect(borrowRow.getByText('— incorrect')).toHaveCount(2)

  // Row explanation + corrected journal + overall rules.
  await expect(page.getByText('Money comes into the bank').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Correct journal entries' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The general rules' })).toBeVisible()

  // Post-submit actions, including the source-note link.
  await expect(page.getByRole('button', { name: 'Retry activity' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review source note' })).toBeVisible()

  // Error log captured exactly the 3 wrong cells.
  expect(mock.errors).toHaveLength(3)
  await page.goto('/#/practice/errors')
  await expect(page.getByRole('heading', { name: 'Error log' })).toBeVisible()
  await expect(page.locator('.error-item')).toHaveCount(3)
  await expect(page.getByText('You chose:').first()).toBeVisible()

  // Resolve one.
  await page.getByRole('button', { name: 'Mark resolved' }).first().click()
  await expect(page.locator('.error-item')).toHaveCount(2)

  // History shows the attempt and opens the stored snapshot.
  await page.goto('/#/practice/history')
  await expect(page.getByRole('cell', { name: '13/16' })).toBeVisible()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('status')).toContainText('13/16')
  await expect(page.getByText('question version 1')).toBeVisible()
})

test('double-click submit stores exactly one attempt', async ({ page, mock }) => {
  await login(page)
  await openActivity(page)
  await fillAllCorrect(page)
  const submit = page.getByRole('button', { name: 'Submit answers' })
  await submit.click({ clickCount: 2, delay: 30 }).catch(() => {})
  await expect(page.getByRole('status')).toContainText('16/16')
  expect(mock.attempts).toHaveLength(1)
})

test('retry produces a clean new run and preserves the old attempt', async ({ page, mock }) => {
  await login(page)
  await openActivity(page)
  await fillAllCorrect(page, { 'sales-cash': { debit: 'bank-decrease-cash' } })
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('15/16')

  await page.getByRole('button', { name: 'Retry activity' }).click()
  await expect(page.getByText('0 of 16 entries completed')).toBeVisible()
  await expect(debitSelect(page, 'sales-cash')).toHaveValue('')

  await fillAllCorrect(page)
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('16/16')
  expect(mock.attempts).toHaveLength(2) // the first attempt was not overwritten
})

test('draft answers survive a page refresh', async ({ page }) => {
  await login(page)
  await openActivity(page)
  await debitSelect(page, 'sales-cash').selectOption({ label: optionLabel('bank-increase') })
  await creditSelect(page, 'sales-cash').selectOption({ label: optionLabel('sales-increase') })
  await expect(page.getByText('2 of 16 entries completed')).toBeVisible()

  await page.reload()
  await expect(page.getByText('2 of 16 entries completed')).toBeVisible()
  await expect(debitSelect(page, 'sales-cash')).toHaveValue('bank-increase')
})

test('mobile layout keeps every field usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await login(page)
  await page.goto('/#/practice/specific')
  await page.getByRole('link', { name: /Activity 1: Dual effect/ }).click()

  // All 16 selects exist and are operable in the card layout.
  for (const rowId of Object.keys(CORRECT)) {
    await expect(debitSelect(page, rowId)).toBeVisible()
    await expect(creditSelect(page, rowId)).toBeVisible()
  }
  await debitSelect(page, 'borrow').selectOption({ label: optionLabel('bank-increase') })
  await expect(page.getByText('1 of 16 entries completed')).toBeVisible()
})

test('learners cannot open the builder', async ({ page, mock }) => {
  mock.role = 'learner'
  await login(page)
  await page.goto('/#/builder')
  await expect(page.getByRole('heading', { name: 'Editors only' })).toBeVisible()
  // And the sidebar shows no Builder link.
  await expect(page.getByRole('link', { name: '🛠 Builder' })).toHaveCount(0)
})

test('editor: builder lists content, edits with live preview, publish gate validates', async ({
  page,
  mock,
}) => {
  mock.role = 'admin'
  await login(page)
  await page.goto('/#/builder')
  await expect(page.getByRole('heading', { name: 'Question builder' })).toBeVisible()
  await expect(page.getByText('Activity 1: Dual effect')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).first().click()
  await expect(page.getByRole('heading', { name: 'Edit question' })).toBeVisible()

  // Live preview shows the learner view.
  await expect(page.getByRole('heading', { name: 'Learner preview' })).toBeVisible()
  await expect(debitSelect(page, 'sales-cash')).toBeVisible()

  // Preview can simulate the post-submit state locally.
  await debitSelect(page, 'sales-cash').selectOption({ label: optionLabel('bank-increase') })
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(page.getByRole('status')).toContainText('1/16')

  // Publish gate: break a required field and expect actionable errors.
  await page.getByLabel('Title').fill('')
  await page.getByRole('button', { name: 'Publish update' }).click()
  await expect(page.getByText("Can't publish yet")).toBeVisible()
  await expect(page.getByText('Title is required')).toBeVisible()
  expect(mock.items[0].title).toBe('Activity 1: Dual effect') // nothing was saved

  // Fix it and publish — version bumps because the item was already published.
  await page.getByLabel('Title').fill('Activity 1: Dual effect')
  await page.getByRole('button', { name: 'Publish update' }).click()
  await expect(page.getByText('Published (version 2)')).toBeVisible()
  expect(mock.items[0].version).toBe(2)
  expect(mock.answers.some((a) => a.version === 2)).toBe(true)
})
