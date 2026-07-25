import { Link } from 'react-router-dom'
import { useProfile } from '../lib/profile'

// Gates builder routes to content_editor/admin. This is UX only — the real
// enforcement is RLS (learners cannot read drafts or answer keys, nor write
// content, no matter what URL they visit).
export function RoleRoute({ children }: { children: JSX.Element }) {
  const { isEditor, loading } = useProfile()
  if (loading) return <div className="center muted">Loading…</div>
  if (!isEditor)
    return (
      <div className="page">
        <h1>Editors only</h1>
        <p className="muted">
          Your account doesn't have content-editing access. If you think it should, ask an
          administrator.
        </p>
        <Link className="btn" to="/practice">
          ← Back to practice
        </Link>
      </div>
    )
  return children
}
