import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  fetchItemsByIds,
  fetchQuiz,
  fetchQuizItems,
  startSession,
  type LearningItem,
  type Quiz,
  type SubmitResult,
} from '../../lib/practice/api'
import { StageRun } from '../../components/practice/StageRun'

// Sequential run through an authored quiz: one shared session, one attempt per
// item through the standard engine, full feedback after each item (Learn
// behavior), and a summary at the end.
export default function QuizRunner() {
  const { quizId } = useParams()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [items, setItems] = useState<LearningItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Array<SubmitResult & { item: LearningItem }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const q = await fetchQuiz(quizId!)
        if (!q) {
          setError('Quiz not found (it may be unpublished).')
          return
        }
        const membership = await fetchQuizItems(q.id)
        const fetched = await fetchItemsByIds(membership.map((m) => m.item_id))
        const ordered = membership
          .map((m) => fetched.find((i) => i.id === m.item_id))
          .filter(Boolean) as LearningItem[]
        if (!active) return
        setQuiz(q)
        setItems(ordered)
        if (ordered.length > 0) {
          const s = await startSession(ordered[0].id, { lane: 'specific', quizId: q.id })
          if (active) setSessionId(s.id)
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed to load quiz')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [quizId])

  const done = index >= items.length && items.length > 0
  const totals = useMemo(
    () =>
      results.reduce(
        (acc, r) => ({
          score: acc.score + r.cell_score,
          max: acc.max + r.cell_max,
        }),
        { score: 0, max: 0 },
      ),
    [results],
  )

  useEffect(() => {
    if (done && sessionId) {
      void supabase
        .from('practice_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
  }, [done, sessionId])

  if (loading) return <div className="page muted">Loading quiz…</div>
  if (error || !quiz)
    return (
      <div className="page">
        <h1>Quiz unavailable</h1>
        <p className="muted">{error}</p>
        <Link className="btn" to="/practice/specific">
          ← Back to Specific Practice
        </Link>
      </div>
    )
  if (items.length === 0)
    return (
      <div className="page">
        <h1>{quiz.title}</h1>
        <p className="muted">This quiz has no questions yet.</p>
        <Link className="btn" to="/practice/specific">
          ← Back
        </Link>
      </div>
    )

  if (done) {
    const pct = totals.max > 0 ? Math.round((totals.score / totals.max) * 100) : 0
    return (
      <div className="page practice-page">
        <div className="crumb muted">
          <Link to="/practice">Practice</Link> · <Link to="/practice/specific">Specific</Link> ·{' '}
          {quiz.title}
        </div>
        <div className="page-head">
          <h1>Quiz complete</h1>
        </div>
        <div className="result-summary" role="status">
          <div className="result-score">
            <span className="result-num">
              {totals.score}/{totals.max}
            </span>
            <span className="result-caption">entries correct across the quiz</span>
          </div>
          <div className="result-score">
            <span className="result-num">{pct}%</span>
            <span className="result-caption">score</span>
          </div>
        </div>
        <h3 className="section-h">Question by question</h3>
        <div className="activity-list">
          {results.map((r, i) => (
            <Link key={r.attempt_id} to={`/practice/attempt/${r.attempt_id}`} className="activity-card">
              <div className="activity-main">
                <strong>
                  {i + 1}. {r.item.title}
                </strong>
              </div>
              <span className="activity-side">
                {r.cell_score}/{r.cell_max}
              </span>
            </Link>
          ))}
        </div>
        <div className="practice-actions after">
          <Link className="btn primary" to="/practice/specific">
            Back to Specific Practice
          </Link>
          <Link className="btn" to="/practice/history">
            View history
          </Link>
        </div>
      </div>
    )
  }

  const item = items[index]
  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> · <Link to="/practice/specific">Specific</Link> ·{' '}
        {quiz.title}
      </div>
      <div className="page-head">
        <h1>{item.title}</h1>
        <span className="practice-progress">
          Question {index + 1} of {items.length}
        </span>
      </div>
      <div className="question-card">
        <StageRun
          key={item.id}
          item={item}
          sessionId={sessionId}
          nextLabel={index + 1 < items.length ? 'Next question →' : 'Finish quiz'}
          onDone={(result) => {
            setResults((prev) => [...prev, { ...result, item }])
            setIndex((i) => i + 1)
            window.scrollTo(0, 0)
          }}
        />
      </div>
    </div>
  )
}
