import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createDraftItem,
  createQuiz,
  fetchAllItems,
  fetchAllQuizzes,
  fetchItemAnswers,
  updateItem,
  upsertItemAnswers,
  type LearningItem,
  type Quiz,
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

const DEFAULT_STATEMENT_CONFIG = {
  columns: [{ id: 'amount', label: 'Amount ($)' }],
  rows: [],
  options: [],
} as unknown as Json

export default function BuilderList() {
  const [items, setItems] = useState<LearningItem[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function reload() {
    try {
      const [i, q] = await Promise.all([fetchAllItems(), fetchAllQuizzes()])
      setItems(i)
      setQuizzes(q)
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

  async function newQuestion(
    kind:
      | 'matrix_select'
      | 'journal_entry'
      | 'statement_prep'
      | 'single_select'
      | 'multi_select'
      | 'numeric_entry',
  ) {
    setBusy(true)
    try {
      const titles: Record<string, string> = {
        matrix_select: 'Untitled matrix question',
        journal_entry: 'Untitled journal question',
        statement_prep: 'Untitled statement question',
        single_select: 'Untitled single-choice question',
        multi_select: 'Untitled multiple-response question',
        numeric_entry: 'Untitled numeric question',
      }
      const configs: Record<string, Json> = {
        matrix_select: DEFAULT_MATRIX_CONFIG,
        journal_entry: DEFAULT_JOURNAL_CONFIG,
        statement_prep: DEFAULT_STATEMENT_CONFIG,
        single_select: {
          columns: [{ id: 'choice', label: 'Answer' }],
          rows: [{ id: 'answer', label: 'Your answer' }],
          options: [],
        } as unknown as Json,
        multi_select: {
          columns: [{ id: 'choices', label: 'Your decision' }],
          rows: [{ id: 'answer', label: 'Your answer' }],
          options: [],
        } as unknown as Json,
        numeric_entry: {
          columns: [{ id: 'amount', label: 'Amount ($)' }],
          rows: [{ id: 'answer', label: 'Amount ($)' }],
          options: [],
        } as unknown as Json,
      }
      const item = await createDraftItem({ kind, title: titles[kind], config: configs[kind] })
      navigate(`/builder/item/${item.id}`)
    } catch (e: any) {
      setError(e.message || 'Could not create the question')
      setBusy(false)
    }
  }

  async function newQuiz() {
    setBusy(true)
    try {
      const quiz = await createQuiz('Untitled quiz')
      navigate(`/builder/quiz/${quiz.id}`)
    } catch (e: any) {
      setError(e.message || 'Could not create the quiz')
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
            + Matrix
          </button>
          <button className="btn primary" onClick={() => newQuestion('journal_entry')} disabled={busy}>
            + Journal
          </button>
          <button className="btn primary" onClick={() => newQuestion('statement_prep')} disabled={busy}>
            + Statement
          </button>
          <button className="btn primary" onClick={() => newQuestion('single_select')} disabled={busy}>
            + MCQ
          </button>
          <button className="btn primary" onClick={() => newQuestion('multi_select')} disabled={busy}>
            + Multi
          </button>
          <button className="btn primary" onClick={() => newQuestion('numeric_entry')} disabled={busy}>
            + Numeric
          </button>
          <button className="btn" onClick={newQuiz} disabled={busy}>
            + Quiz
          </button>
        </div>
      </div>
      {error && <p className="msg error">{error}</p>}

      <section>
        <h3 className="section-h">
          Quizzes <span className="muted">({quizzes.length})</span>
        </h3>
        {quizzes.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <div className="activity-list">
            {quizzes.map((q) => (
              <div key={q.id} className="activity-card static">
                <div className="activity-main">
                  <Link to={`/builder/quiz/${q.id}`}>
                    <strong>{q.title}</strong>
                  </Link>
                  <span className="muted activity-sub">
                    {[q.status, q.paper, q.topic].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="activity-side builder-actions">
                  <Link className="btn" to={`/builder/quiz/${q.id}`}>
                    Edit
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

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
