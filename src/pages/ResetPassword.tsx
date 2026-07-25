import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Landing page for password-recovery links (the AuthProvider adopts the
// session from the email link's tokens and routes here).
export default function ResetPassword() {
  const { session, loading } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 6) {
      setMsg('Password must be at least 6 characters.')
      return
    }
    if (pw !== pw2) {
      setMsg('Passwords do not match.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) {
      setMsg(error.message)
    } else {
      setMsg(null)
      navigate('/', { replace: true })
    }
  }

  if (loading) return <div className="center muted">Loading…</div>

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>🔑 Reset password</h1>
        {session ? (
          <>
            <p className="muted">Choose a new password for {session.user.email}.</p>
            <input
              placeholder="New password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <input
              placeholder="Repeat new password"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
            <button disabled={busy} type="submit" className="btn primary block">
              {busy ? '…' : 'Set new password'}
            </button>
          </>
        ) : (
          <p className="muted">
            This page needs a valid recovery link. Request one from the sign-in page and follow
            the link in your email.
          </p>
        )}
        {msg && <div className="msg error">{msg}</div>}
      </form>
    </div>
  )
}
