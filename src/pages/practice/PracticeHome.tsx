import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  fetchAttempts,
  fetchErrors,
  fetchPublishedItems,
  fetchPublishedSpines,
  loadLocalDraft,
  type Attempt,
  type ErrorLogEntry,
  type LearningItem,
  type PracticeSpine,
} from '../../lib/practice/api'

// Two-lane practice hub (PRD §8): Specific Practice for coverage and repair,
// Financial Statement Practice for integration. Both lanes run on one engine.
export default function PracticeHome() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const [items, setItems] = useState<LearningItem[]>([])
  const [spines, setSpines] = useState<PracticeSpine[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetchPublishedItems(),
      fetchPublishedSpines(),
      fetchAttempts(50),
      fetchErrors(true),
    ])
      .then(([i, s, a, e]) => {
        if (!active) return
        setItems(i)
        setSpines(s)
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

  const continueItem = useMemo(
    () => items.find((it) => loadLocalDraft(it.id, userId)),
    [items, userId],
  )

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

      <div className="lane-cards">
        <Link to="/practice/specific" className="lane-card">
          <span className="lane-kicker">Lane 1</span>
          <h2>Specific Practice</h2>
          <p>
            Short, targeted drills and quizzes: classification, double entry, adjustments,
            errors, cost behaviour. Coverage and repair.
          </p>
          <span className="lane-meta">
            {items.length} activities
            {errors.length > 0 ? ` · ${errors.length} open error${errors.length === 1 ? '' : 's'} to repair` : ''}
          </span>
        </Link>
        <Link to="/practice/statements" className="lane-card statements">
          <span className="lane-kicker">Lane 2</span>
          <h2>Financial Statement Practice</h2>
          <p>
            Integrated cases: from a trial balance and adjustments to complete financial
            statements, with diagnosis, repair and an altered retest.
          </p>
          <span className="lane-meta">
            {spines.length} case{spines.length === 1 ? '' : 's'} available
          </span>
        </Link>
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
    </div>
  )
}
