import { test, expect, login } from './fixtures'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test.describe('mobile layout', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Sampling', slug: 'sampling', content: '# Sampling\n\nStats note.', folder: 'Statistics' },
      { title: 'Bias', slug: 'bias', content: 'See [[Sampling]].', folder: 'Statistics' },
    ])
  })

  test('sidebar opens as a drawer from the hamburger and closes on navigation', async ({
    page,
    mock,
  }) => {
    await login(page)

    // Sidebar is off-canvas; the topbar hamburger is the way in.
    const sidebar = page.locator('aside.sidebar')
    await expect(page.locator('.mobile-topbar')).toBeVisible()
    await expect(sidebar).not.toBeInViewport()

    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(sidebar).toBeInViewport()
    await expect(page.locator('.scrim')).toBeVisible()

    // Picking a note navigates and closes the drawer.
    await sidebar.getByText('Sampling').click()
    await expect(page.locator('.page-head h1')).toHaveText('Sampling')
    await expect(sidebar).not.toBeInViewport()
    await expect(page.locator('.scrim')).not.toBeVisible()
  })

  test('the scrim closes the drawer without navigating', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.locator('aside.sidebar')).toBeInViewport()
    await page.locator('.scrim').click({ position: { x: 380, y: 400 } })
    await expect(page.locator('aside.sidebar')).not.toBeInViewport()
  })

  test('note view fits the phone: no rail, readable header', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.locator('aside.sidebar').getByText('Sampling').click()

    await expect(page.locator('.note-rail')).not.toBeVisible()
    // No horizontal page overflow.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
