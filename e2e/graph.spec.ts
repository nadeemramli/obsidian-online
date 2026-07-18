import { test, expect, login } from './fixtures'

test.describe('graph view', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Alpha', slug: 'alpha', content: 'Links to [[Beta]] and [[Gamma]].', folder: 'Statistics' },
      { title: 'Beta', slug: 'beta', content: 'Links to [[Gamma]].', folder: 'Statistics' },
      { title: 'Gamma', slug: 'gamma', content: 'No outgoing links.', folder: 'Books/Stats 101' },
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

  test('colors nodes by top-level folder with a matching legend', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()

    const legend = page.locator('.graph-legend')
    await expect(legend.getByText('Vault root')).toBeVisible()
    await expect(legend.getByText('Statistics')).toBeVisible()
    await expect(legend.getByText('Books')).toBeVisible()

    const fill = (slug: string) =>
      page.locator(`g.graph-node[data-slug="${slug}"] circle`).getAttribute('fill')
    const [alpha, beta, gamma, island] = await Promise.all([
      fill('alpha'),
      fill('beta'),
      fill('gamma'),
      fill('island'),
    ])
    expect(alpha).toBe(beta) // same folder → same color
    expect(gamma).not.toBe(alpha) // different folder → different color
    expect(island).not.toBe(alpha)
    expect(island).not.toBe(gamma)
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
