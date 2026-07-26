import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  fetchAttempts,
  fetchErrors,
  fetchPublishedItems,
  fetchPublishedSpines,
  fetchReviewStates,
  fetchSpineStages,
  loadLocalDraft,
  type Attempt,
  type ErrorLogEntry,
  type LearningItem,
  type PracticeSpine,
  type ReviewState,
} from '../../lib/practice/api'
import { computeMastery, MASTERY_LABELS, type StageSource } from '../../lib/practice/mastery'
import { recommendNext } from '../../lib/practice/recommend'
import type { SkillDef, SpineDiagnosisConfig } from '../../lib/practice/diagnose.ts'
import type { MatrixFeedback } from '../../lib/practice/scoring.ts'

// Two-lane practice hub (PRD §8) with the Phase-5 layer: one next-best-action
// recommendation, a repair queue, due reviews, and evidence-based mastery.
export default function PracticeHome() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const [items, setItems] = useState<LearningItem[]>([])
  const [spines, setSpines] = useState<PracticeSpine[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [reviews, setReviews] = useState<ReviewState[]>([])
  const [stageMap, setStageMap] = useState<Record<string, StageSource>>({})
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [baseSpineId, setBaseSpineId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [i, s, a, e, r] = await Promise.all([
          fetchPublishedItems(),
          fetchPublishedSpines(),
          fetchAttempts(200),
          fetchErrors(true),
          fetchReviewStates(),
        ])
        if (!active) return
        setItems(i)
        setSpines(s)
        setAttempts(a)
        setErrors(e)
        setReviews(r)

        // Build the mastery stage map from the sole-trader base spine + retest.
        const base = s.find(
          (sp) => sp.family === 'sole_trader' && !(sp.config as SpineDiagnosisConfig).is_retest_variant,
        )
        if (base) {
          setBaseSpineId(base.id)
          setSkills(((base.config as SpineDiagnosisConfig).skills ?? []) as SkillDef[])
          const retestId = (base.config as SpineDiagnosisConfig).retest_spine_id
          const map: Record<string, StageSource> = {}
          const baseStages = await fetchSpineStages(base.id)
          baseStages.forEach((st, idx) => {
            map[st.item_id] = { stage: st.position ?? idx, source: 'base' }
          })
          if (retestId) {
            try {
              const retestStages = await fetchSpineStages(retestId)
              retestStages.forEach((st, idx) => {
                map[st.item_id] = { stage: st.position ?? idx, source: 'transfer' }
              })
            } catch {
              /* retest optional */
            }
          }
          if (active) setStageMap(map)
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load practice data')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
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

  const itemTitle = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items])

  const mastery = useMemo(
    () =>
      computeMastery(
        skills,
        attempts.map((a) => ({
          item_id: a.item_id,
          generated_case_id: a.generated_case_id,
          stage_index: a.stage_index,
          created_at: a.created_at,
          feedback: a.feedback as unknown as MatrixFeedback,
        })),
        stageMap,
      ),
    [skills, attempts, stageMap],
  )

  const openErrorGroups = useMemo(() => {
    const byItem = new Map<string, number>()
    for (const e of errors) {
      if (!e.item_id) continue
      byItem.set(e.item_id, (byItem.get(e.item_id) || 0) + 1)
    }
    return Array.from(byItem.entries())
      .map(([item_id, count]) => ({ item_id, count, title: itemTitle.get(item_id) ?? 'Drill' }))
      .sort((a, b) => b.count - a.count)
  }, [errors, itemTitle])

  const dueReviews = useMemo(() => {
    const now = new Date().toISOString()
    return reviews
      .filter((r) => r.due_at && r.due_at <= now)
      .map((r) => ({ item_id: r.item_id, title: itemTitle.get(r.item_id) ?? 'Activity' }))
      .filter((r) => itemTitle.has(r.item_id))
  }, [reviews, itemTitle])

  const caseAttempted = useMemo(
    () => attempts.some((a) => a.generated_case_id !== null || (a.item_id && stageMap[a.item_id])),
    [attempts, stageMap],
  )

  const recommendation = useMemo(
    () =>
      recommendNext({
        skills,
        mastery,
        openErrorItemIds: openErrorGroups,
        dueReviews,
        caseAttempted,
        baseCaseHref: baseSpineId ? `/practice/case/${baseSpineId}` : null,
      }),
    [skills, mastery, openErrorGroups, dueReviews, caseAttempted, baseSpineId],
  )

  const repairQueue = skills.filter((s) => mastery[s.id]?.state === 'needs_repair')
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
          <Link className="btn" to="/practice/mock">
            🎓 Mock exam
          </Link>
          <Link className="btn" to="/practice/history">
            History
          </Link>
          <Link className="btn" to="/practice/errors">
            Error log{errors.length > 0 ? ` (${errors.length})` : ''}
          </Link>
        </div>
      </div>

      <div className="reco-card">
        <div>
          <span className="lane-kicker">Recommended next</span>
          <h2>{recommendation.label}</h2>
          <p className="muted">{recommendation.description}</p>
        </div>
        <Link className="btn primary" to={recommendation.href}>
          Go →
        </Link>
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
          <span className="lane-meta">{items.length} activities</span>
        </Link>
        <Link to="/practice/statements" className="lane-card statements">
          <span className="lane-kicker">Lane 2</span>
          <h2>Financial Statement Practice</h2>
          <p>
            Integrated cases: from a trial balance and adjustments to complete financial
            statements, with diagnosis, repair and altered retests.
          </p>
          <span className="lane-meta">
            {spines.filter((s) => !(s.config as SpineDiagnosisConfig).is_retest_variant).length}{' '}
            authored case(s) + generated variants
          </span>
        </Link>
      </div>

      {skills.length > 0 && (
        <>
          <h3 className="section-h">Skill mastery — sole-trader case</h3>
          <div className="mastery-grid">
            {skills.map((s) => {
              const m = mastery[s.id] ?? { state: 'unseen' as const }
              return (
                <div key={s.id} className={`mastery-chip m-${m.state}`}>
                  <strong>{s.label}</strong>
                  <span>{MASTERY_LABELS[m.state]}</span>
                </div>
              )
            })}
          </div>
          <p className="hint">
            Evidence-based: "Transferred" requires clean work on an altered or generated case —
            repeating the same question never counts.
          </p>
        </>
      )}

      {(repairQueue.length > 0 || openErrorGroups.length > 0) && (
        <>
          <h3 className="section-h">Repair queue</h3>
          <div className="activity-list">
            {repairQueue.map((s) => (
              <div key={s.id} className="activity-card static">
                <div className="activity-main">
                  <strong>{s.label}</strong>
                  <span className="muted activity-sub">Failed on the last case run</span>
                </div>
                {s.repair_item_id && (
                  <Link className="btn primary" to={`/practice/run/${s.repair_item_id}`}>
                    Repair
                  </Link>
                )}
              </div>
            ))}
            {openErrorGroups.slice(0, 3).map((g) => (
              <div key={g.item_id} className="activity-card static">
                <div className="activity-main">
                  <strong>{g.title}</strong>
                  <span className="muted activity-sub">
                    {g.count} open error{g.count === 1 ? '' : 's'} in the log
                  </span>
                </div>
                <Link className="btn" to={`/practice/run/${g.item_id}`}>
                  Rerun drill
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {dueReviews.length > 0 && (
        <>
          <h3 className="section-h">Due for review</h3>
          <div className="weak-topics">
            {dueReviews.slice(0, 6).map((d) => (
              <Link key={d.item_id} to={`/practice/run/${d.item_id}`} className="weak-topic">
                {d.title}
              </Link>
            ))}
          </div>
        </>
      )}

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
