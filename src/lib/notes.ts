import { supabase } from './supabase'

export type Note = {
  id: string
  title: string
  slug: string
  content: string
  folder: string
  created_at: string
  updated_at: string
}

export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'untitled'
}

export async function fetchNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []) as Note[]
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let i = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase.from('notes').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    i += 1
    slug = `${base}-${i}`
  }
}

export async function createNote(title: string, content: string, folder = ''): Promise<Note> {
  const slug = await uniqueSlug(slugify(title))
  const { data, error } = await supabase
    .from('notes')
    .insert({ title: title.trim(), slug, content, folder: folder.trim() })
    .select()
    .single()
  if (error) throw error
  return data as Note
}

export async function updateNote(
  id: string,
  patch: { title?: string; content?: string; folder?: string },
): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Note
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

// Extract [[wikilink]] targets from markdown, ignoring any |alias part and
// any #heading / #^block suffix ([[Note#Section]] links to Note). Code is
// not prose: fenced blocks and inline code are skipped (mermaid's
// A[[subroutine]] shape syntax would otherwise read as a wikilink).
export function extractWikilinks(content: string): string[] {
  const prose = content.replace(/```[\s\S]*?(```|$)/g, '').replace(/`[^`\n]*`/g, '')
  const re = /\[\[([^\]]+)\]\]/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(prose)) !== null) {
    const target = m[1].split('|')[0].split('#')[0].trim()
    if (target) out.push(target)
  }
  return out
}

// Natural A→Z: numeric-aware so "02 — …" sorts before "10 — …".
export function compareTitles(a: Note, b: Note): number {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
}

// Notes that link TO the given note (by title or slug match).
export function findBacklinks(target: Note, all: Note[]): Note[] {
  const title = target.title.toLowerCase()
  return all
    .filter((n) => n.id !== target.id)
    .filter((n) =>
      extractWikilinks(n.content).some(
        (l) => l.toLowerCase() === title || slugify(l) === target.slug,
      ),
    )
}
