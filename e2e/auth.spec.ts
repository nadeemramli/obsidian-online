import { test, expect, login, TEST_EMAIL, TEST_PASSWORD } from './fixtures'

test.describe('authentication', () => {
  test('redirects signed-out visitors to the login page', async ({ page, mock }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '📓 Vault' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('rejects wrong credentials with a visible error', async ({ page, mock }) => {
    await page.goto('/#/login')
    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator('.msg')).toHaveText('Invalid login credentials')
    await expect(page.getByRole('link', { name: '+ New note' })).not.toBeVisible()
  })

  test('signs in and lands on an empty vault', async ({ page, mock }) => {
    await login(page)
    await expect(page.getByRole('heading', { name: 'All notes' })).toBeVisible()
    await expect(page.getByText('No notes yet. Create your first one.')).toBeVisible()
  })

  test('signs out and protects the vault again', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    // Navigating back to the app should bounce to login, not show notes.
    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('shows the signed-in email on the settings page', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText(`Signed in as ${TEST_EMAIL}`)).toBeVisible()
  })
})
