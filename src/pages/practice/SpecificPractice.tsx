import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAttempts,
  fetchErrors,
  fetchPublishedItems,
  fetchPublishedQuizzes,
  type Attempt,
  type ErrorLogEntry,
  type LearningItem,
  type Quiz,
} from '../../lib/practice/api'

// Lane 1: targeted drills, authored quizzes, and repair entry points.
export default function SpecificPractice() {
  const [items, setItems] = useState<LearningItem[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchPublishedItems(), fetchPublishedQuizzes(), fetchAttempts(100), fetchErrors(true)])
      .then(([i, q, a, e]) => {
        if (!active) return
        setItems(i)
        setQuizzes(q)
        setAttempts(a)
        setErrors(e)
      })
      .catch((e) => {
        if (active) setError(e.message || 'Failed to load')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Open errors grouped by topic — repair entry points.
  const weakTopics = useMemo(() => {
    const byTopic = new Map<string, number>()
    for (const e of errors) {
      const key = e.topic || e.paper || 'General'
      byTopic.set(key, (byTopic.get(key) || 0) + 1)
    }
    return Array.from(byTopic.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [errors])

  if (loading) return <div className="page muted">Loading…</div>

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> · Specific Practice
      </div>
      <div className="page-head">
        <h1>Specific Practice</h1>
      </div>
      {error && <p className="msg error">{error}</p>}

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

      {quizzes.length > 0 && (
        <>
          <h3 className="section-h">Quizzes</h3>
          <div className="activity-list">
            {quizzes.map((q) => (
              <Link key={q.id} to={`/practice/quiz/${q.id}`} className="activity-card">
                <div className="activity-main">
                  <strong>{q.title}</strong>
                  <span className="muted activity-sub">
                    {[q.paper, q.topic, q.est_minutes ? `~${q.est_minutes} min` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className="activity-side">Quiz</span>
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
                  {last ? `Last: ${last.cell_score}/${last.cell_max}` : 'Not attempted'}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
