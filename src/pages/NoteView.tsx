import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { NoteContent } from '../lib/markdown'
import { findBacklinks } from '../lib/notes'
import { NoteRail } from '../components/NoteRail'

export default function NoteView() {
  const { slug } = useParams()
  const { notes, loading } = useNotes()
  const note = notes.find((n) => n.slug === slug)
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const backlinks = useMemo(() => (note ? findBacklinks(note, notes) : []), [note, notes])

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

  return (
    <div className="note-layout">
      <div className="page note-main">
        {note.folder && <div className="crumb muted">📁 {note.folder}</div>}
        <div className="page-head">
          <h1>{note.title}</h1>
          <div className="head-actions">
            <Link className="btn" to={`/note/${note.slug}/edit`}>
              Edit
            </Link>
          </div>
        </div>
        <NoteContent content={note.content} knownSlugs={knownSlugs} />
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
