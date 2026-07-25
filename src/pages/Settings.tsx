import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProfile } from '../lib/profile'
import { updateDisplayName } from '../lib/practice/api'

export default function Settings() {
  const { session } = useAuth()
  const { profile, role, reload } = useProfile()
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [nameMsg, setNameMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(profile?.display_name ?? '')
  }, [profile])

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

  async function saveName() {
    setBusy(true)
    try {
      await updateDisplayName(name.trim())
      await reload()
      setNameMsg('Saved.')
    } catch (e: any) {
      setNameMsg(e.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="muted">
        Signed in as {session?.user?.email} · role: <span className="meta-chip">{role}</span>
      </p>

      <h3>Display name</h3>
      <div className="row">
        <input
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary" disabled={busy} onClick={saveName}>
          Save
        </button>
      </div>
      {nameMsg && <div className="msg">{nameMsg}</div>}

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
