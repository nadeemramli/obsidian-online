import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useNotes } from '../../lib/notesContext'
import { Markdown } from '../../lib/markdown'
import { track } from '../../lib/practice/analytics'
import {
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
  submitAttempt,
  type LearningItem,
  type SubmitResult,
} from '../../lib/practice/api'
import type { MatrixResponse } from '../../lib/practice/scoring.ts'
import { questionKinds } from '../../lib/practice/registry'
import { MatrixResults } from './MatrixResults'

// One item run inside a larger composition (quiz or case). Shares the same
// draft mechanism as standalone practice, so an interrupted quiz/case resumes
// with inputs intact. Submits through the standard engine with the parent's
// session id; shows full feedback inline, then hands control back.
export function StageRun({
  item,
  sessionId,
  nextLabel,
  onDone,
}: {
  item: LearningItem
  sessionId: string | null
  nextLabel: string
  onDone: (result: SubmitResult) => void
}) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  const kindDef = questionKinds[item.kind]
  const config = useMemo(() => (kindDef ? kindDef.parseConfig(item.config) : null), [kindDef, item])

  const [response, setResponse] = useState<MatrixResponse>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const runRef = useRef<{ submissionId: string; startedAt: number }>({
    submissionId: '',
    startedAt: 0,
  })

  useEffect(() => {
    if (!config) return
    setResult(null)
    setSubmitError(null)
    const draft = loadLocalDraft(item.id, userId)
    if (draft && draft.client_submission_id) {
      runRef.current = {
        submissionId: draft.client_submission_id,
        startedAt: draft.started_at || Date.now(),
      }
      setResponse(kindDef!.sanitize(config, draft.answers))
    } else {
      runRef.current = { submissionId: crypto.randomUUID(), startedAt: Date.now() }
      setResponse({})
    }
    track('practice_started', { item_id: item.id })
  }, [item.id, config, kindDef, userId])

  const onChange = useCallback(
    (rowId: string, colId: string, value: string) => {
      setResponse((prev) => {
        const next: MatrixResponse = { ...prev, [rowId]: { ...prev[rowId] } }
        if (value) next[rowId][colId] = value
        else delete next[rowId][colId]
        saveLocalDraft(item.id, userId, {
          answers: next,
          session_id: sessionId,
          client_submission_id: runRef.current.submissionId,
          started_at: runRef.current.startedAt,
        })
        return next
      })
    },
    [item.id, userId, sessionId],
  )

  async function submit() {
    if (!config || submitting || result) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await submitAttempt({
        item_id: item.id,
        session_id: sessionId,
        client_submission_id: runRef.current.submissionId,
        answers: response,
        duration_ms: Math.max(0, Date.now() - runRef.current.startedAt),
      })
      clearLocalDraft(item.id, userId)
      setResult(res)
      window.scrollTo(0, 0)
    } catch (e: any) {
      setSubmitError(e.message || 'Submission failed — your answers are still here.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!config)
    return (
      <p className="muted">
        This question ({item.kind}) cannot be displayed — its configuration is invalid.
      </p>
    )

  const Runner = kindDef!.Runner
  const answered = kindDef!.countAnswered(config, response)
  const total = kindDef!.totalCells(config)
  const complete = answered === total

  return (
    <div>
      <div className="markdown question-prompt">
        <Markdown content={item.prompt_md} knownSlugs={knownSlugs} />
      </div>
      {(config as any).note_md && (
        <div className="question-note">
          <span className="question-note-title">Note</span>
          <div className="markdown">
            <Markdown content={(config as any).note_md} knownSlugs={knownSlugs} />
          </div>
        </div>
      )}

      {result ? (
        <>
          <MatrixResults
            feedback={result.feedback}
            overallExplanationMd={result.overall_explanation_md}
          />
          <div className="practice-actions after">
            <button className="btn primary" onClick={() => onDone(result)}>
              {nextLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <Runner config={config} response={response} onChange={onChange} disabled={submitting} />
          {submitError && (
            <div className="msg error" role="alert">
              {submitError}
            </div>
          )}
          <div className="practice-actions">
            <span className="practice-progress" aria-live="polite">
              {answered} of {total} entries completed
            </span>
            <div className="practice-actions-right">
              {!complete && (
                <span className="muted practice-remaining">{total - answered} left to answer</span>
              )}
              <button className="btn primary" onClick={submit} disabled={!complete || submitting}>
                {submitting ? 'Checking…' : 'Submit answers'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
