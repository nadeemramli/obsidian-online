import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchAttempt, fetchItem, type Attempt, type LearningItem } from '../../lib/practice/api'
import type { MatrixFeedback } from '../../lib/practice/scoring.ts'
import { MatrixResults } from '../../components/practice/MatrixResults'

// A stored attempt, rendered entirely from its feedback snapshot. The item is
// fetched only for the title/retry link; if it was edited or unpublished since,
// the snapshot still tells the full story (PRD §B.9).
export default function AttemptView() {
  const { attemptId } = useParams()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [item, setItem] = useState<LearningItem | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchAttempt(attemptId!)
      .then(async (a) => {
        if (!active) return
        setAttempt(a)
        if (a) {
          try {
            setItem(await fetchItem(a.item_id))
          } catch {
            /* item may be unpublished; snapshot is enough */
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [attemptId])

  if (loading) return <div className="page muted">Loading attempt…</div>
  if (!attempt)
    return (
      <div className="page">
        <h1>Attempt not found</h1>
        <Link className="btn" to="/practice/history">
          ← Back to history
        </Link>
      </div>
    )

  const feedback = attempt.feedback as unknown as MatrixFeedback
  const overall =
    (attempt.feedback as any)?.overall_explanation_md ??
    null /* stored inside feedback by the edge function */

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> · <Link to="/practice/history">History</Link>
      </div>
      <div className="page-head">
        <h1>{item?.title ?? 'Practice attempt'}</h1>
      </div>
      <p className="muted">
        Attempted {new Date(attempt.created_at).toLocaleString()} · question version{' '}
        {attempt.item_version}
        {attempt.duration_ms != null && ` · ${Math.round(attempt.duration_ms / 1000)}s`}
      </p>
      <div className="question-card">
        <MatrixResults feedback={feedback} overallExplanationMd={overall} />
      </div>
      <div className="practice-actions after">
        {item && (
          <Link className="btn primary" to={`/practice/run/${item.id}`}>
            Practice again
          </Link>
        )}
        <Link className="btn" to="/practice/history">
          Back to history
        </Link>
      </div>
    </div>
  )
}
