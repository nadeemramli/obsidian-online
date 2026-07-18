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

  test('zoom buttons and reset change the viewport transform', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()

    const viewport = page.locator('svg.graph > g').first()
    const before = await viewport.getAttribute('transform')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    const zoomed = await viewport.getAttribute('transform')
    expect(zoomed).not.toBe(before)
    await page.getByRole('button', { name: 'Reset view' }).click()
    const reset = await viewport.getAttribute('transform')
    expect(reset).not.toBe(zoomed)
  })

  test('dragging the background pans the graph', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()

    const svg = page.locator('svg.graph')
    const viewport = page.locator('svg.graph > g').first()
    const before = await viewport.getAttribute('transform')
    const box = (await svg.boundingBox())!
    // Top-left corner: inside the window viewport and clear of nodes
    // (content is centered by fitToView).
    await page.mouse.move(box.x + 15, box.y + 15)
    await page.mouse.down()
    await page.mouse.move(box.x + 135, box.y + 85, { steps: 5 })
    await page.mouse.up()
    expect(await viewport.getAttribute('transform')).not.toBe(before)
  })

  test('dragging a node moves it without opening the note', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()
    // Let the simulation settle so drift doesn't confound the assertion.
    await page.waitForTimeout(700)

    const node = page.locator('g.graph-node[data-slug="island"]')
    const before = (await node.boundingBox())!
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2 + 8)
    await page.mouse.down()
    await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 68, {
      steps: 8,
    })
    await page.mouse.up()

    await expect(page).toHaveURL(/#\/graph$/) // still on the graph — a drag is not a click
    const after = (await node.boundingBox())!
    const dist = Math.hypot(after.x - before.x, after.y - before.y)
    expect(dist).toBeGreaterThan(30)
  })

  test('the filter box dims non-matching nodes', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()

    await page.getByPlaceholder('Filter notes…').fill('beta')
    await expect(page.locator('g.graph-node[data-slug="beta"]')).not.toHaveClass(/dim/)
    await expect(page.locator('g.graph-node[data-slug="alpha"]')).toHaveClass(/dim/)
    await expect(page.locator('g.graph-node[data-slug="island"]')).toHaveClass(/dim/)

    await page.getByPlaceholder('Filter notes…').clear()
    await expect(page.locator('g.graph-node[data-slug="alpha"]')).not.toHaveClass(/dim/)
  })

  test('shows an empty state without notes', async ({ page, mock }) => {
    mock.notes = []
    await login(page)
    await page.getByRole('link', { name: 'Graph' }).click()
    await expect(page.getByText('No notes yet. Create some and link them')).toBeVisible()
  })
})
