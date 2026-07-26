// Exam delivery mode: timer, palette navigation, flagging, deferred feedback,
// submit-all, and auto-submit on expiry. Also exercises the three objective
// kinds end to end in the browser.
import { test, expect, login } from './fixtures'
import type { MockSupabase } from './mock-supabase'

function seedSampler(mock: MockSupabase) {
  const base = {
    prompt_md: '',
    source_slug: null,
    paper: 'FFA',
    syllabus_area: null,
    topic: 'Mixed',
    tags: [],
    difficulty: 'core',
    status: 'published',
    version: 1,
    created_by: null,
    created_at: '2026-07-27T00:00:00.000Z',
    updated_at: '2026-07-27T00:00:00.000Z',
  }
  mock.items.push(
    {
      ...base,
      id: 'ot-1',
      kind: 'single_select',
      title: 'OT: Which error unbalances the trial balance?',
      prompt_md: 'Which of the following errors would cause the trial balance totals to disagree?',
      config: {
        columns: [{ id: 'choice', label: 'Answer' }],
        rows: [{ id: 'answer', label: 'Your answer' }],
        options: [
          { id: 'a', label: 'A credit sale completely omitted' },
          { id: 'b', label: 'Rent debited to insurance' },
          { id: 'c', label: 'Only the debit side was posted' },
          { id: 'd', label: 'Wrong figure used in both accounts' },
        ],
      },
    } as any,
    {
      ...base,
      id: 'ot-2',
      kind: 'numeric_entry',
      title: 'OT: Straight-line depreciation charge',
      prompt_md: 'Cost $24,000, residual $4,000, five years. Annual straight-line charge?',
      config: {
        columns: [{ id: 'amount', label: 'Amount ($)' }],
        rows: [{ id: 'answer', label: 'Annual depreciation charge ($)' }],
        options: [],
      },
    } as any,
    {
      ...base,
      id: 'ot-3',
      kind: 'multi_select',
      title: 'OT: Books of prime entry',
      prompt_md: 'Which TWO of the following are books of prime entry?',
      config: {
        columns: [{ id: 'choices', label: 'Your decision' }],
        rows: [{ id: 'answer', label: 'Your answer' }],
        options: [
          { id: 'sdb', label: 'The sales day book' },
          { id: 'recv', label: 'The trade receivables ledger' },
          { id: 'journal', label: 'The journal' },
          { id: 'tb', label: 'The trial balance' },
        ],
      },
    } as any,
  )
  mock.answers.push(
    { item_id: 'ot-1', version: 1, answer_key: { correct: 'c', explanation_md: 'One-sided postings unbalance the TB.' } as any, overall_explanation_md: null },
    { item_id: 'ot-2', version: 1, answer_key: { amount: 4000, explanation_md: '(24,000 − 4,000) ÷ 5.' } as any, overall_explanation_md: null },
    { item_id: 'ot-3', version: 1, answer_key: { correct: ['journal', 'sdb'], policy: 'per_option', explanation_md: 'Day books and the journal.' } as any, overall_explanation_md: null },
  )
  mock.quizzes.push({
    id: 'quiz-exam', title: 'Section A sampler (timed)', description_md: '', paper: 'FFA',
    topic: 'Mixed', est_minutes: 10, timed: true, status: 'published', tags: [],
    difficulty: null, syllabus_area: null, created_by: null,
    created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
  })
  mock.quizItems.push(
    { quiz_id: 'quiz-exam', item_id: 'ot-1', position: 0 },
    { quiz_id: 'quiz-exam', item_id: 'ot-2', position: 1 },
    { quiz_id: 'quiz-exam', item_id: 'ot-3', position: 2 },
  )
}

test('exam mode: timer, palette, flags, deferred feedback, one submit for all', async ({
  page,
  mock,
}) => {
  seedSampler(mock)
  await login(page)
  await page.goto('/#/practice/specific')
  // Both entry points exist on the quiz card.
  await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible()
  await page.getByRole('link', { name: '⏱ Exam' }).click()

  // Timer + palette present; question 1 shown.
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.locator('.palette-chip')).toHaveCount(3)
  await expect(page.getByText('Question 1 of 3')).toBeVisible()

  // Answer Q1 (single select) — no correctness leaks before submit.
  await page.getByRole('radio', { name: 'Only the debit side was posted' }).check()
  await expect(page.getByText('— correct')).toHaveCount(0)

  // Flag Q1 for review; chip reflects it.
  await page.getByRole('button', { name: /Flag for review/ }).click()
  await expect(page.locator('.palette-chip.flagged')).toHaveCount(1)

  // Jump straight to Q3 via the palette (free navigation).
  await page.getByRole('button', { name: /Question 3/ }).click()
  await expect(page.getByText('Question 3 of 3')).toBeVisible()
  await page.getByRole('checkbox', { name: 'The sales day book' }).check()
  await page.getByRole('checkbox', { name: 'The journal' }).check()

  // Back to Q2 (numeric).
  await page.getByRole('button', { name: /Question 2/ }).click()
  await page.getByLabel('Annual depreciation charge ($) — amount').fill('4,000')

  // All answered → submit without confirm dialog.
  await expect(page.locator('.palette-chip.answered')).toHaveCount(3)
  await page.getByRole('button', { name: 'Submit exam' }).click()

  await expect(page.getByRole('heading', { name: 'Exam submitted' })).toBeVisible()
  // 1 + 1 + 4 independent cells, all correct.
  await expect(page.getByRole('status').last()).toContainText('6/6')
  expect(mock.attempts).toHaveLength(3)

  // Per-question review expands to full feedback, flag preserved in summary.
  const first = page.locator('.exam-results-item').first()
  await expect(first.getByText('⚑')).toBeVisible()
  await first.locator('summary').click()
  await expect(first.getByText('— correct').first()).toBeVisible()
})

test('exam mode auto-submits exactly once when the timer expires', async ({ page, mock }) => {
  seedSampler(mock)
  await login(page)
  await page.goto('/#/practice/quiz/quiz-exam?mode=exam&t=2')
  await expect(page.getByRole('timer')).toBeVisible()
  // Answer only the numeric question, then let the clock run out.
  await page.getByRole('button', { name: /Question 2/ }).click()
  await page.getByLabel('Annual depreciation charge ($) — amount').fill('4000')

  await expect(page.getByRole('heading', { name: 'Exam submitted' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Time expired')).toBeVisible()
  // Numeric 1/1; single blank 0/1; blank multi earns 2/4 under per-option
  // marking (the two distractors were correctly left unticked).
  await expect(page.getByRole('status').last()).toContainText('3/6')
  expect(mock.attempts).toHaveLength(3) // every question submitted once, blank or not
})
