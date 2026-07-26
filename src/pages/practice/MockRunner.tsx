import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  fetchItemsByIds,
  fetchPublishedItems,
  fetchPublishedSpines,
  fetchSpineStages,
  startSession,
  type LearningItem,
} from '../../lib/practice/api'
import { ExamSession, type ExamEntry } from '../../components/practice/ExamSession'

const OBJECTIVE_KINDS = new Set(['single_select', 'multi_select', 'numeric_entry'])

// Mock assembly (PRD §8.4/§21.4): Section A from the published objective pool,
// Section B from a Financial Statement Practice spine, one strict timer, one
// submission, shared attempt history. Scales to the full 35+2 exam shape as
// the content pool grows — the current label is honest about its size.
export default function MockRunner() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  const [entries, setEntries] = useState<ExamEntry[] | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [items, spines] = await Promise.all([fetchPublishedItems(), fetchPublishedSpines()])
        const sectionA = items
          .filter((i) => OBJECTIVE_KINDS.has(i.kind))
          .map((item) => ({ item, sectionLabel: 'Section A' }))

        // Section B: the first published, non-retest statement case.
        const spine = spines.find((s) => !(s.config as any)?.is_retest_variant)
        let sectionB: ExamEntry[] = []
        if (spine) {
          const stages = await fetchSpineStages(spine.id)
          const stageItems = await fetchItemsByIds(stages.map((s) => s.item_id))
          sectionB = stages
            .map((s) => stageItems.find((i) => i.id === s.item_id))
            .filter(Boolean)
            .map((item) => ({ item: item as LearningItem, sectionLabel: 'Section B — Case' }))
        }
        if (!active) return
        if (sectionA.length === 0 && sectionB.length === 0) {
          setError('No published content available for a mock yet.')
          return
        }
        setEntries([...sectionA, ...sectionB])
        const sess = await startSession(null, { lane: 'specific' })
        if (active) setSessionId(sess.id)
      } catch (e: any) {
        if (active) setError(e.message || 'Failed to assemble the mock')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  if (error)
    return (
      <div className="page">
        <h1>Mock unavailable</h1>
        <p className="muted">{error}</p>
        <Link className="btn" to="/practice">
          ← Back to practice
        </Link>
      </div>
    )
  if (!entries) return <div className="page muted">Assembling mock…</div>

  const otCount = entries.filter((e) => e.sectionLabel === 'Section A').length
  const caseCount = entries.length - otCount
  return (
    <ExamSession
      title="Mock exam"
      crumb={
        <>
          <Link to="/practice">Practice</Link> · Mock exam ({otCount} objective question
          {otCount === 1 ? '' : 's'}
          {caseCount > 0 ? ' + case' : ''})
        </>
      }
      entries={entries}
      sessionId={sessionId}
      storageKey={`mock:${userId}`}
      // FA pacing: ~2 minutes per OT plus 45 minutes for the case section.
      totalSecondsDefault={otCount * 120 + (caseCount > 0 ? 45 * 60 : 0)}
      backHref="/practice"
      backLabel="Back to practice"
    />
  )
}
