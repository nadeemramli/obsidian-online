import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAttempts,
  fetchAllItems,
  fetchPublishedItems,
  type Attempt,
  type LearningItem,
} from '../../lib/practice/api'
import { useProfile } from '../../lib/profile'

export default function PracticeHistory() {
  const { isEditor } = useProfile()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [items, setItems] = useState<LearningItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    // Editors can resolve titles for unpublished items too.
    Promise.all([fetchAttempts(100), isEditor ? fetchAllItems() : fetchPublishedItems()])
      .then(([a, i]) => {
        if (!active) return
        setAttempts(a)
        setItems(i)
      })
      .catch((e) => {
        if (active) setError(e.message || 'Failed to load history')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isEditor])

  const titles = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items])

  if (loading) return <div className="page muted">Loading history…</div>

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <Link to="/practice">Practice</Link>
      </div>
      <div className="page-head">
        <h1>Attempt history</h1>
      </div>
      {error && <p className="msg error">{error}</p>}
      {attempts.length === 0 ? (
        <p className="muted">
          No attempts yet. <Link to="/practice">Start practicing</Link>.
        </p>
      ) : (
        <div className="journal-wrap">
          <table className="journal history-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Activity</th>
                <th scope="col">Entries</th>
                <th scope="col">Transactions</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>
                    {a.item_id
                      ? titles.get(a.item_id) ?? 'Activity'
                      : `Generated case — stage ${(a.stage_index ?? 0) + 1}`}
                  </td>
                  <td className="num">
                    {a.cell_score}/{a.cell_max}
                  </td>
                  <td className="num">
                    {a.tx_correct}/{a.tx_total}
                  </td>
                  <td>
                    <Link to={`/practice/attempt/${a.id}`}>Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
