import { test, expect, login } from './fixtures'

const FFA_NOTE = `---
tags: [reading]
---

# Consolidated Financial Statements

Parent plus subsidiary presented as a single economic entity, with intra-group balances eliminated on consolidation.

## Goodwill

Goodwill = consideration transferred + NCI at acquisition − fair value of net assets acquired. Impairment-tested annually, never amortised under IFRS.

## Cost of sales

Cost of sales = opening inventory + purchases − closing inventory. Watch for goods in transit.
`

test.describe('quiz mode', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'FFA 10 — Consolidation', slug: 'ffa-10', content: FFA_NOTE, folder: 'FFA' },
      {
        title: 'Marketing Mix',
        slug: 'marketing-mix',
        content: '# The 4 Ps\n\nProduct, price, place and promotion form the classic marketing mix framework.',
        folder: 'FBT',
      },
    ])
  })

  test('builds snap cards from note sections, answers hidden until asked', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    await expect(page.getByText('4 cards')).toBeVisible()
    const cards = page.locator('.quiz-card')
    await expect(cards).toHaveCount(4)

    const goodwill = cards.filter({ hasText: 'Goodwill' }).first()
    await expect(goodwill.locator('.quiz-kicker')).toContainText('Ask them to explain')
    await expect(goodwill.getByText('never amortised')).not.toBeVisible()

    await goodwill.getByRole('button', { name: 'Show answer' }).click()
    await expect(goodwill.locator('.quiz-answer')).toContainText('Impairment-tested annually')
    await goodwill.getByRole('button', { name: 'Hide answer' }).click()
    await expect(goodwill.getByText('never amortised')).not.toBeVisible()
  })

  test('folder filter narrows the deck; shuffle keeps the count', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    await page.getByLabel('Limit to folder').selectOption('FFA')
    await expect(page.getByText('3 cards')).toBeVisible()
    await expect(page.locator('.quiz-card', { hasText: 'The 4 Ps' })).toHaveCount(0)

    await page.getByRole('button', { name: '🔀 Shuffle' }).click()
    await expect(page.getByText('3 cards')).toBeVisible()
  })

  test('the feed snap-scrolls one card per viewport', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    const feed = page.locator('.quiz-feed')
    const snap = await feed.evaluate((el) => getComputedStyle(el).scrollSnapType)
    expect(snap).toContain('y')
    // Each card fills the feed viewport.
    const feedBox = (await feed.boundingBox())!
    const cardBox = (await page.locator('.quiz-card').first().boundingBox())!
    expect(Math.abs(cardBox.height - feedBox.height)).toBeLessThanOrEqual(2)
  })
})
