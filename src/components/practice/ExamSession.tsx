import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNotes } from '../../lib/notesContext'
import { Markdown } from '../../lib/markdown'
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

export type ExamEntry = { item: LearningItem; sectionLabel?: string }

// Generic exam-mode session (PRD §8.3/§6.2): strict countdown, palette with
// answered/flagged states, free navigation, zero feedback before submission,
// one submit for the whole set, auto-submit exactly once on expiry. Used by
// timed quizzes and by mock assembly (Section A OTs + Section B case stages).
export function ExamSession({
  title,
  crumb,
  entries,
  sessionId,
  storageKey,
  totalSecondsDefault,
  backHref,
  backLabel,
}: {
  title: string
  crumb: React.ReactNode
  entries: ExamEntry[]
  sessionId: string | null
  storageKey: string
  totalSecondsDefault: number
  backHref: string
  backLabel: string
}) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const [search] = useSearchParams()

  const totalSeconds = useMemo(() => {
    const t = Number(search.get('t'))
    if (Number.isInteger(t) && t > 0) return t // test/practice override
    return totalSecondsDefault
  }, [search, totalSecondsDefault])

  const items = useMemo(() => entries.map((e) => e.item), [entries])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, MatrixResponse>>({})
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [deadline, setDeadline] = useState<number>(0)
  const [remaining, setRemaining] = useState<number>(totalSeconds)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<Array<SubmitResult & { item: LearningItem }> | null>(null)
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionIds = useRef<Record<string, string>>({})
  const submitOnce = useRef(false)

  // Restore drafts + exam state (deadline, flags) so a refresh resumes the run.
  useEffect(() => {
    const restored: Record<string, MatrixResponse> = {}
    for (const item of items) {
      const draft = loadLocalDraft(item.id, userId)
      const kindDef = questionKinds[item.kind]
      const config = kindDef?.parseConfig(item.config)
      submissionIds.current[item.id] = draft?.client_submission_id ?? crypto.randomUUID()
      restored[item.id] = draft && config ? kindDef!.sanitize(config, draft.answers) : {}
    }
    setAnswers(restored)
    let dl = Date.now() + totalSeconds * 1000
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (saved?.deadline && saved.deadline > Date.now()) {
        dl = saved.deadline
        setFlags(new Set(saved.flags ?? []))
      } else {
        localStorage.setItem(storageKey, JSON.stringify({ deadline: dl, flags: [] }))
      }
    } catch {
      /* fresh state */
    }
    setDeadline(dl)
  }, [items, userId, storageKey, totalSeconds])

  const submitAll = useCallback(
    async (auto: boolean) => {
      if (submitOnce.current) return
      submitOnce.current = true
      setSubmitting(true)
      setError(null)
      try {
        const collected: Array<SubmitResult & { item: LearningItem }> = []
        for (const item of items) {
          const res = await submitAttempt({
            item_id: item.id,
            session_id: sessionId,
            client_submission_id: submissionIds.current[item.id],
            answers: answers[item.id] ?? {},
          })
          collected.push({ ...res, item })
          clearLocalDraft(item.id, userId)
        }
        localStorage.removeItem(storageKey)
        if (sessionId) {
          await supabase
            .from('practice_sessions')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', sessionId)
        }
        setAutoSubmitted(auto)
        setResults(collected)
        window.scrollTo(0, 0)
      } catch (e: any) {
        submitOnce.current = false // answers are intact; allow retry
        setError(e.message || 'Submission failed — your answers are still here.')
      } finally {
        setSubmitting(false)
      }
    },
    [items, sessionId, answers, userId, storageKey],
  )

  // Countdown; auto-submit exactly once at zero.
  useEffect(() => {
    if (!deadline || results) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) void submitAll(true)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadline, results, submitAll])

  const onChange = useCallback(
    (itemId: string) => (rowId: string, colId: string, value: string) => {
      setAnswers((prev) => {
        const nextItem: MatrixResponse = { ...prev[itemId], [rowId]: { ...prev[itemId]?.[rowId] } }
        if (value) nextItem[rowId][colId] = value
        else delete nextItem[rowId][colId]
        saveLocalDraft(itemId, userId, {
          answers: nextItem,
          session_id: sessionId,
          client_submission_id: submissionIds.current[itemId],
          started_at: Date.now(),
        })
        return { ...prev, [itemId]: nextItem }
      })
    },
    [userId, sessionId],
  )

  const answeredCount = (item: LearningItem) => {
    const kindDef = questionKinds[item.kind]
    const config = kindDef?.parseConfig(item.config)
    return config ? kindDef!.countAnswered(config, answers[item.id] ?? {}) : 0
  }
  const isAnswered = (item: LearningItem) => {
    const kindDef = questionKinds[item.kind]
    const config = kindDef?.parseConfig(item.config)
    return config
      ? kindDef!.countAnswered(config, answers[item.id] ?? {}) >= kindDef!.totalCells(config)
      : false
  }

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  if (results) {
    const totals = results.reduce(
      (acc, r) => ({ score: acc.score + r.cell_score, max: acc.max + r.cell_max }),
      { score: 0, max: 0 },
    )
    const pct = totals.max > 0 ? Math.round((totals.score / totals.max) * 100) : 0
    // Per-section subtotals when sections are in play.
    const sections = new Map<string, { score: number; max: number }>()
    results.forEach((r, i) => {
      const label = entries[i].sectionLabel
      if (!label) return
      const s = sections.get(label) ?? { score: 0, max: 0 }
      s.score += r.cell_score
      s.max += r.cell_max
      sections.set(label, s)
    })
    return (
      <div className="page practice-page">
        <div className="crumb muted">{crumb}</div>
        <div className="page-head">
          <h1>Exam submitted</h1>
        </div>
        {autoSubmitted && (
          <p className="msg" role="status">
            ⏱ Time expired — your answers were submitted automatically.
          </p>
        )}
        <div className="result-summary" role="status">
          <div className="result-score">
            <span className="result-num">
              {totals.score}/{totals.max}
            </span>
            <span className="result-caption">cells correct (independent-cell marking)</span>
          </div>
          <div className="result-score">
            <span className="result-num">{pct}%</span>
            <span className="result-caption">score</span>
          </div>
          {Array.from(sections.entries()).map(([label, s]) => (
            <div className="result-score" key={label}>
              <span className="result-num">
                {s.score}/{s.max}
              </span>
              <span className="result-caption">{label}</span>
            </div>
          ))}
        </div>
        <h3 className="section-h">Question by question</h3>
        {results.map((r, i) => (
          <details key={r.attempt_id} className="exam-results-item">
            <summary>
              {entries[i].sectionLabel ? `[${entries[i].sectionLabel}] ` : ''}
              {i + 1}. {r.item.title} — {r.cell_score}/{r.cell_max}
              {flags.has(r.item.id) ? ' ⚑' : ''}
            </summary>
            <div className="question-card">
              <MatrixResults feedback={r.feedback} overallExplanationMd={r.overall_explanation_md} />
            </div>
          </details>
        ))}
        <div className="practice-actions after">
          <Link className="btn primary" to={backHref}>
            {backLabel}
          </Link>
          <Link className="btn" to="/practice/history">
            View history
          </Link>
        </div>
      </div>
    )
  }

  const item = items[index]
  const kindDef = questionKinds[item.kind]
  const config = kindDef?.parseConfig(item.config)
  const Runner = kindDef?.Runner
  const unansweredTotal = items.filter((it) => !isAnswered(it)).length
  const sectionLabel = entries[index].sectionLabel

  return (
    <div className="page practice-page">
      <div className="crumb muted">{crumb}</div>

      <div className="exam-bar">
        <span
          className={'exam-timer' + (remaining <= 60 ? ' low' : '')}
          role="timer"
          aria-label={`Time remaining ${mmss}`}
        >
          ⏱ {mmss}
        </span>
        <div className="exam-palette" aria-label="Question navigation">
          {items.map((it, i) => (
            <button
              key={it.id}
              className={
                'palette-chip' +
                (i === index ? ' current' : '') +
                (isAnswered(it) ? ' answered' : '') +
                (flags.has(it.id) ? ' flagged' : '')
              }
              aria-label={`Question ${i + 1}${isAnswered(it) ? ', answered' : ''}${flags.has(it.id) ? ', flagged' : ''}`}
              title={entries[i].sectionLabel}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          className="btn primary"
          disabled={submitting}
          onClick={() => {
            if (
              unansweredTotal === 0 ||
              window.confirm(
                `${unansweredTotal} question${unansweredTotal === 1 ? ' is' : 's are'} not fully answered. Submit anyway?`,
              )
            )
              void submitAll(false)
          }}
        >
          {submitting ? 'Submitting…' : 'Submit exam'}
        </button>
      </div>
      {error && (
        <div className="msg error" role="alert">
          {error}
        </div>
      )}

      <div className="question-card">
        <div className="exam-question-head">
          <h3 className="stage-title">
            {sectionLabel ? `${sectionLabel} · ` : ''}Question {index + 1} of {items.length}
          </h3>
          <button
            className={'btn' + (flags.has(item.id) ? ' flagged' : '')}
            onClick={() =>
              setFlags((prev) => {
                const next = new Set(prev)
                if (next.has(item.id)) next.delete(item.id)
                else next.add(item.id)
                try {
                  localStorage.setItem(storageKey, JSON.stringify({ deadline, flags: Array.from(next) }))
                } catch {
                  /* best effort */
                }
                return next
              })
            }
          >
            {flags.has(item.id) ? '⚑ Flagged' : '⚐ Flag for review'}
          </button>
        </div>
        <div className="markdown question-prompt">
          <Markdown content={item.prompt_md} knownSlugs={knownSlugs} />
        </div>
        {config && Runner ? (
          <Runner
            config={config}
            response={answers[item.id] ?? {}}
            onChange={onChange(item.id)}
            disabled={submitting}
          />
        ) : (
          <p className="muted">This question cannot be displayed.</p>
        )}
        <div className="practice-actions">
          <button className="btn" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            ← Previous
          </button>
          <span className="muted practice-remaining">
            {answeredCount(item)} entr{answeredCount(item) === 1 ? 'y' : 'ies'} filled on this question
          </span>
          <button
            className="btn"
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            disabled={index === items.length - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
