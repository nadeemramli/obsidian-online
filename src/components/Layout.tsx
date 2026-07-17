import { useMemo, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { supabase } from '../lib/supabase'

export function Layout() {
  const { notes } = useNotes()
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return notes
    return notes.filter(
      (n) => n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s),
    )
  }, [notes, q])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Link to="/">📓 Vault</Link>
        </div>
        <div className="actions">
          <Link className="btn primary block" to="/new">
            + New note
          </Link>
          <Link className="btn block" to="/graph">
            🕸 Graph
          </Link>
        </div>
        <input
          className="search"
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <nav className="notelist">
          {filtered.map((n) => (
            <Link key={n.id} to={`/note/${n.slug}`} className="noteitem">
              {n.title}
            </Link>
          ))}
          {filtered.length === 0 && <div className="empty">No notes found</div>}
        </nav>
        <div className="sidebar-foot">
          <Link to="/settings">Settings</Link>
          <button
            className="link"
            onClick={async () => {
              await supabase.auth.signOut()
              navigate('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
