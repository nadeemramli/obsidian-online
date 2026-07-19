import { test, expect, login } from './fixtures'

test.describe('inline live editing', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      {
        title: 'Draft Note',
        slug: 'draft-note',
        content: '# Draft Note\n\nOriginal text with a [[Wiki Target]] and ==a highlight==.\n',
        folder: 'Statistics',
      },
      { title: 'Wiki Target', slug: 'wiki-target', content: 'target' },
    ])
  })

  test('edit mode shows a live-styled editor with the raw markdown', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Draft Note').click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const editor = page.locator('.md-editor .cm-content')
    await expect(editor).toBeVisible()
    await expect(editor).toContainText('Original text with a [[Wiki Target]]')
    // Obsidian syntax is styled live in the editor.
    await expect(editor.locator('.cm-wikilink').first()).toContainText('[[Wiki Target]]')
    await expect(editor.locator('.cm-hl').first()).toContainText('==a highlight==')
  })

  test('typing autosaves and the reading view shows the change', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Draft Note').click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const editor = page.locator('.md-editor .cm-content')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Appended-by-live-edit.')

    // Debounced autosave lands in the (mock) backend.
    await expect
      .poll(() => mock.notes.find((n) => n.slug === 'draft-note')?.content ?? '', { timeout: 5000 })
      .toContain('Appended-by-live-edit.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Read', exact: true }).click()
    await expect(page.locator('article.markdown')).toContainText('Appended-by-live-edit.')
  })

  test('Ctrl+E toggles between reading and editing', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Draft Note').click()
    await expect(page.locator('article.markdown')).toBeVisible()

    await page.keyboard.press('Control+e')
    await expect(page.locator('.md-editor .cm-content')).toBeVisible()
    await page.keyboard.press('Control+e')
    await expect(page.locator('article.markdown')).toBeVisible()
  })

  test('edit mode is remembered when opening the next note', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Draft Note').click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.locator('.md-editor .cm-content')).toBeVisible()

    await page.locator('.notelist').getByText('Wiki Target').click()
    await expect(page.locator('.md-editor .cm-content')).toBeVisible()
    await expect(page.locator('.md-editor .cm-content')).toContainText('target')
  })

  test('images render inline while editing, syntax reappears on the cursor line', async ({
    page,
    mock,
  }) => {
    mock.seed([
      {
        title: 'Figure Note',
        slug: 'figure-note',
        content: '# Figure Note\n\nBefore.\n\n![[flow.png]]\n\nAfter.\n',
      },
    ])
    await login(page)
    await page.locator('.notelist').getByText('Figure Note').click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const editor = page.locator('.md-editor .cm-content')
    // The image renders as a real <img> and the raw syntax is collapsed.
    await expect(editor.locator('.cm-image img')).toHaveAttribute('src', /token=mock-token/)
    await expect(editor).not.toContainText('![[flow.png]]')

    // Clicking the image moves the cursor to its line → raw syntax reappears.
    await editor.locator('.cm-image').click()
    await expect(editor).toContainText('![[flow.png]]')

    // Moving the cursor away collapses it back into the rendered image.
    await editor.getByText('Before.').click()
    await expect(editor.locator('.cm-image img')).toBeVisible()
    await expect(editor).not.toContainText('![[flow.png]]')

    // Image embeds are attachments, not note links — the local graph must not
    // list flow.png as a missing note.
    await expect(page.getByText('No connections yet.')).toBeVisible()
  })

  test('pending edits are flushed when navigating away quickly', async ({ page, mock }) => {
    await login(page)
    await page.locator('.notelist').getByText('Draft Note').click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editor = page.locator('.md-editor .cm-content')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Quick-exit-text.')
    // Navigate before the 800ms debounce fires.
    await page.locator('.notelist').getByText('Wiki Target').click()
    await expect
      .poll(() => mock.notes.find((n) => n.slug === 'draft-note')?.content ?? '', { timeout: 5000 })
      .toContain('Quick-exit-text.')
  })
})
