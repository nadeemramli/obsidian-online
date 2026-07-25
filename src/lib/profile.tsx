import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { fetchMyProfile, type Profile } from './practice/api'

type ProfileState = {
  profile: Profile | null
  role: string
  isEditor: boolean // content_editor or admin
  loading: boolean
  reload: () => Promise<void>
}

const Ctx = createContext<ProfileState>({
  profile: null,
  role: 'learner',
  isEditor: false,
  loading: true,
  reload: async () => {},
})

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setProfile(await fetchMyProfile())
    } catch (e) {
      console.error(e)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void reload()
  }, [reload])

  const role = profile?.role ?? 'learner'
  return (
    <Ctx.Provider
      value={{ profile, role, isEditor: role === 'content_editor' || role === 'admin', loading, reload }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useProfile = () => useContext(Ctx)
