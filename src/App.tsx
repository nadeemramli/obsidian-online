import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ProfileProvider } from './lib/profile'
import { NotesProvider } from './lib/notesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleRoute } from './components/RoleRoute'
import { Layout } from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import NoteView from './pages/NoteView'
import NoteEdit from './pages/NoteEdit'
import NewNote from './pages/NewNote'
import Settings from './pages/Settings'
import Graph from './pages/Graph'
import PracticeHome from './pages/practice/PracticeHome'
import PracticeRun from './pages/practice/PracticeRun'
import AttemptView from './pages/practice/AttemptView'
import PracticeHistory from './pages/practice/PracticeHistory'
import ErrorLogPage from './pages/practice/ErrorLogPage'
import BuilderList from './pages/builder/BuilderList'
import BuilderItem from './pages/builder/BuilderItem'

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <HashRouter>
          <NotesProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset" element={<ResetPassword />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Home />} />
                <Route path="/new" element={<NewNote />} />
                <Route path="/graph" element={<Graph />} />
                <Route path="/note/:slug" element={<NoteView />} />
                <Route path="/note/:slug/edit" element={<NoteEdit />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/practice" element={<PracticeHome />} />
                <Route path="/practice/run/:itemId" element={<PracticeRun />} />
                <Route path="/practice/attempt/:attemptId" element={<AttemptView />} />
                <Route path="/practice/history" element={<PracticeHistory />} />
                <Route path="/practice/errors" element={<ErrorLogPage />} />
                <Route
                  path="/builder"
                  element={
                    <RoleRoute>
                      <BuilderList />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/builder/item/:itemId"
                  element={
                    <RoleRoute>
                      <BuilderItem />
                    </RoleRoute>
                  }
                />
              </Route>
            </Routes>
          </NotesProvider>
        </HashRouter>
      </ProfileProvider>
    </AuthProvider>
  )
}
