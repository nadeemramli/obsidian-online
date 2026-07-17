import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}
