import { test, expect, login } from './fixtures'

const FRONTMATTER_NOTE = `---
book: "Statistics for Dummies"
chapter: 3
tags: [reading, statistics]
source: VitalSource
---

# Sampling

Key point: ==the sample must be random==.

> [!warning] Common pitfall
> Convenience samples bias everything.

Related: #probability and [[Distributions]].
`

test.describe('Obsidian formatting', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Sampling', slug: 'sampling', content: FRONTMATTER_NOTE },
      { title: 'Distributions', slug: 'distributions', content: 'Normal, binomial, poisson.' },
      { title: 'Reading List', slug: 'reading-list', content: 'Start here: ![[Sampling]] then ![[No Such Note]].' },
    ])
  })

  test('renders YAML frontmatter as a properties panel, not raw text', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Sampling').click()

    const props = page.locator('section.props')
    await expect(props).toBeVisible()
    await expect(props.getByText('book')).toBeVisible()
    await expect(props.getByText('Statistics for Dummies')).toBeVisible()
    await expect(props.getByText('#reading')).toBeVisible()
    await expect(props.getByText('#statistics')).toBeVisible()
    await expect(props.getByText('VitalSource')).toBeVisible()

    // The raw delimiters must not leak into the rendered article.
    await expect(page.locator('article.markdown').getByText('---')).not.toBeVisible()
    await expect(page.locator('article.markdown').getByText('book:')).not.toBeVisible()
  })

  test('renders ==highlights== as <mark>', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Sampling').click()
    await expect(page.locator('article.markdown mark')).toHaveText('the sample must be random')
  })

  test('renders [!type] blockquotes as styled callouts', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Sampling').click()

    const callout = page.locator('article.markdown blockquote.callout.callout-warning')
    await expect(callout).toBeVisible()
    await expect(callout.locator('.callout-title')).toHaveText('Common pitfall')
    await expect(callout).toContainText('Convenience samples bias everything.')
  })

  test('renders #tags as chips', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Sampling').click()
    await expect(page.locator('article.markdown span.tag')).toHaveText('#probability')
  })

  test('embeds other notes with ![[...]]', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Reading List').click()

    const embed = page.locator('article.markdown .embed').first()
    await expect(embed.locator('.embed-title')).toHaveText('Sampling')
    // Embedded body renders the target's markdown (frontmatter stripped).
    await expect(embed.getByRole('heading', { name: 'Sampling' })).toBeVisible()
    await expect(embed.locator('mark')).toHaveText('the sample must be random')
    await expect(embed.getByText('book:')).not.toBeVisible()

    // Unknown embed target degrades to a missing wikilink.
    await expect(page.locator('article.markdown a.wikilink.missing', { hasText: 'no-such-note' })).toBeVisible()
  })

  test('frontmatter never leaks into home page excerpts', async ({ page, mock }) => {
    await login(page)
    const card = page.locator('.notecard[href="#/note/sampling"]')
    await expect(card).toBeVisible()
    await expect(card).not.toContainText('book')
    await expect(card).not.toContainText('VitalSource')
  })

  test('editor preview shows the properties panel too', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Sampling').click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('section.props').getByText('Statistics for Dummies')).toBeVisible()
    await expect(page.locator('article.markdown blockquote.callout')).toBeVisible()
  })
})
