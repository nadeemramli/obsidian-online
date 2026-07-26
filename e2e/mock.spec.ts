// Mock assembly: Section A (objective pool) + Section B (case stages) under
// one timer, one submission, per-section subtotals.
import { test, expect, login } from './fixtures'

test('mock assembles both sections and submits everything once', async ({ page, mock }) => {
  mock.seedFernleaf()
  // Two small OTs for Section A.
  const base = {
    prompt_md: '', source_slug: null, paper: 'FFA', syllabus_area: null, topic: 'Mixed',
    tags: [], difficulty: 'core', status: 'published', version: 1, created_by: null,
    created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
  }
  mock.items.push(
    {
      ...base, id: 'ot-a', kind: 'single_select', title: 'OT A',
      prompt_md: 'Pick B.',
      config: {
        columns: [{ id: 'choice', label: 'Answer' }],
        rows: [{ id: 'answer', label: 'Your answer' }],
        options: [{ id: 'a', label: 'Choice A' }, { id: 'b', label: 'Choice B' }],
      },
    } as any,
    {
      ...base, id: 'ot-b', kind: 'numeric_entry', title: 'OT B',
      prompt_md: 'Enter 10.',
      config: {
        columns: [{ id: 'amount', label: 'Amount ($)' }],
        rows: [{ id: 'answer', label: 'Answer ($)' }],
        options: [],
      },
    } as any,
  )
  mock.answers.push(
    { item_id: 'ot-a', version: 1, answer_key: { correct: 'b', explanation_md: 'B.' } as any, overall_explanation_md: null },
    { item_id: 'ot-b', version: 1, answer_key: { amount: 10, explanation_md: 'Ten.' } as any, overall_explanation_md: null },
  )

  await login(page)
  await page.goto('/#/practice/mock?t=900')
  await expect(page.getByRole('timer')).toBeVisible()
  // 2 OTs + 3 case stages = 5 palette chips; section label on the question head.
  await expect(page.locator('.palette-chip')).toHaveCount(5)
  await expect(page.getByText('Section A · Question 1 of 5')).toBeVisible()

  // Answer the two OTs correctly.
  await page.getByRole('radio', { name: 'Choice B' }).check()
  await page.getByRole('button', { name: /Question 2/ }).click()
  await page.getByLabel('Answer ($) — amount').fill('10')

  // Jump into Section B and confirm the case stage renders.
  await page.getByRole('button', { name: /Question 3/ }).click()
  await expect(page.getByText(/Section B — Case · Question 3 of 5/)).toBeVisible()
  await expect(page.getByText('Trial balance as at 31 December 20X8')).toBeVisible()

  // Submit with the case unanswered (confirm dialog).
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Submit exam' }).click()
  await expect(page.getByRole('heading', { name: 'Exam submitted' })).toBeVisible()

  // Per-section subtotals: Section A full marks, Section B zero.
  await expect(page.getByText('Section A', { exact: true })).toBeVisible()
  const status = page.getByRole('status').last()
  await expect(status).toContainText('2/2')
  expect(mock.attempts).toHaveLength(5)
  expect(mock.sessions[0].status).toBe('completed')
})
