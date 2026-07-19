import { test, expect, login } from './fixtures'

const FLOWCHART_NOTE = `# Process

\`\`\`mermaid
flowchart TD
  A[Read chapter] --> B{Understood?}
  B -- yes --> C[Take notes]
  B -- no --> A
  C --> D[[Review later]]
\`\`\`

Regular \`inline code\` and a normal block:

\`\`\`js
const x = 1
\`\`\`
`

test.describe('mermaid diagrams', () => {
  test.beforeEach(async ({ mock }) => {
    mock.seed([
      { title: 'Process', slug: 'process', content: FLOWCHART_NOTE },
      { title: 'Broken', slug: 'broken', content: '```mermaid\nflowchart TD\n  A --> ==\n```\n' },
    ])
  })

  test('renders ```mermaid fences as SVG diagrams, other code stays code', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.locator('.notelist').getByText('Process').click()

    const diagram = page.locator('.mermaid-block svg')
    await expect(diagram).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.mermaid-block')).toContainText('Read chapter')
    // The raw mermaid source is not shown as a code block.
    await expect(page.locator('article.markdown pre', { hasText: 'flowchart TD' })).not.toBeVisible()
    // Ordinary fenced code still renders as code.
    await expect(page.locator('article.markdown pre', { hasText: 'const x = 1' })).toBeVisible()

    // Mermaid's D[[Review later]] shape syntax is NOT a wikilink: the note
    // has no real links, so the local graph shows the empty state.
    await expect(page.getByText('No connections yet.')).toBeVisible()
  })

  test('invalid diagrams show an error with the source instead of breaking', async ({
    page,
    mock,
  }) => {
    await login(page)
    await page.locator('.notelist').getByText('Broken').click()

    const err = page.locator('.mermaid-block.error')
    await expect(err).toBeVisible({ timeout: 15_000 })
    await expect(err).toContainText('Mermaid syntax error')
    await expect(err).toContainText('flowchart TD')
  })
})
