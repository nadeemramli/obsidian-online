import { test, expect, login } from './fixtures'

test.describe('wikilinks and backlinks', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      {
        title: 'Neural Networks',
        slug: 'neural-networks',
        content:
          'Trained with [[Backpropagation]]. Also known as the [[Backpropagation|backprop algorithm]]. See [[Missing Note]].',
      },
      { title: 'Backpropagation', slug: 'backpropagation', content: 'Gradient descent applied to layers.' },
    ])
  })

  test('renders wikilinks and navigates to an existing note', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Neural Networks').click()

    const link = page.locator('article.markdown a.wikilink', { hasText: 'Backpropagation' }).first()
    await expect(link).not.toHaveClass(/missing/)
    await link.click()
    await expect(page).toHaveURL(/#\/note\/backpropagation$/)
    await expect(page.getByRole('heading', { name: 'Backpropagation' })).toBeVisible()
  })

  test('renders alias wikilinks with the alias text', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Neural Networks').click()
    const alias = page.locator('article.markdown a.wikilink', { hasText: 'backprop algorithm' })
    await expect(alias).toBeVisible()
    await expect(alias).toHaveAttribute('href', '#/note/backpropagation')
  })

  test('flags links to missing notes and offers to create them', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Neural Networks').click()

    const missing = page.locator('article.markdown a.wikilink.missing', { hasText: 'Missing Note' })
    await expect(missing).toBeVisible()
    await missing.click()

    await expect(page.getByRole('heading', { name: 'Note not found' })).toBeVisible()
    await page.getByRole('link', { name: /Create/ }).click()
    await expect(page.getByPlaceholder('Note title')).toHaveValue('missing note')

    // Complete the loop: create it and verify the old link resolves now.
    await page.getByPlaceholder('# Start writing in markdown…').fill('Now it exists.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'missing note' })).toBeVisible()

    await page.locator('.notelist').getByText('Neural Networks').click()
    await expect(
      page.locator('article.markdown a.wikilink', { hasText: 'Missing Note' }),
    ).not.toHaveClass(/missing/)
  })

  test('lists backlinks on the target note', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Backpropagation').click()

    const backlinks = page.locator('section.backlinks')
    await expect(backlinks.getByRole('heading', { name: 'Linked from (1)' })).toBeVisible()
    await backlinks.getByRole('link', { name: 'Neural Networks' }).click()
    await expect(page).toHaveURL(/#\/note\/neural-networks$/)
  })

  test('shows zero backlinks when nothing links here', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Neural Networks').click()
    await expect(page.getByRole('heading', { name: 'Linked from (0)' })).toBeVisible()
    await expect(page.getByText('No other notes link here yet.')).toBeVisible()
  })
})
