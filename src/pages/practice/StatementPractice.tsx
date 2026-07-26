import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublishedSpines, type PracticeSpine } from '../../lib/practice/api'

const FAMILY_LABELS: Record<string, string> = {
  sole_trader: 'Sole-trader accounts preparation',
  limited_company: 'Limited-company accounts preparation',
  cash_flows: 'Statement-of-cash-flows reconstruction',
  consolidation: 'Consolidated financial statements',
  reliability: 'Reliability and reconstruction',
  interpretation: 'Interpretation',
}

const FAMILY_ORDER = [
  'sole_trader',
  'limited_company',
  'cash_flows',
  'consolidation',
  'reliability',
  'interpretation',
]

// Lane 2: integrated cases grouped by the six practice families (PRD §9).
export default function StatementPractice() {
  const [spines, setSpines] = useState<PracticeSpine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchPublishedSpines()
      .then((s) => {
        if (active) setSpines(s)
      })
      .catch((e) => {
        if (active) setError(e.message || 'Failed to load cases')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <div className="page muted">Loading…</div>

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link> · Financial Statement Practice
      </div>
      <div className="page-head">
        <h1>Financial Statement Practice</h1>
      </div>
      <p className="muted">
        Integrated cases: work from source information to a finished accounting output, get a
        root-cause diagnosis, repair the weak step, then prove it on an altered case.
      </p>
      {error && <p className="msg error">{error}</p>}

      {FAMILY_ORDER.map((family) => {
        const group = spines.filter((s) => s.family === family)
        // The altered retest variant is reached from case results, not listed here.
        const listed = group.filter((s) => !(s.config as any)?.is_retest_variant)
        if (listed.length === 0 && group.length === 0) {
          return (
            <section key={family}>
              <h3 className="section-h">{FAMILY_LABELS[family]}</h3>
              <p className="muted">Coming soon.</p>
            </section>
          )
        }
        return (
          <section key={family}>
            <h3 className="section-h">{FAMILY_LABELS[family]}</h3>
            <div className="activity-list">
              {listed.map((s) => (
                <Link key={s.id} to={`/practice/case/${s.id}`} className="activity-card">
                  <div className="activity-main">
                    <strong>{s.title}</strong>
                    <span className="muted activity-sub">{s.paper ?? 'FFA'}</span>
                  </div>
                  <span className="activity-side">Case</span>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
