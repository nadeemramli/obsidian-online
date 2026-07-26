import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  fetchGeneratedCase,
  fetchItemsByIds,
  fetchSpine,
  fetchSpineStages,
  generateCase,
  startSession,
  type LearningItem,
  type SubmitResult,
} from '../../lib/practice/api'
import { diagnose, type SpineDiagnosisConfig } from '../../lib/practice/diagnose.ts'
import { StageRun } from '../../components/practice/StageRun'

type StageDef = {
  title: string
  item: LearningItem
  generated?: { caseId: string; stageIndex: number }
}
type CaseSource = {
  title: string
  config: SpineDiagnosisConfig
  stages: StageDef[]
  isGenerated: boolean
}
type StageResult = SubmitResult & { item: LearningItem }

// Runs an integrated case from either source: an authored spine
// (/practice/case/:spineId) or a seeded generated case
// (/practice/generated/:caseId). Same stages, marking, and diagnosis.
export default function CaseRunner() {
  const { spineId, caseId } = useParams()
  const navigate = useNavigate()
  const [source, setSource] = useState<CaseSource | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<StageResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let next: CaseSource | null = null
        if (caseId) {
          const row = await fetchGeneratedCase(caseId)
          if (!row) {
            setError('Case not found.')
            return
          }
          const stages = (row.stages as any[]).map((s, i) => ({
            title: s.title || `Stage ${i + 1}`,
            generated: { caseId: row.id, stageIndex: i },
            item: {
              id: `${row.id}#${i}`, // stable draft key; never sent as item_id
              kind: s.kind,
              title: s.title,
              prompt_md: s.prompt_md ?? '',
              config: s.config,
              source_slug: null, paper: 'FFA', syllabus_area: null,
              topic: null, tags: [], difficulty: null, status: 'published',
              version: 1, created_by: null,
              created_at: row.created_at, updated_at: row.created_at,
            } as LearningItem,
          }))
          next = {
            title: row.title,
            config: row.config as SpineDiagnosisConfig,
            stages,
            isGenerated: true,
          }
        } else {
          const s = await fetchSpine(spineId!)
          if (!s) {
            setError('Case not found (it may be unpublished).')
            return
          }
          const stageRows = await fetchSpineStages(s.id)
          const fetched = await fetchItemsByIds(stageRows.map((st) => st.item_id))
          next = {
            title: s.title,
            config: s.config as SpineDiagnosisConfig,
            stages: stageRows
              .map((st, i) => ({
                title: st.title || `Stage ${i + 1}`,
                item: fetched.find((it) => it.id === st.item_id)!,
              }))
              .filter((st) => st.item),
            isGenerated: false,
          }
        }
        if (!active || !next) return
        setSource(next)
        setIndex(0)
        setResults([])
        if (next.stages.length > 0) {
          const sess = await startSession(caseId ? null : next.stages[0].item.id, {
            lane: 'statements',
            spineId: spineId ?? undefined,
            generatedCaseId: caseId ?? undefined,
          })
          if (active) setSessionId(sess.id)
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed to load case')
      } finally {
        if (active) setLoading(false)
      }
    }
    setLoading(true)
    setError(null)
    void load()
    return () => {
      active = false
    }
  }, [spineId, caseId])

  const config = source?.config ?? {}
  const done = !!source && source.stages.length > 0 && index >= source.stages.length

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

  async function generateAnother() {
    setGenerating(true)
    try {
      const res = await generateCase('sole_trader')
      navigate(`/practice/generated/${res.case_id}`)
    } catch (e: any) {
      setError(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div className="page muted">Loading case…</div>
  if (error || !source)
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
      {source.stages.map((s, i) => (
        <span
          key={i}
          className={
            'stage-chip' + (i < index ? ' done' : '') + (i === index && !done ? ' current' : '')
          }
        >
          {i < index ? '✓ ' : ''}
          {s.title}
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
          <Link to="/practice/statements">Financial statements</Link> · {source.title}
        </div>
        <div className="page-head">
          <h1>Case complete</h1>
        </div>
        {(config.is_retest_variant || source.isGenerated) && (
          <p className="hint">
            {source.isGenerated
              ? 'This was a freshly generated variant — a clean run here is real evidence of transfer.'
              : 'This was the altered retest — a clean run here is real evidence of transfer, not memorisation.'}
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
              <span className="result-caption">
                root error{diagnosis.failedSkills.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        <h3 className="section-h">Stages</h3>
        <div className="activity-list">
          {results.map((r, i) => (
            <Link
              key={r.attempt_id}
              to={`/practice/attempt/${r.attempt_id}`}
              className="activity-card"
            >
              <div className="activity-main">
                <strong>{source.stages[i].title}</strong>
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
                        <strong>Solid:</strong> {diagnosis.okSkills.map((s) => s.label).join(', ')}
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
          <button className="btn primary" onClick={generateAnother} disabled={generating}>
            {generating
              ? 'Generating…'
              : diagnosis && diagnosis.failedSkills.length > 0
                ? 'Repair first, then generate an altered case'
                : '🎲 Prove it again: generate an altered case'}
          </button>
          {!source.isGenerated && config.retest_spine_id && (
            <Link className="btn" to={`/practice/case/${config.retest_spine_id}`}>
              Authored altered case
            </Link>
          )}
          <Link className="btn" to="/practice/statements">
            Back to Financial Statement Practice
          </Link>
        </div>
      </div>
    )
  }

  const stage = source.stages[index]
  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> ·{' '}
        <Link to="/practice/statements">Financial statements</Link> · {source.title}
      </div>
      <div className="page-head">
        <h1>{source.title}</h1>
      </div>
      {stageNav}
      <div className="question-card">
        <h3 className="stage-title">{stage.title}</h3>
        <StageRun
          key={stage.item.id}
          item={stage.item}
          generated={stage.generated}
          sessionId={sessionId}
          nextLabel={index + 1 < source.stages.length ? 'Next stage →' : 'Finish case'}
          onDone={(result) => {
            setResults((prev) => [...prev, { ...result, item: stage.item }])
            setIndex((i) => i + 1)
            window.scrollTo(0, 0)
          }}
        />
      </div>
    </div>
  )
}
