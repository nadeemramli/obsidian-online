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

const DEPRECIATION_NOTE = `# Depreciation

Intro text about spreading cost over useful life, matching and prudence considerations.

## Methods

Both methods allocate the depreciable amount over the asset's life in some pattern.

### Straight-line method

Equal charge each year: (cost − residual value) / useful life. Simple and common for buildings.

## Visual Model

\`\`\`mermaid
flowchart TD
  A[Cost] --> B[Charge]
\`\`\`

> [!formula] Cost of sales
> Opening inventory + purchases − closing inventory.
`

test.describe('quiz mode', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'FFA 10 — Consolidation', slug: 'ffa-10', content: FFA_NOTE, folder: 'ACCA/FFA' },
      { title: 'FFA 07 — Depreciation', slug: 'ffa-07', content: DEPRECIATION_NOTE, folder: 'ACCA/FFA' },
      {
        title: 'Marketing Mix',
        slug: 'marketing-mix',
        content: '# The 4 Ps\n\nProduct, price, place and promotion form the classic marketing mix framework.',
        folder: 'ACCA/FBT',
      },
    ])
  })

  test('cards are specific: parent context, no meta/diagram sections, answers hidden', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    const cards = page.locator('.quiz-card')
    // Sub-headings carry their parent for specificity.
    await expect(
      cards.filter({ hasText: 'Explain: Methods — Straight-line method' }).first(),
    ).toBeVisible()
    // "Visual Model" (stoplisted, diagram-only) makes no card.
    await expect(cards.filter({ hasText: 'Visual Model' })).toHaveCount(0)

    const goodwill = cards.filter({ hasText: 'Explain: Goodwill' }).first()
    await expect(goodwill.getByText('never amortised')).not.toBeVisible()
    await goodwill.getByRole('button', { name: 'Show answer' }).click()
    await expect(goodwill.locator('.quiz-answer')).toContainText('Impairment-tested annually')
  })

  test('titled formula callouts become "Give the formula" cards', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    const formula = page.locator('.quiz-card', { hasText: 'Give the formula: Cost of sales' }).first()
    await expect(formula).toBeVisible()
    await formula.scrollIntoViewIfNeeded()
    await formula.getByRole('button', { name: 'Show answer' }).click()
    await expect(formula.locator('.quiz-answer')).toContainText('Opening inventory + purchases')
  })

  test('nested folder filter: exact subject or whole parent tree', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    // FFA only — the FBT card disappears.
    await page.getByLabel('Limit to folder').selectOption('ACCA/FFA')
    await expect(page.locator('.quiz-card', { hasText: 'The 4 Ps' })).toHaveCount(0)
    await expect(page.locator('.quiz-card', { hasText: 'Explain: Goodwill' })).toHaveCount(1)

    // The parent covers both subjects.
    await page.getByLabel('Limit to folder').selectOption('ACCA')
    await expect(page.locator('.quiz-card', { hasText: 'The 4 Ps' })).toHaveCount(1)
    await expect(page.locator('.quiz-card', { hasText: 'Explain: Goodwill' })).toHaveCount(1)

    await page.getByRole('button', { name: '🔀 Shuffle' }).click()
    await expect(page.locator('.quiz-card', { hasText: 'Explain: Goodwill' })).toHaveCount(1)
  })

  test('the feed snap-scrolls one card per viewport', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Quiz' }).click()

    const feed = page.locator('.quiz-feed')
    const snap = await feed.evaluate((el) => getComputedStyle(el).scrollSnapType)
    expect(snap).toContain('y')
    const feedBox = (await feed.boundingBox())!
    const cardBox = (await page.locator('.quiz-card').first().boundingBox())!
    expect(Math.abs(cardBox.height - feedBox.height)).toBeLessThanOrEqual(2)
  })
})
