import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type AuthState = { session: Session | null; loading: boolean }
const AuthCtx = createContext<AuthState>({ session: null, loading: true })

// Password-recovery links land as https://app/#access_token=…&type=recovery —
// the token hash *replaces* our HashRouter hash and detectSessionInUrl is off,
// so adopt the session manually, then route to the reset page.
async function adoptRecoverySession(): Promise<boolean> {
  const hash = window.location.hash
  if (!hash.includes('type=recovery') || !hash.includes('access_token=')) return false
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return false
  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  if (error) {
    console.error(error)
    return false
  }
  window.location.hash = '#/reset'
  return true
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adoptRecoverySession().finally(() => {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session)
        setLoading(false)
      })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
