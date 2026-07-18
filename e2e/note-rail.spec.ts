import { test, expect, login } from './fixtures'

const LONG_NOTE = `---
tags: [reading]
---

# Overview

Linked to [[Bayes]] and [[Missing Concept]].

${'Filler paragraph.\n\n'.repeat(40)}

## Methods

\`\`\`js
// # not a heading
\`\`\`

More text.

### Sampling details

Even more text.

## Results

Done.
`

test.describe('note right rail', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Study Note', slug: 'study-note', content: LONG_NOTE, folder: 'Statistics' },
      { title: 'Bayes', slug: 'bayes', content: 'Priors and posteriors.', folder: 'Statistics' },
      { title: 'Cites Study', slug: 'cites-study', content: 'See [[Study Note]].', folder: 'Books' },
    ])
  })

  test('outline lists headings (skipping code fences) and scrolls on click', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.locator('.notelist').getByText('Study Note').click()

    const outline = page.locator('.rail-section.outline')
    await expect(outline.locator('.outline-item')).toHaveText([
      'Overview',
      'Methods',
      'Sampling details',
      'Results',
    ])

    const scrollTop = () => page.locator('main.content').evaluate((el) => el.scrollTop)
    expect(await scrollTop()).toBe(0)
    // Scroll-spy: at the top, the first heading is active.
    await expect(outline.locator('.outline-item.active')).toHaveText('Overview')

    await outline.locator('.outline-item', { hasText: 'Results' }).click()
    await expect
      .poll(scrollTop, { timeout: 5000 })
      .toBeGreaterThan(200)
    await expect(page.locator('article.markdown h2#h-3')).toBeInViewport()
    // Scroll-spy follows: Results is now the active section.
    await expect(outline.locator('.outline-item.active')).toHaveText('Results')
  })

  test('local graph shows outgoing links, backlinks, and missing notes', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Study Note').click()

    const graph = page.locator('.local-graph')
    await expect(graph.locator('g.graph-node.center[data-slug="study-note"]')).toBeVisible()
    await expect(graph.locator('g.graph-node[data-slug="bayes"]')).toBeVisible()
    await expect(graph.locator('g.graph-node[data-slug="cites-study"]')).toBeVisible()
    await expect(graph.locator('g.graph-node.missing[data-slug="missing-concept"]')).toBeVisible()
  })

  test('clicking a local-graph neighbor navigates to it', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Study Note').click()
    await page.locator('.local-graph g.graph-node[data-slug="bayes"] circle').click()
    await expect(page).toHaveURL(/#\/note\/bayes$/)
    await expect(page.getByRole('heading', { name: 'Bayes' })).toBeVisible()
  })

  test('shows an empty state when a note has no connections', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Bayes').click()
    // Bayes is linked FROM Study Note, so it has a backlink — use a fresh note.
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('Loner')
    await page.getByPlaceholder('# Start writing in markdown…').fill('# Alone\n\nNothing links here.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('No connections yet.')).toBeVisible()
  })
})
