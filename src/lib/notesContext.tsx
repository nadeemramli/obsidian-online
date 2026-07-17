import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchNotes, type Note } from './notes'
import { useAuth } from './auth'

type NotesState = { notes: Note[]; reload: () => Promise<void>; loading: boolean }
const Ctx = createContext<NotesState>({ notes: [], reload: async () => {}, loading: true })

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) {
      setNotes([])
      return
    }
    setLoading(true)
    try {
      setNotes(await fetchNotes())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void reload()
  }, [reload])

  return <Ctx.Provider value={{ notes, reload, loading }}>{children}</Ctx.Provider>
}

export const useNotes = () => useContext(Ctx)
