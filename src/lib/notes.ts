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

// Extract [[wikilink]] targets (ignoring any |alias part) from markdown.
export function extractWikilinks(content: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const target = m[1].split('|')[0].trim()
    if (target) out.push(target)
  }
  return out
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
