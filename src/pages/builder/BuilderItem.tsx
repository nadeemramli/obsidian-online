import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteItem,
  fetchItem,
  fetchItemAnswers,
  updateItem,
  upsertItemAnswers,
  type LearningItem,
} from '../../lib/practice/api'
import type { Json } from '../../lib/database.types'
import {
  scoreMatrix,
  type MatrixConfig,
  type MatrixFeedback,
  type MatrixResponse,
} from '../../lib/practice/scoring.ts'
import {
  validateMatrixConfig,
  validateMatrixKey,
  type ValidationIssue,
} from '../../lib/practice/validate.ts'
import { MatrixRunner } from '../../components/practice/MatrixRunner'
import { MatrixResults } from '../../components/practice/MatrixResults'
import { JournalEditor } from './JournalEditor'
import { StatementEditor } from './StatementEditor'

type RowDraft = { id: string; label: string; debit: string; credit: string; explanation: string }
type OptionDraft = { id: string; label: string }

const newId = () => crypto.randomUUID().slice(0, 8)

export default function BuilderItem() {
  const { itemId } = useParams()
  const navigate = useNavigate()

  const [item, setItem] = useState<LearningItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [noteMd, setNoteMd] = useState('')
  const [paper, setPaper] = useState('')
  const [syllabusArea, setSyllabusArea] = useState('')
  const [topic, setTopic] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [sourceSlug, setSourceSlug] = useState('')
  const [options, setOptions] = useState<OptionDraft[]>([])
  const [rows, setRows] = useState<RowDraft[]>([])
  const [overall, setOverall] = useState('')
  const [columns, setColumns] = useState<Array<{ id: string; label: string }>>([
    { id: 'debit', label: 'Debit' },
    { id: 'credit', label: 'Credit' },
  ])

  const [baseline, setBaseline] = useState('') // serialized form for dirty tracking
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  // Preview state
  const [previewResponse, setPreviewResponse] = useState<MatrixResponse>({})
  const [previewFeedback, setPreviewFeedback] = useState<MatrixFeedback | null>(null)

  const serialize = (s: {
    title: string
    prompt: string
    noteMd: string
    paper: string
    syllabusArea: string
    topic: string
    tagsText: string
    difficulty: string
    sourceSlug: string
    options: OptionDraft[]
    rows: RowDraft[]
    overall: string
  }) => JSON.stringify(s)

  const currentSerialized = serialize({
    title,
    prompt,
    noteMd,
    paper,
    syllabusArea,
    topic,
    tagsText,
    difficulty,
    sourceSlug,
    options,
    rows,
    overall,
  })
  const dirty = baseline !== '' && currentSerialized !== baseline

  // Warn on tab close with unsaved changes. (In-app navigation uses the Back
  // link below, which confirms explicitly — HashRouter has no useBlocker.)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([fetchItem(itemId!)])
      .then(async ([it]) => {
        if (!active) return
        if (!it) {
          setNotFound(true)
          return
        }
        setItem(it)
        const cfg = (it.config ?? {}) as any
        const answers = await fetchItemAnswers(it.id, it.version)
        const keyRows = ((answers?.answer_key as any)?.rows ?? {}) as Record<string, any>
        const cols =
          Array.isArray(cfg.columns) && cfg.columns.length > 0
            ? cfg.columns
            : [
                { id: 'debit', label: 'Debit' },
                { id: 'credit', label: 'Credit' },
              ]
        const loaded = {
          title: it.title,
          prompt: it.prompt_md,
          noteMd: typeof cfg.note_md === 'string' ? cfg.note_md : '',
          paper: it.paper ?? '',
          syllabusArea: it.syllabus_area ?? '',
          topic: it.topic ?? '',
          tagsText: (it.tags ?? []).join(', '),
          difficulty: it.difficulty ?? '',
          sourceSlug: it.source_slug ?? '',
          options: (Array.isArray(cfg.options) ? cfg.options : []) as OptionDraft[],
          rows: (Array.isArray(cfg.rows) ? cfg.rows : []).map((r: any) => ({
            id: r.id,
            label: r.label ?? '',
            debit: keyRows[r.id]?.[cols[0].id] ?? '',
            credit: keyRows[r.id]?.[cols[1]?.id] ?? '',
            explanation: keyRows[r.id]?.explanation_md ?? '',
          })),
          overall: answers?.overall_explanation_md ?? '',
        }
        setColumns(cols)
        setTitle(loaded.title)
        setPrompt(loaded.prompt)
        setNoteMd(loaded.noteMd)
        setPaper(loaded.paper)
        setSyllabusArea(loaded.syllabusArea)
        setTopic(loaded.topic)
        setTagsText(loaded.tagsText)
        setDifficulty(loaded.difficulty)
        setSourceSlug(loaded.sourceSlug)
        setOptions(loaded.options)
        setRows(loaded.rows)
        setOverall(loaded.overall)
        setBaseline(serialize(loaded))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [itemId])

  const config: MatrixConfig = useMemo(
    () => ({
      ...(noteMd.trim() ? { note_md: noteMd } : {}),
      columns,
      rows: rows.map((r) => ({ id: r.id, label: r.label })),
      options,
    }),
    [noteMd, columns, rows, options],
  )

  const answerKey = useMemo(() => {
    const keyRows: Record<string, Record<string, string>> = {}
    for (const r of rows) {
      keyRows[r.id] = {
        [columns[0].id]: r.debit,
        ...(columns[1] ? { [columns[1].id]: r.credit } : {}),
        explanation_md: r.explanation,
      }
    }
    return { rows: keyRows }
  }, [rows, columns])

  function validateAll(): ValidationIssue[] {
    const all: ValidationIssue[] = []
    if (!title.trim()) all.push({ path: 'title', message: 'Title is required' })
    if (!prompt.trim()) all.push({ path: 'prompt', message: 'Prompt / instructions are required' })
    all.push(...validateMatrixConfig(config))
    if (all.length === 0) all.push(...validateMatrixKey(config, answerKey))
    return all
  }

  async function save(status?: 'draft' | 'published') {
    if (!item) return
    const targetStatus = status ?? (item.status as 'draft' | 'published')
    if (targetStatus === 'published') {
      const found = validateAll()
      if (found.length > 0) {
        setIssues(found)
        setMsg('Fix the problems below before publishing.')
        return
      }
    }
    setIssues([])
    setBusy(true)
    setMsg(null)
    try {
      // Editing a published question bumps the version so historical attempts
      // (which pin item_version) keep their meaning.
      const bump = item.status === 'published'
      const version = bump ? item.version + 1 : item.version
      // Answers first: never leave a published item without its key.
      await upsertItemAnswers({
        item_id: item.id,
        version,
        answer_key: answerKey as unknown as Json,
        overall_explanation_md: overall.trim() ? overall : null,
      })
      const updated = await updateItem(item.id, {
        title: title.trim(),
        prompt_md: prompt,
        config: config as unknown as Json,
        paper: paper.trim() || null,
        syllabus_area: syllabusArea.trim() || null,
        topic: topic.trim() || null,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        difficulty: difficulty || null,
        source_slug: sourceSlug.trim() || null,
        version,
        status: targetStatus,
      })
      setItem(updated)
      setBaseline(currentSerialized)
      setMsg(
        targetStatus === 'published'
          ? `Published (version ${version}).`
          : 'Draft saved.',
      )
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    if (!window.confirm(`Delete "${item.title}"? Attempts against it will be kept.`)) return
    setBusy(true)
    try {
      await deleteItem(item.id)
      navigate('/builder')
    } catch (e: any) {
      setMsg(e.message || 'Delete failed')
      setBusy(false)
    }
  }

  function back() {
    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
    navigate('/builder')
  }

  function checkPreview() {
    const found = validateAll()
    if (found.length > 0) {
      setIssues(found)
      setPreviewFeedback(null)
      return
    }
    setIssues([])
    setPreviewFeedback(scoreMatrix(config, answerKey, previewResponse))
  }

  // ---- row/option operations (stable ids; reorder can't corrupt keys) ----
  const moveRow = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  if (loading) return <div className="page muted">Loading question…</div>
  if (notFound || !item)
    return (
      <div className="page">
        <h1>Question not found</h1>
        <Link className="btn" to="/builder">
          ← Back to builder
        </Link>
      </div>
    )

  // Other kinds get their own editor; this component stays the matrix editor.
  if (item.kind === 'journal_entry') return <JournalEditor item={item} />
  if (item.kind === 'statement_prep') return <StatementEditor item={item} />
  if (item.kind !== 'matrix_select')
    return (
      <div className="page">
        <h1>Unsupported question kind</h1>
        <p className="muted">No editor is registered for "{item.kind}".</p>
        <Link className="btn" to="/builder">
          ← Back to builder
        </Link>
      </div>
    )

  return (
    <div className="page builder-page">
      <div className="crumb muted">
        <button className="link" onClick={back}>
          ← Builder
        </button>
      </div>
      <div className="page-head">
        <h1>Edit question</h1>
        <div className="head-actions">
          <span className={'save-state'}>
            {dirty ? 'Unsaved changes' : 'All changes saved'} · {item.status} · v{item.version}
          </span>
          <button className="btn" onClick={() => save('draft')} disabled={busy}>
            Save draft
          </button>
          <button className="btn primary" onClick={() => save('published')} disabled={busy}>
            {item.status === 'published' ? 'Publish update' : 'Publish'}
          </button>
        </div>
      </div>
      {msg && <p className="msg">{msg}</p>}
      {issues.length > 0 && (
        <div className="issue-box" role="alert">
          <strong>Can't publish yet:</strong>
          <ul>
            {issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="builder-split">
        <div className="builder-form">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Prompt / instructions (markdown)</span>
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="field">
            <span>Note / callout (optional)</span>
            <textarea rows={2} value={noteMd} onChange={(e) => setNoteMd(e.target.value)} />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Paper</span>
              <input value={paper} onChange={(e) => setPaper(e.target.value)} placeholder="FFA" />
            </label>
            <label className="field">
              <span>Topic</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </label>
            <label className="field">
              <span>Difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">—</option>
                <option value="intro">intro</option>
                <option value="core">core</option>
                <option value="stretch">stretch</option>
              </select>
            </label>
            <label className="field">
              <span>Source note slug</span>
              <input
                value={sourceSlug}
                onChange={(e) => setSourceSlug(e.target.value)}
                placeholder="05-ledger-accounts-and-double-entry"
              />
            </label>
            <label className="field">
              <span>Syllabus area</span>
              <input value={syllabusArea} onChange={(e) => setSyllabusArea(e.target.value)} />
            </label>
            <label className="field">
              <span>Tags (comma-separated)</span>
              <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </label>
          </div>

          <h3 className="section-h">Answer options</h3>
          <p className="hint">The shared dropdown list. Every row's correct answers must be in it.</p>
          {options.map((o, i) => (
            <div className="option-row" key={o.id}>
              <input
                value={o.label}
                aria-label={`Option ${i + 1} label`}
                onChange={(e) =>
                  setOptions((prev) => prev.map((p) => (p.id === o.id ? { ...p, label: e.target.value } : p)))
                }
              />
              <button
                className="btn danger"
                aria-label={`Delete option ${o.label || i + 1}`}
                onClick={() => setOptions((prev) => prev.filter((p) => p.id !== o.id))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn"
            onClick={() => setOptions((prev) => [...prev, { id: newId(), label: '' }])}
          >
            + Add option
          </button>

          <h3 className="section-h">Transactions (rows)</h3>
          {rows.map((r, i) => (
            <fieldset className="row-editor" key={r.id}>
              <legend>Row {i + 1}</legend>
              <label className="field">
                <span>Transaction</span>
                <input
                  value={r.label}
                  onChange={(e) =>
                    setRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, label: e.target.value } : p)))
                  }
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>Correct {columns[0].label.toLowerCase()}</span>
                  <select
                    value={r.debit}
                    onChange={(e) =>
                      setRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, debit: e.target.value } : p)))
                    }
                  >
                    <option value="">— choose —</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {columns[1] && (
                  <label className="field">
                    <span>Correct {columns[1].label.toLowerCase()}</span>
                    <select
                      value={r.credit}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((p) => (p.id === r.id ? { ...p, credit: e.target.value } : p)),
                        )
                      }
                    >
                      <option value="">— choose —</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="field">
                <span>Row explanation (markdown)</span>
                <textarea
                  rows={2}
                  value={r.explanation}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((p) => (p.id === r.id ? { ...p, explanation: e.target.value } : p)),
                    )
                  }
                />
              </label>
              <div className="row-editor-actions">
                <button className="btn" onClick={() => moveRow(i, -1)} disabled={i === 0}>
                  ↑ Up
                </button>
                <button className="btn" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}>
                  ↓ Down
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    if (
                      !r.label.trim() ||
                      window.confirm(`Delete row "${r.label}"?`)
                    )
                      setRows((prev) => prev.filter((p) => p.id !== r.id))
                  }}
                >
                  Delete row
                </button>
              </div>
            </fieldset>
          ))}
          <button
            className="btn"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: newId(), label: '', debit: '', credit: '', explanation: '' },
              ])
            }
          >
            + Add transaction
          </button>

          <h3 className="section-h">Overall explanation (markdown)</h3>
          <textarea rows={3} value={overall} onChange={(e) => setOverall(e.target.value)} />

          <div className="builder-danger">
            <button className="btn danger" onClick={remove} disabled={busy}>
              Delete question
            </button>
          </div>
        </div>

        <div className="builder-preview">
          <div className="preview-head">
            <h3 className="section-h">Learner preview</h3>
            <div className="head-actions">
              <button className="btn" onClick={checkPreview}>
                Check answers
              </button>
              <button
                className="btn"
                onClick={() => {
                  setPreviewResponse({})
                  setPreviewFeedback(null)
                }}
              >
                Reset preview
              </button>
            </div>
          </div>
          <div className="question-card">
            <div className="markdown question-prompt">
              <p>{prompt || <span className="muted">(prompt goes here)</span>}</p>
            </div>
            {noteMd.trim() && (
              <div className="question-note">
                <span className="question-note-title">Note</span>
                <p>{noteMd}</p>
              </div>
            )}
            {previewFeedback ? (
              <>
                <MatrixResults
                  feedback={previewFeedback}
                  overallExplanationMd={overall.trim() ? overall : null}
                />
                <p className="hint">Post-submit state (simulated locally — nothing is stored).</p>
              </>
            ) : rows.length > 0 && options.length > 0 ? (
              <MatrixRunner
                config={config}
                response={previewResponse}
                onChange={(rowId, colId, optionId) =>
                  setPreviewResponse((prev) => ({
                    ...prev,
                    [rowId]: { ...prev[rowId], [colId]: optionId || undefined },
                  }))
                }
                disabled={false}
              />
            ) : (
              <p className="muted">Add options and at least one transaction to preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
