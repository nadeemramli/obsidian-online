// Two-lane architecture, quiz running/authoring, and the Fernleaf case flow.
import { test, expect, login } from './fixtures'
import type { Page } from '@playwright/test'
import { DUAL_EFFECT_ITEM, DUAL_EFFECT_CONFIG, CORRECT } from './practice-fixture'
import { FERNLEAF_A, SPINE_B_ID } from './fernleaf-fixture'

const optionLabel = (id: string) => DUAL_EFFECT_CONFIG.options.find((o) => o.id === id)!.label
const rowLabel = (id: string) => DUAL_EFFECT_CONFIG.rows.find((r) => r.id === id)!.label

async function fillDualEffectCorrect(page: Page) {
  for (const [rowId, v] of Object.entries(CORRECT)) {
    await page.getByLabel(`${rowLabel(rowId)} — debit entry`).selectOption({ label: optionLabel(v.debit) })
    await page.getByLabel(`${rowLabel(rowId)} — credit entry`).selectOption({ label: optionLabel(v.credit) })
  }
}

test('practice hub shows exactly two lane cards', async ({ page, mock }) => {
  mock.seedPractice()
  mock.seedFernleaf()
  await login(page)
  await page.goto('/#/practice')
  await expect(page.getByRole('link', { name: /Specific Practice/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Financial Statement Practice/ })).toBeVisible()
  await expect(page.locator('.lane-card')).toHaveCount(2)

  // Lane 1 lists activities; choosing it never asks for a statement family.
  await page.getByRole('link', { name: /Specific Practice/ }).click()
  await expect(page.getByRole('heading', { name: 'Specific Practice' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Activity 1: Dual effect/ })).toBeVisible()

  // Lane 2 groups cases by family; the retest variant is not listed directly.
  await page.goto('/#/practice/statements')
  await expect(page.getByRole('heading', { name: 'Financial Statement Practice' })).toBeVisible()
  await expect(page.getByText('Sole-trader accounts preparation')).toBeVisible()
  await expect(page.getByRole('link', { name: /Case 1: Fernleaf Traders/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Case 1B/ })).toHaveCount(0)
})

test('quiz: sequential run through ordered items with a summary', async ({ page, mock }) => {
  mock.seedPractice()
  // A tiny second question keeps the run fast but proves ordering.
  mock.items.push({
    ...(JSON.parse(JSON.stringify(DUAL_EFFECT_ITEM)) as typeof DUAL_EFFECT_ITEM),
    id: 'mini-1',
    title: 'Mini check',
    config: {
      columns: [{ id: 'class', label: 'Classification' }],
      rows: [{ id: 'r1', label: 'Trade payables' }],
      options: [
        { id: 'asset', label: 'Asset' },
        { id: 'liability', label: 'Liability' },
      ],
    } as any,
  })
  mock.answers.push({
    item_id: 'mini-1',
    version: 1,
    answer_key: { rows: { r1: { class: 'liability', explanation_md: 'Owed to suppliers.' } } } as any,
    overall_explanation_md: null,
  })
  mock.quizzes.push({
    id: 'quiz-1', title: 'Mixed mini set', description_md: '', paper: 'FFA', topic: null,
    est_minutes: 5, status: 'published', tags: [], difficulty: null, timed: false,
    syllabus_area: null, created_by: null,
    created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
  })
  mock.quizItems.push(
    { quiz_id: 'quiz-1', item_id: 'mini-1', position: 0 },
    { quiz_id: 'quiz-1', item_id: DUAL_EFFECT_ITEM.id, position: 1 },
  )

  await login(page)
  await page.goto('/#/practice/specific')
  await page
    .locator('.activity-card', { hasText: 'Mixed mini set' })
    .getByRole('link', { name: 'Learn' })
    .click()

  // Question 1 of 2 — the mini item comes first (position order).
  await expect(page.getByText('Question 1 of 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mini check' })).toBeVisible()
  await page.getByLabel('Trade payables — classification entry').selectOption({ label: 'Liability' })
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('1/1')
  await page.getByRole('button', { name: 'Next question →' }).click()

  // Question 2 of 2 — full dual effect.
  await expect(page.getByText('Question 2 of 2')).toBeVisible()
  await fillDualEffectCorrect(page)
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('16/16')
  await page.getByRole('button', { name: 'Finish quiz' }).click()

  // Summary aggregates both attempts; session was completed with quiz linkage.
  await expect(page.getByRole('heading', { name: 'Quiz complete' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('17/17')
  expect(mock.attempts).toHaveLength(2)
  expect(mock.sessions[0].quiz_id).toBe('quiz-1')
  expect(mock.sessions[0].lane).toBe('specific')
  expect(mock.sessions[0].status).toBe('completed')
})

test('editor can assemble and publish an ordered quiz', async ({ page, mock }) => {
  mock.role = 'admin'
  mock.seedPractice()
  await login(page)
  await page.goto('/#/builder')
  await page.getByRole('button', { name: '+ Quiz' }).click()
  await expect(page.getByRole('heading', { name: 'Edit quiz' })).toBeVisible()

  await page.getByLabel('Title').fill('Authored set A')
  // Publishing with no questions is blocked with an actionable message.
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('at least one question')).toBeVisible()

  await page.getByLabel('Add a question').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Published.')).toBeVisible()
  expect(mock.quizzes[0].status).toBe('published')
  expect(mock.quizItems.filter((m) => m.quiz_id === mock.quizzes[0].id)).toHaveLength(1)
})

test('Fernleaf case: staged run, root diagnosis, repair link, altered retest', async ({
  page,
  mock,
}) => {
  mock.seedPractice() // Activity 2 target for repair links is not needed in mock; link href only.
  mock.seedFernleaf()
  await login(page)
  await page.goto('/#/practice/statements')
  await page.getByRole('link', { name: /Case 1: Fernleaf Traders/ }).click()

  // Stage 1: journals — everything right except closing inventory's amount.
  await expect(page.getByText('Stage 1 — Adjusting journal entries', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Trial balance as at 31 December 20X8')).toBeVisible()
  for (const [rowId, key] of Object.entries(FERNLEAF_A.journal.key.rows)) {
    const label = FERNLEAF_A.journal.config.rows.find((r) => r.id === rowId)!.label
    const opt = (id: string) => FERNLEAF_A.journal.config.options.find((o) => o.id === id)!.label
    await page.getByLabel(`${label} — debit account`).selectOption({ label: opt(key.debit) })
    await page.getByLabel(`${label} — credit account`).selectOption({ label: opt(key.credit) })
    await page
      .getByLabel(`${label} — amount`)
      .fill(rowId === 'closing-inv' ? '5000' : String(key.amount))
  }
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('17/18')
  await page.getByRole('button', { name: 'Next stage →' }).click()

  // Stage 2: SPL — all correct.
  await expect(page.getByText('Stage 2 — Statement of profit or loss').first()).toBeVisible()
  for (const [rowId, key] of Object.entries(FERNLEAF_A.spl.key.rows)) {
    const label = FERNLEAF_A.spl.config.rows.find((r) => r.id === rowId)!.label
    await page.getByLabel(`${label} — amount`).fill(String(key.amount))
  }
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('14/14')
  await page.getByRole('button', { name: 'Next stage →' }).click()

  // Stage 3: SOFP — all correct.
  for (const [rowId, key] of Object.entries(FERNLEAF_A.sofp.key.rows)) {
    const label = FERNLEAF_A.sofp.config.rows.find((r) => r.id === rowId)!.label
    await page.getByLabel(`${label} — amount`).fill(String(key.amount))
  }
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('status')).toContainText('17/17')
  await page.getByRole('button', { name: 'Finish case' }).click()

  // Case results: one root error, no independent noise, repair + retest.
  await expect(page.getByRole('heading', { name: 'Case complete' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('48/49')
  await expect(page.getByText('Closing inventory', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('root error').first()).toBeVisible()
  const repair = page.getByRole('link', { name: 'Repair this skill' })
  await expect(repair).toHaveCount(1)
  await expect(repair).toHaveAttribute('href', /a1d0e5ef-70d1-4a11-8a10-000000000002/)
  await expect(page.getByText('Solid:', { exact: false })).toBeVisible()
  const retest = page.getByRole('link', { name: /altered case/ })
  await expect(retest).toHaveAttribute('href', new RegExp(SPINE_B_ID))

  // Session recorded on the statements lane against the spine.
  expect(mock.sessions[0].lane).toBe('statements')
  expect(mock.sessions[0].spine_id).toBeTruthy()
  expect(mock.attempts).toHaveLength(3)
})
