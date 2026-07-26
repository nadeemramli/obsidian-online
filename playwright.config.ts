import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'

// Managed sandboxes ship a pre-installed Chromium; CI installs its own.
const localChromium = '/opt/pw-browsers/chromium'
const executablePath = fs.existsSync(localChromium) ? localChromium : undefined

// Override when another dev server already occupies 5173: E2E_PORT=5199 npm run test:e2e
const port = Number(process.env.E2E_PORT || 5173)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
