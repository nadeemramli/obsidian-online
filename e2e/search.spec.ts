import { test, expect, login } from './fixtures'

test.describe('sidebar search', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Statistics Basics', slug: 'statistics-basics', content: 'mean, median, mode' },
      { title: 'Linear Algebra', slug: 'linear-algebra', content: 'vectors and matrices' },
      { title: 'Probability', slug: 'probability', content: 'bayes theorem and priors' },
    ])
  })

  test('filters notes by title', async ({ page, mock }) => {
    await login(page)
    await page.getByPlaceholder('Search notes…').fill('algebra')
    const list = page.locator('.notelist')
    await expect(list.getByText('Linear Algebra')).toBeVisible()
    await expect(list.getByText('Statistics Basics')).not.toBeVisible()
    await expect(list.getByText('Probability')).not.toBeVisible()
  })

  test('filters notes by content', async ({ page, mock }) => {
    await login(page)
    await page.getByPlaceholder('Search notes…').fill('bayes')
    const list = page.locator('.notelist')
    await expect(list.getByText('Probability')).toBeVisible()
    await expect(list.getByText('Linear Algebra')).not.toBeVisible()
  })

  test('shows an empty state for no matches, and clears back', async ({ page, mock }) => {
    await login(page)
    const search = page.getByPlaceholder('Search notes…')
    await search.fill('zzz-no-such-note')
    await expect(page.locator('.notelist').getByText('No notes found')).toBeVisible()
    await search.clear()
    await expect(page.locator('.notelist .noteitem')).toHaveCount(3)
  })
})
