import { test, expect, login } from './fixtures'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('screenshots via private storage', () => {
  test('renders storage: images through signed URLs', async ({ page, mock }) => {
    mock.seed([
      {
        title: 'Figure 3.1',
        slug: 'figure-3-1',
        content: 'The diagram:\n\n![screenshot](storage:abc123.png)\n',
      },
    ])
    await login(page)
    await page.locator('.notelist').getByText('Figure 3.1').click()

    const img = page.locator('article.markdown img')
    await expect(img).toBeVisible()
    await expect(img).toHaveAttribute('src', /token=mock-token/)
  })

  test('uploading a screenshot inserts a storage: markdown reference', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('With Screenshot')

    await page.locator('label.upload input[type="file"]').setInputFiles({
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })

    const textarea = page.getByPlaceholder('# Start writing in markdown…')
    await expect(textarea).toHaveValue(/!\[screenshot\]\(storage:[0-9a-f-]+\.png\)/)

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'With Screenshot' })).toBeVisible()
    await expect(page.locator('article.markdown img')).toHaveAttribute('src', /token=mock-token/)
  })
})
