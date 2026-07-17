import { Link } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { stripFrontmatter } from '../lib/frontmatter'

function excerpt(md: string): string {
  return stripFrontmatter(md)
    .replace(/[#*_`>\[\]!=]/g, '')
    .replace(/\(storage:[^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

export default function Home() {
  const { notes, loading } = useNotes()
  return (
    <div className="page">
      <div className="page-head">
        <h1>All notes</h1>
        <Link className="btn primary" to="/new">
          + New
        </Link>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="muted">No notes yet. Create your first one.</p>
      ) : (
        <div className="grid">
          {notes.map((n) => (
            <Link key={n.id} to={`/note/${n.slug}`} className="notecard">
              <h3>{n.title}</h3>
              <p>{excerpt(n.content)}</p>
              <span className="date">{new Date(n.updated_at).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
