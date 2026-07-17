import { test, expect, login } from './fixtures'

test.describe('graph view', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Alpha', slug: 'alpha', content: 'Links to [[Beta]] and [[Gamma]].' },
      { title: 'Beta', slug: 'beta', content: 'Links to [[Gamma]].' },
      { title: 'Gamma', slug: 'gamma', content: 'No outgoing links.' },
      { title: 'Island', slug: 'island', content: 'Not linked to anything.' },
    ])
  })

  test('renders a node per note and an edge per resolved wikilink', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()

    await expect(page).toHaveURL(/#\/graph$/)
    await expect(page.getByText('4 notes · 3 links')).toBeVisible()
    await expect(page.locator('svg.graph g.graph-node')).toHaveCount(4)
    await expect(page.locator('svg.graph line.graph-edge')).toHaveCount(3)
    await expect(page.locator('g.graph-node[data-slug="island"]')).toBeVisible()
  })

  test('clicking a node opens the note', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()
    await page.locator('g.graph-node[data-slug="beta"]').click()
    await expect(page).toHaveURL(/#\/note\/beta$/)
    await expect(page.getByRole('heading', { name: 'Beta' })).toBeVisible()
  })

  test('shows an empty state without notes', async ({ page, mock }) => {
    mock.notes = []
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()
    await expect(page.getByText('No notes yet. Create some and link them')).toBeVisible()
  })
})
