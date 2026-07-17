import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { NotesProvider } from './lib/notesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import NoteView from './pages/NoteView'
import NoteEdit from './pages/NoteEdit'
import NewNote from './pages/NewNote'
import Settings from './pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <NotesProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/new" element={<NewNote />} />
              <Route path="/note/:slug" element={<NoteView />} />
              <Route path="/note/:slug/edit" element={<NoteEdit />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </NotesProvider>
      </HashRouter>
    </AuthProvider>
  )
}
