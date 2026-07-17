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

  test('uploading a screenshot inserts an Obsidian ![[image]] link', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('With Screenshot')

    await page.locator('label.upload input[type="file"]').setInputFiles({
      name: 'My Shot.PNG',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })

    const textarea = page.getByPlaceholder('# Start writing in markdown…')
    await expect(textarea).toHaveValue(/!\[\[my-shot\.png\]\]/)

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'With Screenshot' })).toBeVisible()
    await expect(page.locator('article.markdown img')).toHaveAttribute('src', /token=mock-token/)
  })

  test('renders ![[image.png]] embeds, with optional |width', async ({ page, mock }) => {
    mock.seed([
      {
        title: 'Diagrams',
        slug: 'diagrams',
        content: 'Full size:\n\n![[flow.png]]\n\nSmall:\n\n![[flow.png|240]]\n',
      },
    ])
    await login(page)
    await page.locator('.notelist').getByText('Diagrams').click()

    const imgs = page.locator('article.markdown img')
    await expect(imgs).toHaveCount(2)
    await expect(imgs.nth(0)).toHaveAttribute('src', /flow\.png.*token=mock-token/)
    await expect(imgs.nth(1)).toHaveAttribute('width', '240')
  })

  test('dropping an image onto the editor uploads it and inserts ![[name]]', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    const textarea = page.getByPlaceholder('# Start writing in markdown…')

    const dt = await page.evaluateHandle((bytes) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(
        new File([new Uint8Array(bytes)], 'sampling diagram.png', { type: 'image/png' }),
      )
      return dataTransfer
    }, Array.from(PNG_1X1))
    await textarea.dispatchEvent('drop', { dataTransfer: dt })

    await expect(textarea).toHaveValue(/!\[\[sampling-diagram\.png\]\]/)
  })

  test('pasting an image from the clipboard uploads it too', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    const textarea = page.getByPlaceholder('# Start writing in markdown…')

    await textarea.evaluate((el, bytes) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(
        new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }),
      )
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
      )
    }, Array.from(PNG_1X1))

    await expect(textarea).toHaveValue(/!\[\[pasted\.png\]\]/)
  })
})
