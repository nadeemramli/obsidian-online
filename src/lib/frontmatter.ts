// Minimal YAML-frontmatter parser covering what Obsidian properties use:
// strings, numbers, booleans, quoted strings, inline arrays [a, b] and
// dash lists. Anything fancier stays a plain string.
export type FrontmatterValue = string | string[]
export type Frontmatter = Record<string, FrontmatterValue>

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function unquote(s: string): string {
  const t = s.trim()
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1)
  }
  return t
}

export function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
  const m = content.match(FM_RE)
  if (!m) return { data: {}, body: content }

  const data: Frontmatter = {}
  const lines = m[1].split(/\r?\n/)
  let currentKey: string | null = null

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue

    const dash = line.match(/^\s+-\s+(.*)$/)
    if (dash && currentKey) {
      const arr = Array.isArray(data[currentKey]) ? (data[currentKey] as string[]) : []
      arr.push(unquote(dash[1]))
      data[currentKey] = arr
      continue
    }

    const kv = line.match(/^([\w][\w .\/-]*):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].trim()
    const raw = kv[2].trim()
    currentKey = key

    if (!raw) {
      data[key] = [] // may be filled by a dash list
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      data[key] = raw
        .slice(1, -1)
        .split(',')
        .map((v) => unquote(v))
        .filter(Boolean)
    } else {
      data[key] = unquote(raw)
    }
  }

  // Drop keys that stayed as empty arrays with no list items.
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && (data[k] as string[]).length === 0) delete data[k]
  }

  return { data, body: content.slice(m[0].length) }
}

export function stripFrontmatter(content: string): string {
  return content.replace(FM_RE, '')
}
