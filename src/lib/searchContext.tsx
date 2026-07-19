import { createContext, useContext, useState } from 'react'

// Sidebar search state, shared so tag chips anywhere in the app can filter
// the note list ("#statistics" chips → sidebar query).
type SearchState = { q: string; setQ: (q: string) => void }
const Ctx = createContext<SearchState>({ q: '', setQ: () => {} })

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState('')
  return <Ctx.Provider value={{ q, setQ }}>{children}</Ctx.Provider>
}

export const useSearch = () => useContext(Ctx)
