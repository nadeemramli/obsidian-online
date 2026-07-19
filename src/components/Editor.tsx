import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNote, deleteNote, updateNote, type Note } from '../lib/notes'
import { useNotes } from '../lib/notesContext'
import { NoteContent } from '../lib/markdown'
import { parseFrontmatter } from '../lib/frontmatter'
import { uploadImage, imageFiles } from '../lib/images'

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
  const [folder, setFolder] = useState(existing?.folder ?? '')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { notes, reload } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const folders = useMemo(
    () => Array.from(new Set(notes.map((n) => n.folder).filter(Boolean))).sort(),
    [notes],
  )

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
        const n = await updateNote(existing.id, { title: finalTitle, content, folder: folder.trim() })
        slug = n.slug
      } else {
        const n = await createNote(finalTitle, content, folder)
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

  async function handleFiles(files: Iterable<File>) {
    const images = imageFiles(files)
    if (images.length === 0) return
    setBusy(true)
    setErr(null)
    for (const f of images) {
      try {
        insertAtCursor(`\n\n![[${await uploadImage(f)}]]\n\n`)
      } catch (e: any) {
        setErr(e.message || 'Upload failed')
      }
    }
    setBusy(false)
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
      <div className="folder-field">
        <span className="folder-icon">📁</span>
        <input
          className="folder-input"
          placeholder="Folder (optional, e.g. Statistics/Chapter 1)"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          list="folder-options"
        />
        <datalist id="folder-options">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      <p className="hint">
        Obsidian syntax supported: <code>[[wikilinks]]</code>, <code>![[embeds]]</code>,{' '}
        <code>![[image.png]]</code>, <code>==highlights==</code>, <code>#tags</code>,{' '}
        <code>&gt; [!note]</code> callouts, YAML frontmatter, and <code>```mermaid</code> diagrams.
        Drag &amp; drop or paste images straight into the editor.
      </p>
      {err && <div className="msg error">{err}</div>}
      {preview ? (
        <NoteContent content={content} knownSlugs={knownSlugs} />
      ) : (
        <>
          <textarea
            ref={taRef}
            className={'editor-area' + (dragging ? ' dragging' : '')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void handleFiles(e.dataTransfer.files)
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length > 0) {
                e.preventDefault()
                void handleFiles(e.clipboardData.files)
              }
            }}
            placeholder="# Start writing in markdown… (drop or paste screenshots here)"
          />
          <label className="upload">
            📎 Attach screenshot
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </>
      )}
    </div>
  )
}
