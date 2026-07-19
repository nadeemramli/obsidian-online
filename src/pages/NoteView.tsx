import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { NoteContent } from '../lib/markdown'
import { compareTitles, findBacklinks, updateNote } from '../lib/notes'
import { NoteRail } from '../components/NoteRail'
import { MarkdownEditor } from '../components/MarkdownEditor'

type Mode = 'read' | 'edit'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
const MODE_KEY = 'vault-note-mode'

export default function NoteView() {
  const { slug } = useParams()
  const { notes, reload, loading } = useNotes()
  const note = notes.find((n) => n.slug === slug)
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const backlinks = useMemo(() => (note ? findBacklinks(note, notes) : []), [note, notes])

  // Auto-derived chapter navigation: siblings in the same folder, in natural
  // title order (no prev/next frontmatter to maintain).
  const { prev, next } = useMemo(() => {
    if (!note || !note.folder) return { prev: null, next: null }
    const siblings = notes.filter((n) => n.folder === note.folder).sort(compareTitles)
    const i = siblings.findIndex((n) => n.id === note.id)
    return {
      prev: i > 0 ? siblings[i - 1] : null,
      next: i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null,
    }
  }, [note, notes])

  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem(MODE_KEY) === 'edit' ? 'edit' : 'read',
  )
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const draftRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const noteId = note?.id

  const flush = useCallback(async () => {
    const draft = draftRef.current
    if (draft === null || !noteId) return
    clearTimeout(timerRef.current)
    setSaveState('saving')
    try {
      await updateNote(noteId, { content: draft })
      draftRef.current = null
      setSaveState('saved')
      await reload()
    } catch {
      setSaveState('error')
    }
  }, [noteId, reload])

  const onEditorChange = useCallback(
    (value: string) => {
      draftRef.current = value
      setSaveState('dirty')
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void flush(), 800)
    },
    [flush],
  )

  const setModeAndRemember = useCallback(
    (m: Mode) => {
      setMode(m)
      localStorage.setItem(MODE_KEY, m)
      if (m === 'read') void flush()
    },
    [flush],
  )

  // Ctrl/Cmd+E toggles edit and reading view, like Obsidian.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setModeAndRemember(mode === 'edit' ? 'read' : 'edit')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setModeAndRemember])

  // Leaving the note (or the page) flushes any pending edit.
  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  if (loading) return <div className="page muted">Loading…</div>

  if (!note) {
    const guessTitle = (slug || '').replace(/-/g, ' ')
    return (
      <div className="page">
        <h1>Note not found</h1>
        <p className="muted">There is no note called “{guessTitle}” yet.</p>
        <Link className="btn primary" to={`/new?title=${encodeURIComponent(guessTitle)}`}>
          Create “{guessTitle}”
        </Link>
      </div>
    )
  }

  const saveLabel =
    saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Saving…'

  return (
    <div className="note-layout">
      <div className="page note-main">
        {note.folder && <div className="crumb muted">📁 {note.folder}</div>}
        <div className="page-head">
          <h1>{note.title}</h1>
          <div className="head-actions">
            {mode === 'edit' && (
              <span className={'save-state' + (saveState === 'error' ? ' error' : '')}>
                {saveLabel}
              </span>
            )}
            <button
              className={'btn' + (mode === 'edit' ? ' primary' : '')}
              title="Toggle edit (Ctrl+E)"
              onClick={() => setModeAndRemember(mode === 'edit' ? 'read' : 'edit')}
            >
              {mode === 'edit' ? 'Read' : 'Edit'}
            </button>
            <Link className="btn" to={`/note/${note.slug}/edit`} title="Title, folder, delete">
              Details
            </Link>
          </div>
        </div>
        {mode === 'edit' ? (
          <MarkdownEditor
            key={note.id}
            initialValue={draftRef.current ?? note.content}
            onChange={onEditorChange}
            autoFocus
          />
        ) : (
          <NoteContent content={note.content} knownSlugs={knownSlugs} />
        )}
        {(prev || next) && (
          <nav className="pager">
            {prev ? (
              <Link className="pager-link" to={`/note/${prev.slug}`}>
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link className="pager-link next" to={`/note/${next.slug}`}>
                {next.title} →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <section className="backlinks">
          <h3>Linked from ({backlinks.length})</h3>
          {backlinks.length === 0 ? (
            <p className="muted">No other notes link here yet.</p>
          ) : (
            <ul>
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link to={`/note/${b.slug}`}>{b.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <NoteRail note={note} notes={notes} />
    </div>
  )
}
