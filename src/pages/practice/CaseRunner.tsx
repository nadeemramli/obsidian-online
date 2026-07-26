import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  fetchItemsByIds,
  fetchSpine,
  fetchSpineStages,
  startSession,
  type LearningItem,
  type PracticeSpine,
  type SubmitResult,
} from '../../lib/practice/api'
import { StageRun } from '../../components/practice/StageRun'

import { diagnose, type SpineDiagnosisConfig } from '../../lib/practice/diagnose.ts'

type SpineConfig = SpineDiagnosisConfig
type StageResult = SubmitResult & { item: LearningItem }

export default function CaseRunner() {
  const { spineId } = useParams()
  const [spine, setSpine] = useState<PracticeSpine | null>(null)
  const [items, setItems] = useState<LearningItem[]>([])
  const [stageTitles, setStageTitles] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<StageResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const s = await fetchSpine(spineId!)
        if (!s) {
          setError('Case not found (it may be unpublished).')
          return
        }
        const stages = await fetchSpineStages(s.id)
        const fetched = await fetchItemsByIds(stages.map((st) => st.item_id))
        const ordered = stages
          .map((st) => fetched.find((i) => i.id === st.item_id))
          .filter(Boolean) as LearningItem[]
        if (!active) return
        setSpine(s)
        setItems(ordered)
        setStageTitles(stages.map((st, i) => st.title || `Stage ${i + 1}`))
        setIndex(0)
        setResults([])
        if (ordered.length > 0) {
          const sess = await startSession(ordered[0].id, { lane: 'statements', spineId: s.id })
          if (active) setSessionId(sess.id)
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed to load case')
      } finally {
        if (active) setLoading(false)
      }
    }
    setLoading(true)
    void load()
    return () => {
      active = false
    }
  }, [spineId])

  const config = (spine?.config ?? {}) as SpineConfig
  const done = items.length > 0 && index >= items.length

  useEffect(() => {
    if (done && sessionId) {
      void supabase
        .from('practice_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
  }, [done, sessionId])

  const totals = useMemo(
    () =>
      results.reduce(
        (acc, r) => ({ score: acc.score + r.cell_score, max: acc.max + r.cell_max }),
        { score: 0, max: 0 },
      ),
    [results],
  )
  const diagnosis = useMemo(
    () =>
      done && config.skills
        ? diagnose(
            config.skills,
            results.map((r) => r.feedback),
          )
        : null,
    [done, config.skills, results],
  )

  if (loading) return <div className="page muted">Loading case…</div>
  if (error || !spine)
    return (
      <div className="page">
        <h1>Case unavailable</h1>
        <p className="muted">{error}</p>
        <Link className="btn" to="/practice/statements">
          ← Back to Financial Statement Practice
        </Link>
      </div>
    )

  const stageNav = (
    <div className="stage-nav" aria-label="Case stages">
      {stageTitles.map((t, i) => (
        <span
          key={i}
          className={
            'stage-chip' + (i < index ? ' done' : '') + (i === index && !done ? ' current' : '')
          }
        >
          {i < index ? '✓ ' : ''}
          {t}
          {i < index && results[i] ? (
            <span className="muted"> {results[i].cell_score}/{results[i].cell_max}</span>
          ) : null}
        </span>
      ))}
    </div>
  )

  if (done) {
    const pct = totals.max > 0 ? Math.round((totals.score / totals.max) * 100) : 0
    return (
      <div className="page practice-page">
        <div className="crumb muted">
          <Link to="/practice">Practice</Link> ·{' '}
          <Link to="/practice/statements">Financial statements</Link> · {spine.title}
        </div>
        <div className="page-head">
          <h1>Case complete</h1>
        </div>
        {config.is_retest_variant && (
          <p className="hint">
            This was the altered retest — a clean run here is real evidence of transfer, not
            memorisation.
          </p>
        )}
        <div className="result-summary" role="status">
          <div className="result-score">
            <span className="result-num">
              {totals.score}/{totals.max}
            </span>
            <span className="result-caption">cells correct across the case</span>
          </div>
          <div className="result-score">
            <span className="result-num">{pct}%</span>
            <span className="result-caption">score</span>
          </div>
          {diagnosis && (
            <div className="result-score">
              <span className="result-num">{diagnosis.failedSkills.length}</span>
              <span className="result-caption">root error{diagnosis.failedSkills.length === 1 ? '' : 's'}</span>
            </div>
          )}
        </div>

        <h3 className="section-h">Stages</h3>
        <div className="activity-list">
          {results.map((r, i) => (
            <Link key={r.attempt_id} to={`/practice/attempt/${r.attempt_id}`} className="activity-card">
              <div className="activity-main">
                <strong>{stageTitles[i]}</strong>
                <span className="muted activity-sub">{r.item.title}</span>
              </div>
              <span className="activity-side">
                {r.cell_score}/{r.cell_max}
              </span>
            </Link>
          ))}
        </div>

        {diagnosis && (
          <>
            <h3 className="section-h">Diagnosis</h3>
            {diagnosis.failedSkills.length === 0 ? (
              <p className="muted">
                No root errors — every diagnosed skill held up across the whole case.
              </p>
            ) : (
              <div className="skill-list">
                {diagnosis.failedSkills.map((s) => (
                  <div key={s.id} className="skill-row err">
                    <div className="skill-main">
                      <span className="verdict-chip err" aria-hidden="true">
                        ✗
                      </span>
                      <div>
                        <strong>{s.label}</strong> — root error
                        <div className="muted skill-note">
                          Knock-on effects in later lines are diagnosed as consequences of this
                          error, not separate weaknesses.
                        </div>
                      </div>
                    </div>
                    {s.repair_item_id && (
                      <Link className="btn primary" to={`/practice/run/${s.repair_item_id}`}>
                        Repair this skill
                      </Link>
                    )}
                  </div>
                ))}
                {diagnosis.okSkills.length > 0 && (
                  <div className="skill-row ok">
                    <div className="skill-main">
                      <span className="verdict-chip ok" aria-hidden="true">
                        ✓
                      </span>
                      <div>
                        <strong>Solid:</strong>{' '}
                        {diagnosis.okSkills.map((s) => s.label).join(', ')}
                      </div>
                    </div>
                  </div>
                )}
                <p className="muted skill-note">
                  {diagnosis.downstreamRows.size > 0 &&
                    `${diagnosis.downstreamRows.size} wrong line${diagnosis.downstreamRows.size === 1 ? ' was' : 's were'} downstream consequences of the root errors. `}
                  {diagnosis.independent.length > 0 &&
                    `${diagnosis.independent.length} error${diagnosis.independent.length === 1 ? ' was' : 's were'} independent — open the stage reviews above to see them.`}
                </p>
              </div>
            )}
          </>
        )}

        <div className="practice-actions after">
          {config.retest_spine_id && (
            <Link className="btn primary" to={`/practice/case/${config.retest_spine_id}`}>
              {diagnosis && diagnosis.failedSkills.length > 0
                ? 'Repair first, then try the altered case'
                : 'Prove it: altered case →'}
            </Link>
          )}
          <Link className="btn" to="/practice/statements">
            Back to Financial Statement Practice
          </Link>
        </div>
      </div>
    )
  }

  const item = items[index]
  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> ·{' '}
        <Link to="/practice/statements">Financial statements</Link> · {spine.title}
      </div>
      <div className="page-head">
        <h1>{spine.title}</h1>
      </div>
      {stageNav}
      <div className="question-card">
        <h3 className="stage-title">{stageTitles[index]}</h3>
        <StageRun
          key={item.id}
          item={item}
          sessionId={sessionId}
          nextLabel={index + 1 < items.length ? 'Next stage →' : 'Finish case'}
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
