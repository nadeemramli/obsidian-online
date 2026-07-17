import { test, expect, login, createNoteViaUI } from './fixtures'

const GFM_CONTENT = `# Chapter 1

Some **bold** and *italic* text.

| Term | Meaning |
| ---- | ------- |
| RLS  | Row Level Security |

\`\`\`js
const answer = 42
\`\`\`

- [ ] re-read section 1.2
`

test.describe('note CRUD and markdown rendering', () => {
  test('creates a note and renders GitHub-flavored markdown', async ({ page, mock }) => {
    await login(page)
    await createNoteViaUI(page, 'Reading Notes', GFM_CONTENT)

    await expect(page).toHaveURL(/#\/note\/reading-notes$/)
    const article = page.locator('article.markdown')
    await expect(article.getByRole('heading', { name: 'Chapter 1' })).toBeVisible()
    await expect(article.locator('strong', { hasText: 'bold' })).toBeVisible()
    await expect(article.locator('table td', { hasText: 'Row Level Security' })).toBeVisible()
    await expect(article.locator('code', { hasText: 'const answer = 42' })).toBeVisible()
    await expect(article.locator('input[type="checkbox"]')).toHaveCount(1)

    // Appears in the sidebar and on the home grid.
    await expect(page.locator('.notelist').getByText('Reading Notes')).toBeVisible()
  })

  test('requires a title before saving', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/Please add a title/)).toBeVisible()
  })

  test('preview toggle renders markdown while editing', async ({ page, mock }) => {
    await login(page)
    await page.getByRole('link', { name: '+ New note' }).click()
    await page.getByPlaceholder('Note title').fill('Draft')
    await page.getByPlaceholder('# Start writing in markdown…').fill('## Preview me')
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('article.markdown').getByRole('heading', { name: 'Preview me' })).toBeVisible()
    await page.getByRole('button', { name: 'Write' }).click()
    await expect(page.getByPlaceholder('# Start writing in markdown…')).toHaveValue('## Preview me')
  })

  test('edits an existing note', async ({ page, mock }) => {
    mock.seed([{ title: 'Alpha', slug: 'alpha', content: 'original text' }])
    await login(page)
    await page.locator('.notelist').getByText('Alpha').click()
    await expect(page.getByText('original text')).toBeVisible()

    await page.getByRole('link', { name: 'Edit' }).click()
    await page.getByPlaceholder('# Start writing in markdown…').fill('revised text')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/#\/note\/alpha$/)
    await expect(page.getByText('revised text')).toBeVisible()
    await expect(page.getByText('original text')).not.toBeVisible()
  })

  test('deletes a note after confirmation', async ({ page, mock }) => {
    mock.seed([{ title: 'Disposable', slug: 'disposable', content: 'to be removed' }])
    await login(page)
    await page.locator('.notelist').getByText('Disposable').click()
    await page.getByRole('link', { name: 'Edit' }).click()

    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('No notes yet. Create your first one.')).toBeVisible()
    await expect(page.locator('.notelist').getByText('Disposable')).not.toBeVisible()
  })

  test('duplicate titles get unique slugs', async ({ page, mock }) => {
    mock.seed([{ title: 'Chapter Notes', slug: 'chapter-notes', content: 'first' }])
    await login(page)
    await createNoteViaUI(page, 'Chapter Notes', 'second')
    await expect(page).toHaveURL(/#\/note\/chapter-notes-2$/)
  })
})
