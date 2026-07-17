import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNote, deleteNote, updateNote, type Note } from '../lib/notes'
import { useNotes } from '../lib/notesContext'
import { supabase } from '../lib/supabase'
import { NoteContent } from '../lib/markdown'
import { parseFrontmatter } from '../lib/frontmatter'

// Pasted markdown often already names itself — via frontmatter `title:` or a
// leading heading. Use that when the title field was left empty.
export function deriveTitle(content: string): string {
  const { data, body } = parseFrontmatter(content)
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim()
  const heading = body.match(/^#{1,6}\s+(.+)$/m)
  if (heading) return heading[1].replace(/[#*_`=[\]]/g, '').trim()
  return ''
}

export function Editor({
  existing,
  initialTitle = '',
}: {
  existing?: Note
  initialTitle?: string
}) {
  const [title, setTitle] = useState(existing?.title ?? initialTitle)
  const [content, setContent] = useState(existing?.content ?? '')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { notes, reload } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  async function save() {
    let finalTitle = title.trim()
    if (!finalTitle) {
      finalTitle = deriveTitle(content)
      if (finalTitle) setTitle(finalTitle)
    }
    if (!finalTitle) {
      setErr('Please add a title (the field at the top), or start your note with a # heading.')
      setPreview(false)
      titleRef.current?.focus()
      return
    }
    setBusy(true)
    setErr(null)
    try {
      let slug: string
      if (existing) {
        const n = await updateNote(existing.id, { title: finalTitle, content })
        slug = n.slug
      } else {
        const n = await createNote(finalTitle, content)
        slug = n.slug
      }
      await reload()
      navigate(`/note/${slug}`)
    } catch (e: any) {
      setErr(e.message || 'Save failed')
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing) return
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    setBusy(true)
    try {
      await deleteNote(existing.id)
      await reload()
      navigate('/')
    } catch (e: any) {
      setErr(e.message || 'Delete failed')
      setBusy(false)
    }
  }

  function insertAtCursor(text: string) {
    const ta = taRef.current
    if (!ta) {
      setContent((c) => c + text)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    setContent((c) => c.slice(0, start) + text + c.slice(end))
  }

  async function onUpload(file: File) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${crypto.randomUUID()}.${ext}`
    setBusy(true)
    setErr(null)
    const { error } = await supabase.storage.from('screenshots').upload(path, file, {
      contentType: file.type || 'image/png',
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    insertAtCursor(`\n\n![screenshot](storage:${path})\n\n`)
  }

  return (
    <div className="page editor">
      <div className="page-head">
        <input
          ref={titleRef}
          className="title-input"
          placeholder="Note title (or leave blank — I'll use the frontmatter/heading)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="head-actions">
          <button className="btn" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Write' : 'Preview'}
          </button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {existing && (
            <button className="btn danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </div>
      <p className="hint">
        Obsidian syntax supported: <code>[[wikilinks]]</code>, <code>![[embeds]]</code>,{' '}
        <code>==highlights==</code>, <code>#tags</code>, <code>&gt; [!note]</code> callouts, and YAML
        frontmatter (<code>---</code>). Paste markdown from Claude directly, or attach a screenshot below.
      </p>
      {err && <div className="msg error">{err}</div>}
      {preview ? (
        <NoteContent content={content} knownSlugs={knownSlugs} />
      ) : (
        <>
          <textarea
            ref={taRef}
            className="editor-area"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Start writing in markdown…"
          />
          <label className="upload">
            📎 Attach screenshot
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUpload(f)
                e.target.value = ''
              }}
            />
          </label>
        </>
      )}
    </div>
  )
}
