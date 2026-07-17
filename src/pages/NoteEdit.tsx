import { useParams } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { Editor } from '../components/Editor'

export default function NoteEdit() {
  const { slug } = useParams()
  const { notes, loading } = useNotes()
  const note = notes.find((n) => n.slug === slug)
  if (loading) return <div className="page muted">Loading…</div>
  if (!note) return <div className="page">Note not found.</div>
  return <Editor existing={note} key={note.id} />
}
