import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useNotes } from '../../lib/notesContext'
import { Markdown } from '../../lib/markdown'
import { track } from '../../lib/practice/analytics'
import {
  clearLocalDraft,
  fetchItem,
  loadLocalDraft,
  saveLocalDraft,
  startSession,
  submitAttempt,
  type LearningItem,
  type SubmitResult,
} from '../../lib/practice/api'
import {
  countAnswered,
  totalCells,
  type MatrixConfig,
  type MatrixResponse,
} from '../../lib/practice/scoring.ts'
import { validateMatrixConfig } from '../../lib/practice/validate.ts'
import { MatrixRunner } from '../../components/practice/MatrixRunner'
import { MatrixResults } from '../../components/practice/MatrixResults'

// Drop draft selections that no longer exist in the config (the question may
// have been edited since the draft was saved).
function sanitizeResponse(config: MatrixConfig, r: MatrixResponse): MatrixResponse {
  const optionIds = new Set(config.options.map((o) => o.id))
  const colIds = new Set(config.columns.map((c) => c.id))
  const out: MatrixResponse = {}
  for (const row of config.rows) {
    const cells = r?.[row.id]
    if (!cells) continue
    for (const [colId, opt] of Object.entries(cells)) {
      if (colIds.has(colId) && typeof opt === 'string' && optionIds.has(opt)) {
        ;(out[row.id] ??= {})[colId] = opt
      }
    }
  }
  return out
}

export default function PracticeRun() {
  const { itemId } = useParams()
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  const [item, setItem] = useState<LearningItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [response, setResponse] = useState<MatrixResponse>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  // Ids that make a run: session (best-effort) + idempotency key + start time.
  const runRef = useRef<{ sessionId: string | null; submissionId: string; startedAt: number }>({
    sessionId: null,
    submissionId: '',
    startedAt: 0,
  })

  const config = useMemo(() => {
    if (!item || item.kind !== 'matrix_select') return null
    const c = item.config as unknown
    return validateMatrixConfig(c).length === 0 ? (c as MatrixConfig) : null
  }, [item])

  // Load the item.
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    setResult(null)
    fetchItem(itemId!)
      .then((it) => {
        if (active) setItem(it)
      })
      .catch((e) => {
        if (active) setLoadError(e.message || 'Failed to load activity')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [itemId])

  // Start (or restore) a run once the item is known.
  useEffect(() => {
    if (!item || !config) return
    const draft = loadLocalDraft(item.id, userId)
    if (draft && draft.client_submission_id) {
      runRef.current = {
        sessionId: draft.session_id,
        submissionId: draft.client_submission_id,
        startedAt: draft.started_at || Date.now(),
      }
      setResponse(sanitizeResponse(config, draft.answers))
    } else {
      runRef.current = {
        sessionId: null,
        submissionId: crypto.randomUUID(),
        startedAt: Date.now(),
      }
      setResponse({})
      // Best-effort session row; practice still works if it fails (attempt
      // stores session_id = null).
      startSession(item.id)
        .then((s) => {
          runRef.current.sessionId = s.id
          saveLocalDraft(item.id, userId, {
            answers: {},
            session_id: s.id,
            client_submission_id: runRef.current.submissionId,
            started_at: runRef.current.startedAt,
          })
        })
        .catch(() => {})
    }
    track('practice_started', { item_id: item.id })
  }, [item, config, userId])

  const onChange = useCallback(
    (rowId: string, colId: string, optionId: string) => {
      if (!item) return
      setResponse((prev) => {
        const next: MatrixResponse = { ...prev, [rowId]: { ...prev[rowId] } }
        if (optionId) next[rowId][colId] = optionId
        else delete next[rowId][colId]
        saveLocalDraft(item.id, userId, {
          answers: next,
          session_id: runRef.current.sessionId,
          client_submission_id: runRef.current.submissionId,
          started_at: runRef.current.startedAt,
        })
        return next
      })
      track('question_answer_changed', { item_id: item.id })
    },
    [item, userId],
  )

  async function submit() {
    if (!item || !config || submitting || result) return
    setSubmitting(true)
    setSubmitError(null)
    track('practice_submitted', { item_id: item.id })
    try {
      const res = await submitAttempt({
        item_id: item.id,
        session_id: runRef.current.sessionId,
        client_submission_id: runRef.current.submissionId,
        answers: response,
        duration_ms: Math.max(0, Date.now() - runRef.current.startedAt),
      })
      clearLocalDraft(item.id, userId)
      setResult(res)
      track('practice_completed', {
        item_id: item.id,
        cell_score: res.cell_score,
        cell_max: res.cell_max,
      })
      for (const row of res.feedback.rows) {
        track(row.row_correct ? 'question_answered_correctly' : 'question_answered_incorrectly', {
          item_id: item.id,
          row_id: row.row_id,
        })
      }
      window.scrollTo(0, 0)
    } catch (e: any) {
      // The learner's answers stay intact; the same submission id makes a
      // retry idempotent server-side.
      setSubmitError(e.message || 'Submission failed — your answers are still here. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function retry() {
    if (!item) return
    clearLocalDraft(item.id, userId)
    runRef.current = { sessionId: null, submissionId: crypto.randomUUID(), startedAt: Date.now() }
    setResponse({})
    setResult(null)
    setSubmitError(null)
    startSession(item.id)
      .then((s) => {
        runRef.current.sessionId = s.id
      })
      .catch(() => {})
    track('practice_retried', { item_id: item.id })
  }

  function reset() {
    if (!item) return
    if (!window.confirm('Clear all your answers for this activity?')) return
    setResponse({})
    saveLocalDraft(item.id, userId, {
      answers: {},
      session_id: runRef.current.sessionId,
      client_submission_id: runRef.current.submissionId,
      started_at: runRef.current.startedAt,
    })
  }

  if (loading) return <div className="page muted">Loading activity…</div>
  if (loadError)
    return (
      <div className="page">
        <h1>Something went wrong</h1>
        <p className="muted">{loadError}</p>
        <Link className="btn" to="/practice">
          ← Back to practice
        </Link>
      </div>
    )
  if (!item)
    return (
      <div className="page">
        <h1>Activity not found</h1>
        <p className="muted">It may be unpublished or the link is wrong.</p>
        <Link className="btn" to="/practice">
          ← Back to practice
        </Link>
      </div>
    )
  if (!config)
    return (
      <div className="page">
        <h1>{item.title}</h1>
        <p className="muted">
          This question type ({item.kind}) is not supported yet, or its configuration is invalid.
        </p>
        <Link className="btn" to="/practice">
          ← Back to practice
        </Link>
      </div>
    )

  const answered = countAnswered(config, response)
  const total = totalCells(config)
  const complete = answered === total
  const sourceNote = item.source_slug && knownSlugs.has(item.source_slug) ? item.source_slug : null

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> · {item.paper || 'ACCA'}
        {item.topic ? ` · ${item.topic}` : ''}
      </div>
      <div className="page-head">
        <h1>{item.title}</h1>
        {!result && (
          <span className="practice-progress" aria-live="polite">
            {answered} of {total} entries completed
          </span>
        )}
      </div>
      <div className="practice-meta">
        {item.difficulty && <span className="meta-chip">{item.difficulty}</span>}
        {item.syllabus_area && <span className="meta-chip">{item.syllabus_area}</span>}
      </div>

      <div className="question-card">
        <div className="markdown question-prompt">
          <Markdown content={item.prompt_md} knownSlugs={knownSlugs} />
        </div>
        {config.note_md && (
          <div className="question-note">
            <span className="question-note-title">Note</span>
            <div className="markdown">
              <Markdown content={config.note_md} knownSlugs={knownSlugs} />
            </div>
          </div>
        )}

        {result ? (
          <MatrixResults
            feedback={result.feedback}
            overallExplanationMd={result.overall_explanation_md}
          />
        ) : (
          <>
            <MatrixRunner
              config={config}
              response={response}
              onChange={onChange}
              disabled={submitting}
            />
            {submitError && (
              <div className="msg error" role="alert">
                {submitError}
              </div>
            )}
            <div className="practice-actions">
              <button className="btn" onClick={reset} disabled={submitting || answered === 0}>
                Clear answers
              </button>
              <div className="practice-actions-right">
                {!complete && (
                  <span className="muted practice-remaining">
                    {total - answered} left to answer
                  </span>
                )}
                <button
                  className="btn primary"
                  onClick={submit}
                  disabled={!complete || submitting}
                >
                  {submitting ? 'Checking…' : 'Submit answers'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {result && (
        <div className="practice-actions after">
          <button className="btn primary" onClick={retry}>
            Retry activity
          </button>
          {sourceNote && (
            <Link
              className="btn"
              to={`/note/${sourceNote}`}
              onClick={() => track('source_note_opened', { item_id: item.id })}
            >
              Review source note
            </Link>
          )}
          <Link className="btn" to="/practice">
            Return to practice
          </Link>
        </div>
      )}
    </div>
  )
}
