import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  fetchAttempts,
  fetchErrors,
  fetchPublishedItems,
  loadLocalDraft,
  type Attempt,
  type ErrorLogEntry,
  type LearningItem,
} from '../../lib/practice/api'

export default function PracticeHome() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const [items, setItems] = useState<LearningItem[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchPublishedItems(), fetchAttempts(50), fetchErrors(true)])
      .then(([i, a, e]) => {
        if (!active) return
        setItems(i)
        setAttempts(a)
        setErrors(e)
      })
      .catch((e) => {
        if (active) setError(e.message || 'Failed to load practice data')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const stats = useMemo(() => {
    const recent = attempts.slice(0, 10)
    const cells = recent.reduce((s, a) => s + a.cell_max, 0)
    const good = recent.reduce((s, a) => s + a.cell_score, 0)
    return {
      total: attempts.length,
      recentPct: cells > 0 ? Math.round((good / cells) * 100) : null,
      recentN: recent.length,
    }
  }, [attempts])

  // Open errors grouped by topic — the honest early version of "concepts
  // requiring attention".
  const weakTopics = useMemo(() => {
    const byTopic = new Map<string, number>()
    for (const e of errors) {
      const key = e.topic || e.paper || 'General'
      byTopic.set(key, (byTopic.get(key) || 0) + 1)
    }
    return Array.from(byTopic.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [errors])

  const continueItem = useMemo(
    () => items.find((it) => loadLocalDraft(it.id, userId)),
    [items, userId],
  )

  const itemTitle = (id: string) => items.find((i) => i.id === id)?.title ?? 'Activity'

  if (loading) return <div className="page muted">Loading…</div>
  if (error)
    return (
      <div className="page">
        <h1>Practice</h1>
        <p className="msg error">{error}</p>
      </div>
    )

  return (
    <div className="page practice-page">
      <div className="page-head">
        <h1>Practice</h1>
        <div className="head-actions">
          <Link className="btn" to="/practice/history">
            History
          </Link>
          <Link className="btn" to="/practice/errors">
            Error log{errors.length > 0 ? ` (${errors.length})` : ''}
          </Link>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-num">{stats.total}</span>
          <span className="stat-caption">attempts so far</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.recentPct === null ? '—' : `${stats.recentPct}%`}</span>
          <span className="stat-caption">
            {stats.recentPct === null
              ? 'no attempts yet'
              : `accuracy, last ${stats.recentN} attempt${stats.recentN === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{errors.length}</span>
          <span className="stat-caption">open errors to review</span>
        </div>
      </div>
      {stats.total > 0 && stats.total < 5 && (
        <p className="hint">Early numbers — they'll mean more after a few more attempts.</p>
      )}

      {continueItem && (
        <div className="continue-card">
          <div>
            <strong>Pick up where you left off</strong>
            <div className="muted">{continueItem.title} — you have unsubmitted answers.</div>
          </div>
          <Link className="btn primary" to={`/practice/run/${continueItem.id}`}>
            Continue
          </Link>
        </div>
      )}

      {weakTopics.length > 0 && (
        <>
          <h3 className="section-h">Needs attention</h3>
          <div className="weak-topics">
            {weakTopics.map(([topic, n]) => (
              <Link key={topic} to="/practice/errors" className="weak-topic">
                {topic} <span className="muted">· {n} open error{n === 1 ? '' : 's'}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <h3 className="section-h">Activities</h3>
      {items.length === 0 ? (
        <p className="muted">No published activities yet.</p>
      ) : (
        <div className="activity-list">
          {items.map((it) => {
            const last = attempts.find((a) => a.item_id === it.id)
            return (
              <Link key={it.id} to={`/practice/run/${it.id}`} className="activity-card">
                <div className="activity-main">
                  <strong>{it.title}</strong>
                  <span className="muted activity-sub">
                    {[it.paper, it.topic, it.difficulty].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="activity-side">
                  {last
                    ? `Last: ${last.cell_score}/${last.cell_max}`
                    : 'Not attempted'}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {attempts.length > 0 && (
        <>
          <h3 className="section-h">Recent practice</h3>
          <ul className="recent-list">
            {attempts.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link to={`/practice/attempt/${a.id}`}>
                  {itemTitle(a.item_id)} — {a.cell_score}/{a.cell_max}
                </Link>{' '}
                <span className="muted">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
