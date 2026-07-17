import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Settings() {
  const { session } = useAuth()
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function change() {
    if (pw.length < 6) {
      setMsg('Password must be at least 6 characters.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    setMsg(error ? error.message : 'Password updated.')
    if (!error) setPw('')
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="muted">Signed in as {session?.user?.email}</p>
      <h3>Change password</h3>
      <div className="row">
        <input
          type="password"
          placeholder="New password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button className="btn primary" disabled={busy} onClick={change}>
          Update
        </button>
      </div>
      {msg && <div className="msg">{msg}</div>}
    </div>
  )
}
