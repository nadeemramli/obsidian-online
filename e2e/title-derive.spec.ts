import { test, expect, login } from './fixtures'

const FM_NOTE = `---
title: "Central Limit Theorem"
tags: [statistics]
---

Sample means approach a normal distribution.
`

test.describe('title auto-derivation on save', () => {
  test('uses the frontmatter title when the title field is empty', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('# Start writing in markdown…').fill(FM_NOTE)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/#\/note\/central-limit-theorem$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Central Limit Theorem' })).toBeVisible()
  })

  test('falls back to the first heading when there is no frontmatter title', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page
      .getByPlaceholder('# Start writing in markdown…')
      .fill('# Law of Large Numbers\n\nMore samples, closer to the mean.')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/#\/note\/law-of-large-numbers$/)
  })

  test('typed titles still win over derived ones', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('My Own Title')
    await page.getByPlaceholder('# Start writing in markdown…').fill('# Something Else')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'My Own Title' })).toBeVisible()
  })

  test('asks for a title only when none can be derived, and focuses the field', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('# Start writing in markdown…').fill('just plain text, no heading')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText(/Please add a title/)).toBeVisible()
    await expect(page.getByPlaceholder('Note title')).toBeFocused()
  })
})
