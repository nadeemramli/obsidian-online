import { test, expect } from '@playwright/test'

/**
 * Optional smoke test against the REAL Supabase backend — no mocks.
 * Runs only when credentials are provided (and network egress to
 * *.supabase.co is allowed):
 *
 *   E2E_LIVE_EMAIL=you@example.com E2E_LIVE_PASSWORD=... npx playwright test live-smoke
 *
 * It creates one uniquely-named note and deletes it again, leaving the
 * vault as it found it.
 */
const EMAIL = process.env.E2E_LIVE_EMAIL
const PASSWORD = process.env.E2E_LIVE_PASSWORD

test.describe('live backend smoke', () => {
  test.skip(!EMAIL || !PASSWORD, 'set E2E_LIVE_EMAIL / E2E_LIVE_PASSWORD to run against the real backend')

  test('sign in, create a note, read it back, delete it', async ({ page }) => {
    const title = `E2E Smoke ${Date.now()}`

    await page.goto('/#/login')
    await page.getByPlaceholder('Email').fill(EMAIL!)
    await page.getByPlaceholder('Password').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('link', { name: '+ New note' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill(title)
    await page.getByPlaceholder('# Start writing in markdown…').fill('# Live check\n\nRound trip through the real backend.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Live check' })).toBeVisible()

    await page.getByRole('link', { name: 'Edit' }).click()
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.notelist').getByText(title)).not.toBeVisible()
  })
})
