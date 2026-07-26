import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteItem,
  fetchItemAnswers,
  updateItem,
  upsertItemAnswers,
  type LearningItem,
} from '../../lib/practice/api'
import type { Json } from '../../lib/database.types'
import {
  scoreStatement,
  type MatrixFeedback,
  type MatrixResponse,
  type StatementConfig,
} from '../../lib/practice/scoring.ts'
import {
  validateStatementConfig,
  validateStatementKey,
  type ValidationIssue,
} from '../../lib/practice/validate.ts'
import { StatementRunner } from '../../components/practice/StatementRunner'
import { MatrixResults } from '../../components/practice/MatrixResults'

type RowDraft = {
  id: string
  label: string
  amount: string
  explanation: string
  indent: boolean
  style: 'line' | 'subtotal' | 'total'
}

const newId = () => crypto.randomUUID().slice(0, 8)
const AMOUNT_COLUMNS = [{ id: 'amount', label: 'Amount ($)' }]

// Editor for statement_prep questions: proforma lines with correct amounts.
export function StatementEditor({ item: initial }: { item: LearningItem }) {
  const navigate = useNavigate()
  const [item, setItem] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [prompt, setPrompt] = useState(initial.prompt_md)
  const [scenario, setScenario] = useState('')
  const [paper, setPaper] = useState(initial.paper ?? '')
  const [topic, setTopic] = useState(initial.topic ?? '')
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? '')
  const [sourceSlug, setSourceSlug] = useState(initial.source_slug ?? '')
  const [rows, setRows] = useState<RowDraft[]>([])
  const [overall, setOverall] = useState('')
  const [baseline, setBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [previewResponse, setPreviewResponse] = useState<MatrixResponse>({})
  const [previewFeedback, setPreviewFeedback] = useState<MatrixFeedback | null>(null)

  const snapshot = JSON.stringify({ title, prompt, scenario, paper, topic, difficulty, sourceSlug, rows, overall })
  const dirty = baseline !== '' && snapshot !== baseline

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
    const cfg = (initial.config ?? {}) as any
    fetchItemAnswers(initial.id, initial.version)
      .then((answers) => {
        if (!active) return
        const keyRows = ((answers?.answer_key as any)?.rows ?? {}) as Record<string, any>
        const loadedRows = (Array.isArray(cfg.rows) ? cfg.rows : []).map((r: any) => ({
          id: r.id,
          label: r.label ?? '',
          amount: keyRows[r.id]?.amount != null ? String(keyRows[r.id].amount) : '',
          explanation: keyRows[r.id]?.explanation_md ?? '',
          indent: !!r.indent,
          style: (r.style as RowDraft['style']) ?? 'line',
        }))
        setScenario(typeof cfg.scenario_md === 'string' ? cfg.scenario_md : '')
        setRows(loadedRows)
        setOverall(answers?.overall_explanation_md ?? '')
        setBaseline(
          JSON.stringify({
            title: initial.title,
            prompt: initial.prompt_md,
            scenario: typeof cfg.scenario_md === 'string' ? cfg.scenario_md : '',
            paper: initial.paper ?? '',
            topic: initial.topic ?? '',
            difficulty: initial.difficulty ?? '',
            sourceSlug: initial.source_slug ?? '',
            rows: loadedRows,
            overall: answers?.overall_explanation_md ?? '',
          }),
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [initial])

  const config: StatementConfig = useMemo(
    () => ({
      ...(scenario.trim() ? { scenario_md: scenario } : {}),
      columns: AMOUNT_COLUMNS,
      rows: rows.map((r) => ({
        id: r.id,
        label: r.label,
        ...(r.indent ? { indent: 1 } : {}),
        ...(r.style !== 'line' ? { style: r.style } : {}),
      })),
      options: [],
    }),
    [scenario, rows],
  )

  const answerKey = useMemo(
    () => ({
      rows: Object.fromEntries(
        rows.map((r) => [
          r.id,
          {
            amount: r.amount.trim() === '' ? NaN : Number(r.amount.replace(/,/g, '')),
            explanation_md: r.explanation,
          },
        ]),
      ),
    }),
    [rows],
  )

  function validateAll(): ValidationIssue[] {
    const all: ValidationIssue[] = []
    if (!title.trim()) all.push({ path: 'title', message: 'Title is required' })
    if (!prompt.trim()) all.push({ path: 'prompt', message: 'Prompt / instructions are required' })
    all.push(...validateStatementConfig(config))
    if (all.length === 0) all.push(...validateStatementKey(config, answerKey))
    return all
  }

  async function save(status?: 'draft' | 'published') {
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
      const bump = item.status === 'published'
      const version = bump ? item.version + 1 : item.version
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
        topic: topic.trim() || null,
        difficulty: difficulty || null,
        source_slug: sourceSlug.trim() || null,
        version,
        status: targetStatus,
      })
      setItem(updated)
      setBaseline(snapshot)
      setMsg(targetStatus === 'published' ? `Published (version ${version}).` : 'Draft saved.')
    } catch (e: any) {
      setMsg(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const setRow = (id: string, patch: Partial<RowDraft>) =>
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const moveRow = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  if (loading) return <div className="page muted">Loading question…</div>

  return (
    <div className="page builder-page">
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
        <h1>Edit statement question</h1>
        <div className="head-actions">
          <span className="save-state">
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
            <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="field">
            <span>Scenario (markdown — trial balance, notes)</span>
            <textarea rows={8} value={scenario} onChange={(e) => setScenario(e.target.value)} />
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
              <input value={sourceSlug} onChange={(e) => setSourceSlug(e.target.value)} />
            </label>
          </div>

          <h3 className="section-h">Statement lines</h3>
          {rows.map((r, i) => (
            <fieldset className="row-editor" key={r.id}>
              <legend>Line {i + 1}</legend>
              <div className="field-grid">
                <label className="field">
                  <span>Label</span>
                  <input value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} />
                </label>
                <label className="field">
                  <span>Correct amount ($)</span>
                  <input
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => setRow(r.id, { amount: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Style</span>
                  <select
                    value={r.style}
                    onChange={(e) => setRow(r.id, { style: e.target.value as RowDraft['style'] })}
                  >
                    <option value="line">line</option>
                    <option value="subtotal">subtotal</option>
                    <option value="total">total</option>
                  </select>
                </label>
                <label className="field">
                  <span>Indented</span>
                  <select
                    value={r.indent ? 'yes' : 'no'}
                    onChange={(e) => setRow(r.id, { indent: e.target.value === 'yes' })}
                  >
                    <option value="no">no</option>
                    <option value="yes">yes</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Line explanation (markdown)</span>
                <textarea
                  rows={2}
                  value={r.explanation}
                  onChange={(e) => setRow(r.id, { explanation: e.target.value })}
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
                    if (!r.label.trim() || window.confirm(`Delete line "${r.label}"?`))
                      setRows((prev) => prev.filter((p) => p.id !== r.id))
                  }}
                >
                  Delete line
                </button>
              </div>
            </fieldset>
          ))}
          <button
            className="btn"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: newId(), label: '', amount: '', explanation: '', indent: false, style: 'line' },
              ])
            }
          >
            + Add line
          </button>

          <h3 className="section-h">Overall explanation (markdown)</h3>
          <textarea rows={3} value={overall} onChange={(e) => setOverall(e.target.value)} />

          <div className="builder-danger">
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Delete "${item.title}"? Attempts against it will be kept.`))
                  return
                setBusy(true)
                try {
                  await deleteItem(item.id)
                  navigate('/builder')
                } catch (e: any) {
                  setMsg(e.message || 'Delete failed')
                  setBusy(false)
                }
              }}
            >
              Delete question
            </button>
          </div>
        </div>

        <div className="builder-preview">
          <div className="preview-head">
            <h3 className="section-h">Learner preview</h3>
            <div className="head-actions">
              <button
                className="btn"
                onClick={() => {
                  const found = validateAll()
                  if (found.length > 0) {
                    setIssues(found)
                    setPreviewFeedback(null)
                    return
                  }
                  setIssues([])
                  setPreviewFeedback(scoreStatement(config, answerKey as any, previewResponse))
                }}
              >
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
            {previewFeedback ? (
              <>
                <MatrixResults
                  feedback={previewFeedback}
                  overallExplanationMd={overall.trim() ? overall : null}
                />
                <p className="hint">Post-submit state (simulated locally — nothing is stored).</p>
              </>
            ) : rows.length > 0 ? (
              <StatementRunner
                config={config}
                response={previewResponse}
                onChange={(rowId, colId, value) =>
                  setPreviewResponse((prev) => ({
                    ...prev,
                    [rowId]: { ...prev[rowId], [colId]: value || undefined },
                  }))
                }
                disabled={false}
              />
            ) : (
              <p className="muted">Add at least one line to preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
