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
  scoreMultiChoice,
  scoreNumeric,
  scoreSingleChoice,
  type MatrixFeedback,
  type MatrixResponse,
} from '../../lib/practice/scoring.ts'
import {
  validateMultiChoiceConfig,
  validateMultiChoiceKey,
  validateNumericConfig,
  validateNumericKey,
  validateSingleChoiceConfig,
  validateSingleChoiceKey,
  type ValidationIssue,
} from '../../lib/practice/validate.ts'
import {
  MultiChoiceRunner,
  NumericRunner,
  SingleChoiceRunner,
} from '../../components/practice/ObjectiveRunners'
import { MatrixResults } from '../../components/practice/MatrixResults'

type OptionDraft = { id: string; label: string }
const newId = () => crypto.randomUUID().slice(0, 8)

// One editor for the three objective kinds — they share the metadata chrome
// and differ only in the answer-specification block.
export function ObjectiveEditor({ item: initial }: { item: LearningItem }) {
  const kind = initial.kind as 'single_select' | 'multi_select' | 'numeric_entry'
  const navigate = useNavigate()
  const [item, setItem] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [prompt, setPrompt] = useState(initial.prompt_md)
  const [scenario, setScenario] = useState('')
  const [paper, setPaper] = useState(initial.paper ?? '')
  const [topic, setTopic] = useState(initial.topic ?? '')
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? '')
  const [sourceSlug, setSourceSlug] = useState(initial.source_slug ?? '')
  const [options, setOptions] = useState<OptionDraft[]>([])
  const [correctSingle, setCorrectSingle] = useState('')
  const [correctMulti, setCorrectMulti] = useState<string[]>([])
  const [policy, setPolicy] = useState<'per_option' | 'all_or_nothing'>('per_option')
  const [amount, setAmount] = useState('')
  const [tolerance, setTolerance] = useState('')
  const [unitLabel, setUnitLabel] = useState('Amount ($)')
  const [explanation, setExplanation] = useState('')
  const [baseline, setBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [previewResponse, setPreviewResponse] = useState<MatrixResponse>({})
  const [previewFeedback, setPreviewFeedback] = useState<MatrixFeedback | null>(null)

  const snapshot = JSON.stringify({
    title, prompt, scenario, paper, topic, difficulty, sourceSlug,
    options, correctSingle, correctMulti, policy, amount, tolerance, unitLabel, explanation,
  })
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
        const key = (answers?.answer_key ?? {}) as any
        const loaded = {
          scenario: typeof cfg.scenario_md === 'string' ? cfg.scenario_md : '',
          options: (Array.isArray(cfg.options) ? cfg.options : []) as OptionDraft[],
          correctSingle: typeof key.correct === 'string' ? key.correct : '',
          correctMulti: Array.isArray(key.correct) ? key.correct : [],
          policy: (key.policy ?? 'per_option') as 'per_option' | 'all_or_nothing',
          amount: typeof key.amount === 'number' ? String(key.amount) : '',
          tolerance: typeof key.tolerance === 'number' ? String(key.tolerance) : '',
          unitLabel: cfg.rows?.[0]?.label ?? 'Amount ($)',
          explanation: typeof key.explanation_md === 'string' ? key.explanation_md : '',
        }
        setScenario(loaded.scenario)
        setOptions(loaded.options)
        setCorrectSingle(loaded.correctSingle)
        setCorrectMulti(loaded.correctMulti)
        setPolicy(loaded.policy)
        setAmount(loaded.amount)
        setTolerance(loaded.tolerance)
        setUnitLabel(loaded.unitLabel)
        setExplanation(loaded.explanation)
        setBaseline(
          JSON.stringify({
            title: initial.title, prompt: initial.prompt_md, scenario: loaded.scenario,
            paper: initial.paper ?? '', topic: initial.topic ?? '',
            difficulty: initial.difficulty ?? '', sourceSlug: initial.source_slug ?? '',
            options: loaded.options, correctSingle: loaded.correctSingle,
            correctMulti: loaded.correctMulti, policy: loaded.policy,
            amount: loaded.amount, tolerance: loaded.tolerance,
            unitLabel: loaded.unitLabel, explanation: loaded.explanation,
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

  const config = useMemo(() => {
    const base = scenario.trim() ? { scenario_md: scenario } : {}
    if (kind === 'numeric_entry') {
      return {
        ...base,
        columns: [{ id: 'amount', label: 'Amount ($)' }],
        rows: [{ id: 'answer', label: unitLabel || 'Amount ($)' }],
        options: [],
      }
    }
    return {
      ...base,
      columns: [
        kind === 'single_select'
          ? { id: 'choice', label: 'Answer' }
          : { id: 'choices', label: 'Your decision' },
      ],
      rows: [{ id: 'answer', label: 'Your answer' }],
      options,
    }
  }, [kind, scenario, options, unitLabel])

  const answerKey = useMemo(() => {
    if (kind === 'single_select') return { correct: correctSingle, explanation_md: explanation }
    if (kind === 'multi_select')
      return { correct: correctMulti, policy, explanation_md: explanation }
    return {
      amount: amount.trim() === '' ? NaN : Number(amount.replace(/,/g, '')),
      ...(tolerance.trim() !== '' ? { tolerance: Number(tolerance) } : {}),
      explanation_md: explanation,
    }
  }, [kind, correctSingle, correctMulti, policy, amount, tolerance, explanation])

  function validateAll(): ValidationIssue[] {
    const all: ValidationIssue[] = []
    if (!title.trim()) all.push({ path: 'title', message: 'Title is required' })
    if (!prompt.trim()) all.push({ path: 'prompt', message: 'Prompt / question text is required' })
    if (kind === 'single_select') {
      all.push(...validateSingleChoiceConfig(config))
      if (all.length === 0) all.push(...validateSingleChoiceKey(config as any, answerKey))
    } else if (kind === 'multi_select') {
      all.push(...validateMultiChoiceConfig(config))
      if (all.length === 0) all.push(...validateMultiChoiceKey(config as any, answerKey))
    } else {
      all.push(...validateNumericConfig(config))
      if (all.length === 0) all.push(...validateNumericKey(config as any, answerKey))
    }
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
        overall_explanation_md: null,
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

  function checkPreview() {
    const found = validateAll()
    if (found.length > 0) {
      setIssues(found)
      setPreviewFeedback(null)
      return
    }
    setIssues([])
    const fb =
      kind === 'single_select'
        ? scoreSingleChoice(config as any, answerKey as any, previewResponse)
        : kind === 'multi_select'
          ? scoreMultiChoice(config as any, answerKey as any, previewResponse)
          : scoreNumeric(config as any, answerKey as any, previewResponse)
    setPreviewFeedback(fb)
  }

  const KIND_LABELS = {
    single_select: 'single choice',
    multi_select: 'multiple response',
    numeric_entry: 'numeric entry',
  }

  if (loading) return <div className="page muted">Loading question…</div>

  const Runner =
    kind === 'single_select'
      ? SingleChoiceRunner
      : kind === 'multi_select'
        ? MultiChoiceRunner
        : NumericRunner

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
        <h1>Edit {KIND_LABELS[kind]} question</h1>
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
            <span>Question text (markdown)</span>
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="field">
            <span>Scenario (markdown, optional)</span>
            <textarea rows={3} value={scenario} onChange={(e) => setScenario(e.target.value)} />
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

          {kind === 'numeric_entry' ? (
            <>
              <h3 className="section-h">Answer</h3>
              <div className="field-grid">
                <label className="field">
                  <span>Input label / unit</span>
                  <input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} />
                </label>
                <label className="field">
                  <span>Correct amount</span>
                  <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="field">
                  <span>Tolerance (± , optional)</span>
                  <input inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
                </label>
              </div>
            </>
          ) : (
            <>
              <h3 className="section-h">
                Options {kind === 'single_select' ? '(pick the correct one)' : '(tick all correct)'}
              </h3>
              {options.map((o, i) => (
                <div className="option-row" key={o.id}>
                  {kind === 'single_select' ? (
                    <input
                      type="radio"
                      name="correct-single"
                      aria-label={`Mark option ${i + 1} correct`}
                      checked={correctSingle === o.id}
                      onChange={() => setCorrectSingle(o.id)}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`Mark option ${i + 1} correct`}
                      checked={correctMulti.includes(o.id)}
                      onChange={(e) =>
                        setCorrectMulti((prev) =>
                          e.target.checked ? [...prev, o.id].sort() : prev.filter((p) => p !== o.id),
                        )
                      }
                    />
                  )}
                  <input
                    value={o.label}
                    aria-label={`Option ${i + 1} label`}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((p) => (p.id === o.id ? { ...p, label: e.target.value } : p)),
                      )
                    }
                  />
                  <button
                    className="btn danger"
                    aria-label={`Delete option ${o.label || i + 1}`}
                    onClick={() => {
                      setOptions((prev) => prev.filter((p) => p.id !== o.id))
                      if (correctSingle === o.id) setCorrectSingle('')
                      setCorrectMulti((prev) => prev.filter((p) => p !== o.id))
                    }}
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
              {kind === 'multi_select' && (
                <label className="field" style={{ maxWidth: 320 }}>
                  <span>Marking policy</span>
                  <select value={policy} onChange={(e) => setPolicy(e.target.value as any)}>
                    <option value="per_option">Per option (partial credit)</option>
                    <option value="all_or_nothing">All or nothing</option>
                  </select>
                </label>
              )}
            </>
          )}

          <h3 className="section-h">Explanation (markdown)</h3>
          <textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />

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
              <p>{prompt || <span className="muted">(question text goes here)</span>}</p>
            </div>
            {previewFeedback ? (
              <>
                <MatrixResults feedback={previewFeedback} overallExplanationMd={null} />
                <p className="hint">Post-submit state (simulated locally — nothing is stored).</p>
              </>
            ) : (
              <Runner
                config={config as any}
                response={previewResponse}
                onChange={(rowId, colId, value) =>
                  setPreviewResponse((prev) => ({
                    ...prev,
                    [rowId]: { ...prev[rowId], [colId]: value || undefined },
                  }))
                }
                disabled={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
