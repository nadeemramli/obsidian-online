import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createDraftItem,
  fetchAllItems,
  fetchItemAnswers,
  updateItem,
  upsertItemAnswers,
  type LearningItem,
} from '../../lib/practice/api'
import type { Json } from '../../lib/database.types'

const DEFAULT_MATRIX_CONFIG = {
  columns: [
    { id: 'debit', label: 'Debit' },
    { id: 'credit', label: 'Credit' },
  ],
  rows: [],
  options: [],
} as unknown as Json

const DEFAULT_JOURNAL_CONFIG = {
  columns: [
    { id: 'debit', label: 'Debit account' },
    { id: 'credit', label: 'Credit account' },
    { id: 'amount', label: 'Amount ($)' },
  ],
  rows: [],
  options: [],
} as unknown as Json

export default function BuilderList() {
  const [items, setItems] = useState<LearningItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function reload() {
    try {
      setItems(await fetchAllItems())
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to load content')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function newQuestion(kind: 'matrix_select' | 'journal_entry') {
    setBusy(true)
    try {
      const item = await createDraftItem({
        kind,
        title: kind === 'journal_entry' ? 'Untitled journal question' : 'Untitled matrix question',
        config: kind === 'journal_entry' ? DEFAULT_JOURNAL_CONFIG : DEFAULT_MATRIX_CONFIG,
      })
      navigate(`/builder/item/${item.id}`)
    } catch (e: any) {
      setError(e.message || 'Could not create the question')
      setBusy(false)
    }
  }

  async function duplicate(item: LearningItem) {
    setBusy(true)
    try {
      const copy = await createDraftItem({
        kind: item.kind,
        title: `${item.title} (copy)`,
        config: item.config,
      })
      await updateItem(copy.id, {
        prompt_md: item.prompt_md,
        paper: item.paper,
        syllabus_area: item.syllabus_area,
        topic: item.topic,
        tags: item.tags,
        difficulty: item.difficulty,
        source_slug: item.source_slug,
      })
      const answers = await fetchItemAnswers(item.id, item.version)
      if (answers) {
        await upsertItemAnswers({
          item_id: copy.id,
          version: 1,
          answer_key: answers.answer_key,
          overall_explanation_md: answers.overall_explanation_md,
        })
      }
      await reload()
    } catch (e: any) {
      setError(e.message || 'Could not duplicate')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(item: LearningItem, status: string) {
    setBusy(true)
    try {
      await updateItem(item.id, { status })
      await reload()
    } catch (e: any) {
      setError(e.message || 'Could not update status')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="page muted">Loading builder…</div>

  const groups: Array<[string, LearningItem[]]> = [
    ['Drafts', items.filter((i) => i.status === 'draft')],
    ['Published', items.filter((i) => i.status === 'published')],
    ['Archived', items.filter((i) => i.status === 'archived')],
  ]

  return (
    <div className="page practice-page">
      <div className="page-head">
        <h1>Question builder</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => newQuestion('matrix_select')} disabled={busy}>
            + New matrix question
          </button>
          <button className="btn primary" onClick={() => newQuestion('journal_entry')} disabled={busy}>
            + New journal question
          </button>
        </div>
      </div>
      {error && <p className="msg error">{error}</p>}
      {groups.map(([label, group]) => (
        <section key={label}>
          <h3 className="section-h">
            {label} <span className="muted">({group.length})</span>
          </h3>
          {group.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <div className="activity-list">
              {group.map((it) => (
                <div key={it.id} className="activity-card static">
                  <div className="activity-main">
                    <Link to={`/builder/item/${it.id}`}>
                      <strong>{it.title}</strong>
                    </Link>
                    <span className="muted activity-sub">
                      {[it.kind, it.paper, it.topic, `v${it.version}`].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className="activity-side builder-actions">
                    <Link className="btn" to={`/builder/item/${it.id}`}>
                      Edit
                    </Link>
                    <button className="btn" onClick={() => duplicate(it)} disabled={busy}>
                      Duplicate
                    </button>
                    {it.status !== 'archived' ? (
                      <button className="btn" onClick={() => setStatus(it, 'archived')} disabled={busy}>
                        Archive
                      </button>
                    ) : (
                      <button className="btn" onClick={() => setStatus(it, 'draft')} disabled={busy}>
                        Restore
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
