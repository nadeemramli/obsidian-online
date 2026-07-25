import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchErrors, setErrorResolved, type ErrorLogEntry } from '../../lib/practice/api'

// Every incorrect cell becomes one reviewable misconception (PRD §B.5).
export default function ErrorLogPage() {
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload(open: boolean) {
    setLoading(true)
    try {
      setErrors(await fetchErrors(open))
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to load error log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload(onlyOpen)
  }, [onlyOpen])

  async function toggle(entry: ErrorLogEntry) {
    try {
      await setErrorResolved(entry.id, !entry.resolved)
      setErrors((prev) =>
        prev
          .map((e) => (e.id === entry.id ? { ...e, resolved: !entry.resolved } : e))
          .filter((e) => !onlyOpen || !e.resolved),
      )
    } catch (e: any) {
      setError(e.message || 'Could not update the entry')
    }
  }

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link>
      </div>
      <div className="page-head">
        <h1>Error log</h1>
        <div className="head-actions">
          <button className={'btn' + (onlyOpen ? ' primary' : '')} onClick={() => setOnlyOpen(true)}>
            Open
          </button>
          <button className={'btn' + (!onlyOpen ? ' primary' : '')} onClick={() => setOnlyOpen(false)}>
            All
          </button>
        </div>
      </div>
      {error && <p className="msg error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : errors.length === 0 ? (
        <p className="muted">
          {onlyOpen ? 'No open errors — nice.' : 'No errors recorded yet.'}
        </p>
      ) : (
        <ul className="error-list">
          {errors.map((e) => (
            <li key={e.id} className={'error-item' + (e.resolved ? ' resolved' : '')}>
              <div className="error-main">
                <strong>{e.row_label || e.row_id}</strong>
                <span className="meta-chip">{e.cell}</span>
                {e.topic && <span className="meta-chip">{e.topic}</span>}
                <div className="error-detail">
                  <span className="result-answer yours">
                    <em>You chose:</em> {e.submitted_label || '—'}
                  </span>
                  <span className="result-answer correct">
                    <em>Correct:</em> {e.expected_label || '—'}
                  </span>
                </div>
                <span className="muted error-date">
                  {new Date(e.created_at).toLocaleString()} ·{' '}
                  <Link to={`/practice/attempt/${e.attempt_id}`}>view attempt</Link>
                </span>
              </div>
              <button className="btn" onClick={() => toggle(e)}>
                {e.resolved ? 'Reopen' : 'Mark resolved'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
