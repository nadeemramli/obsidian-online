import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteQuiz,
  fetchAllItems,
  fetchQuiz,
  fetchQuizItems,
  setQuizItems,
  updateQuiz,
  type LearningItem,
  type Quiz,
} from '../../lib/practice/api'

// Authoring for Specific Practice quizzes: metadata + ordered membership of
// registered items (PRD Ticket 1). Items are referenced, never cloned — their
// answer keys stay in learning_item_answers.
export default function QuizEditor() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [allItems, setAllItems] = useState<LearningItem[]>([])
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [paper, setPaper] = useState('')
  const [topic, setTopic] = useState('')
  const [estMinutes, setEstMinutes] = useState('')
  const [baseline, setBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchQuiz(quizId!), fetchQuizItems(quizId!), fetchAllItems()])
      .then(([q, members, items]) => {
        if (!active || !q) {
          if (active) setQuiz(null)
          return
        }
        setQuiz(q)
        setAllItems(items)
        const ids = members.map((m) => m.item_id)
        setMemberIds(ids)
        setTitle(q.title)
        setDescription(q.description_md)
        setPaper(q.paper ?? '')
        setTopic(q.topic ?? '')
        setEstMinutes(q.est_minutes != null ? String(q.est_minutes) : '')
        setBaseline(JSON.stringify([q.title, q.description_md, q.paper, q.topic, q.est_minutes, ids]))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [quizId])

  const dirty =
    baseline !== '' &&
    baseline !==
      JSON.stringify([
        title,
        description,
        paper || null,
        topic || null,
        estMinutes ? Number(estMinutes) : null,
        memberIds,
      ])

  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems])
  const addable = allItems.filter((i) => !memberIds.includes(i.id))

  async function save(status?: 'draft' | 'published') {
    if (!quiz) return
    const targetStatus = status ?? (quiz.status as 'draft' | 'published')
    if (targetStatus === 'published') {
      if (!title.trim() || memberIds.length === 0) {
        setMsg('A quiz needs a title and at least one question before publishing.')
        return
      }
      const unpublished = memberIds.filter((id) => itemById.get(id)?.status !== 'published')
      if (unpublished.length > 0) {
        setMsg(
          `Publish blocked: ${unpublished.length} member question${unpublished.length === 1 ? ' is' : 's are'} not published yet.`,
        )
        return
      }
    }
    setBusy(true)
    setMsg(null)
    try {
      await setQuizItems(quiz.id, memberIds)
      const updated = await updateQuiz(quiz.id, {
        title: title.trim(),
        description_md: description,
        paper: paper.trim() || null,
        topic: topic.trim() || null,
        est_minutes: estMinutes ? Number(estMinutes) : null,
        status: targetStatus,
      })
      setQuiz(updated)
      setBaseline(
        JSON.stringify([
          title,
          description,
          paper || null,
          topic || null,
          estMinutes ? Number(estMinutes) : null,
          memberIds,
        ]),
      )
      setMsg(targetStatus === 'published' ? 'Published.' : 'Draft saved.')
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const move = (i: number, dir: -1 | 1) =>
    setMemberIds((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  if (loading) return <div className="page muted">Loading quiz…</div>
  if (!quiz)
    return (
      <div className="page">
        <h1>Quiz not found</h1>
        <Link className="btn" to="/builder">
          ← Back to builder
        </Link>
      </div>
    )

  return (
    <div className="page practice-page">
      <div className="crumb muted">
        <button
          className="link"
          onClick={() => {
            if (!dirty || window.confirm('You have unsaved changes. Leave anyway?'))
              navigate('/builder')
          }}
        >
          ← Builder
        </button>
      </div>
      <div className="page-head">
        <h1>Edit quiz</h1>
        <div className="head-actions">
          <span className="save-state">
            {dirty ? 'Unsaved changes' : 'All changes saved'} · {quiz.status}
          </span>
          <button className="btn" onClick={() => save('draft')} disabled={busy}>
            Save draft
          </button>
          <button className="btn primary" onClick={() => save('published')} disabled={busy}>
            Publish
          </button>
        </div>
      </div>
      {msg && <p className="msg">{msg}</p>}

      <div className="builder-form">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Description / instructions (markdown)</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Paper</span>
            <input value={paper} onChange={(e) => setPaper(e.target.value)} />
          </label>
          <label className="field">
            <span>Topic</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="field">
            <span>Estimated minutes</span>
            <input
              inputMode="numeric"
              value={estMinutes}
              onChange={(e) => setEstMinutes(e.target.value)}
            />
          </label>
        </div>

        <h3 className="section-h">
          Questions <span className="muted">({memberIds.length})</span>
        </h3>
        {memberIds.length === 0 && <p className="muted">No questions yet — add some below.</p>}
        <div className="activity-list">
          {memberIds.map((id, i) => {
            const it = itemById.get(id)
            return (
              <div key={id} className="activity-card static">
                <div className="activity-main">
                  <strong>
                    {i + 1}. {it?.title ?? id}
                  </strong>
                  <span className="muted activity-sub">
                    {[it?.kind, it?.status].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="activity-side builder-actions">
                  <button className="btn" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    className="btn"
                    onClick={() => move(i, 1)}
                    disabled={i === memberIds.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => setMemberIds((prev) => prev.filter((p) => p !== id))}
                  >
                    Remove
                  </button>
                </span>
              </div>
            )
          })}
        </div>

        <label className="field" style={{ maxWidth: 480 }}>
          <span>Add a question</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setMemberIds((prev) => [...prev, e.target.value])
            }}
          >
            <option value="">— choose a question to add —</option>
            {addable.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title} ({i.kind}, {i.status})
              </option>
            ))}
          </select>
        </label>

        <div className="builder-danger">
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Delete quiz "${quiz.title}"? Its questions are not deleted.`))
                return
              setBusy(true)
              try {
                await deleteQuiz(quiz.id)
                navigate('/builder')
              } catch (e: any) {
                setMsg(e.message || 'Delete failed')
                setBusy(false)
              }
            }}
          >
            Delete quiz
          </button>
        </div>
      </div>
    </div>
  )
}
