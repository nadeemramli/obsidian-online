import { test, expect, login } from './fixtures'

test.describe('folder system', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Inbox Note', slug: 'inbox-note', content: 'unfiled' },
      { title: 'Sampling', slug: 'sampling', content: 'stats', folder: 'Statistics' },
      { title: 'Bayes', slug: 'bayes', content: 'stats', folder: 'Statistics' },
      { title: 'Chapter 1', slug: 'chapter-1', content: 'book', folder: 'Books/Stats 101' },
    ])
  })

  test('sidebar groups notes into a collapsible folder tree', async ({ page, mock }) => {
    await login(page)
    const list = page.locator('.notelist')

    await expect(list.getByRole('button', { name: /Statistics/ })).toBeVisible()
    await expect(list.getByText('Sampling')).toBeVisible()
    await expect(list.getByText('Inbox Note')).toBeVisible()

    // Nested folder: Books ▸ Stats 101 ▸ Chapter 1
    await expect(list.getByRole('button', { name: /Books/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /Stats 101/ })).toBeVisible()
    await expect(list.getByText('Chapter 1')).toBeVisible()

    // Collapsing hides contents.
    await list.getByRole('button', { name: /Statistics/ }).click()
    await expect(list.getByText('Sampling')).not.toBeVisible()
    await expect(list.getByText('Bayes')).not.toBeVisible()
    await list.getByRole('button', { name: /Statistics/ }).click()
    await expect(list.getByText('Sampling')).toBeVisible()
  })

  test('folder notes sort A→Z with numeric-aware ordering', async ({ page, mock }) => {
    mock.seed([
      { title: '10 — Control and Audit', slug: 'ch-10', content: 'x', folder: 'FBT' },
      { title: '02 — The Business Environment', slug: 'ch-02', content: 'x', folder: 'FBT' },
      { title: 'FBT — Course Summary', slug: 'summary', content: 'x', folder: 'FBT' },
      { title: '05 — Micro-economic Factors', slug: 'ch-05', content: 'x', folder: 'FBT' },
    ])
    await login(page)
    const items = page.locator('.notelist .noteitem')
    // Statistics folder sorts alphabetically too: Bayes before Sampling.
    await expect(items).toHaveText([
      // Books/Stats 101
      'Chapter 1',
      // FBT — numeric-aware: 02 < 05 < 10, letters after numbers
      '02 — The Business Environment',
      '05 — Micro-economic Factors',
      '10 — Control and Audit',
      'FBT — Course Summary',
      // Statistics
      'Bayes',
      'Sampling',
      // vault root
      'Inbox Note',
    ])
  })

  test('notes inside a folder stack vertically, not side by side', async ({ page, mock }) => {
    await login(page)
    const list = page.locator('.notelist')
    const sampling = await list.getByText('Sampling').boundingBox()
    const bayes = await list.getByText('Bayes').boundingBox()
    expect(sampling && bayes).toBeTruthy()
    expect(sampling!.x).toBe(bayes!.x) // same indent
    expect(sampling!.y).not.toBe(bayes!.y) // stacked, no horizontal overflow
    expect(sampling!.width).toBeLessThanOrEqual(280) // fits the sidebar
  })

  test('creating a note with a folder files it in the tree and shows a breadcrumb', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('Regression')
    await page.getByPlaceholder('Folder (optional', { exact: false }).fill('Statistics')
    await page.getByPlaceholder('# Start writing in markdown…').fill('y = mx + b')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator('.crumb')).toHaveText('📁 Statistics')
    await expect(page.locator('.notelist').getByText('Regression')).toBeVisible()
  })

  test('editing a note can move it to another folder', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Inbox Note').click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByPlaceholder('Folder (optional', { exact: false }).fill('Archive')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('.crumb')).toHaveText('📁 Archive')
    await expect(page.locator('.notelist').getByRole('button', { name: /Archive/ })).toBeVisible()
  })

  test('search flattens the tree and shows folder context', async ({ page, mock }) => {
    await login(page)
    await page.getByPlaceholder('Search notes…').fill('stats')
    const list = page.locator('.notelist')
    await expect(list.getByText('Sampling')).toBeVisible()
    await expect(list.getByText('Bayes')).toBeVisible()
    await expect(list.locator('.noteitem-folder', { hasText: 'Statistics' }).first()).toBeVisible()
    await expect(list.getByRole('button', { name: /Statistics/ })).not.toBeVisible()
  })
})
