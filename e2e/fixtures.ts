import { test as base, expect, type Page } from '@playwright/test'
import { MockSupabase, TEST_EMAIL, TEST_PASSWORD } from './mock-supabase'

export { expect, TEST_EMAIL, TEST_PASSWORD }

type Fixtures = {
  mock: MockSupabase
}

// Every test gets a fresh in-memory backend installed before the app loads.
export const test = base.extend<Fixtures>({
  mock: async ({ page }, use) => {
    const mock = new MockSupabase()
    await mock.install(page)
    await use(mock)
  },
})

export async function login(page: Page) {
  await page.goto('/#/login')
  await page.getByPlaceholder('Email').fill(TEST_EMAIL)
  await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: '+ New note' })).toBeVisible()
}

export async function createNoteViaUI(page: Page, title: string, content: string) {
  await page.getByRole('link', { name: '+ New note' }).click()
  await page.getByPlaceholder('Note title').fill(title)
  await page.getByPlaceholder('# Start writing in markdown…').fill(content)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
}
