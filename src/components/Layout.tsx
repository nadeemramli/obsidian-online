import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { compareTitles, type Note } from '../lib/notes'
import { parseFrontmatter } from '../lib/frontmatter'
import { SearchProvider, useSearch } from '../lib/searchContext'
import { supabase } from '../lib/supabase'

type FolderNode = {
  name: string
  path: string
  folders: Map<string, FolderNode>
  notes: Note[]
}

function sortTree(node: FolderNode) {
  node.notes.sort(compareTitles)
  node.folders.forEach(sortTree)
}

// Does a note match a "#tag" query? Checks inline #tags in the content and
// the frontmatter tags list.
function matchesTag(note: Note, tag: string): boolean {
  if (note.content.toLowerCase().includes(`#${tag}`)) return true
  const fmTags = parseFrontmatter(note.content).data.tags
  const list = Array.isArray(fmTags) ? fmTags : typeof fmTags === 'string' ? [fmTags] : []
  return list.some((t) => t.replace(/^#/, '').toLowerCase() === tag)
}

function buildTree(notes: Note[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: new Map(), notes: [] }
  for (const n of notes) {
    const segments = (n.folder || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
    let cur = root
    let path = ''
    for (const seg of segments) {
      path = path ? `${path}/${seg}` : seg
      if (!cur.folders.has(seg)) {
        cur.folders.set(seg, { name: seg, path, folders: new Map(), notes: [] })
      }
      cur = cur.folders.get(seg)!
    }
    cur.notes.push(n)
  }
  sortTree(root)
  return root
}

function FolderBranch({
  node,
  depth,
  collapsed,
  toggle,
}: {
  node: FolderNode
  depth: number
  collapsed: Set<string>
  toggle: (path: string) => void
}) {
  const subfolders = Array.from(node.folders.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return (
    <>
      {subfolders.map((f) => {
        const isCollapsed = collapsed.has(f.path)
        return (
          <div key={f.path} className="folder-group">
            <button
              className="folder-row"
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => toggle(f.path)}
              aria-expanded={!isCollapsed}
            >
              <span className="folder-chevron">{isCollapsed ? '▸' : '▾'}</span> 📁 {f.name}
            </button>
            {!isCollapsed && (
              <FolderBranch node={f} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
            )}
          </div>
        )
      })}
      {node.notes.map((n) => (
        <Link
          key={n.id}
          to={`/note/${n.slug}`}
          className="noteitem"
          style={{ paddingLeft: 10 + depth * 14 }}
        >
          {n.title}
        </Link>
      ))}
    </>
  )
}

export function Layout() {
  return (
    <SearchProvider>
      <LayoutInner />
    </SearchProvider>
  )
}

function LayoutInner() {
  const { notes } = useNotes()
  const { q, setQ } = useSearch()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Navigating anywhere closes the mobile drawer and starts the new page at
  // the top (the scroll container otherwise keeps its position, so "next
  // chapter" would open at the bottom).
  useEffect(() => {
    setDrawerOpen(false)
    contentRef.current?.scrollTo(0, 0)
  }, [location])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return notes
    if (s.startsWith('#') && s.length > 1) {
      const tag = s.slice(1)
      return notes.filter((n) => matchesTag(n, tag))
    }
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(s) ||
        n.content.toLowerCase().includes(s) ||
        n.folder.toLowerCase().includes(s),
    )
  }, [notes, q])

  const tree = useMemo(() => buildTree(filtered), [filtered])
  const searching = q.trim().length > 0

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="app">
      <header className="mobile-topbar">
        <button
          className="hamburger"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          ☰
        </button>
        <Link to="/">📓 Vault</Link>
      </header>
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
      <aside className={'sidebar' + (drawerOpen ? ' open' : '')}>
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
          {searching ? (
            // Flat results while searching — folders would hide matches.
            filtered.map((n) => (
              <Link key={n.id} to={`/note/${n.slug}`} className="noteitem">
                {n.title}
                {n.folder && <span className="noteitem-folder">{n.folder}</span>}
              </Link>
            ))
          ) : (
            <FolderBranch node={tree} depth={0} collapsed={collapsed} toggle={toggle} />
          )}
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
      <main className="content" ref={contentRef}>
        <Outlet />
      </main>
    </div>
  )
}
