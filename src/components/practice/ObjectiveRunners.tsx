import { useMemo } from 'react'
import { Markdown } from '../../lib/markdown'
import { useNotes } from '../../lib/notesContext'
import {
  parseMultiSelection,
  type ChoiceConfig,
  type MatrixResponse,
  type StatementConfig,
} from '../../lib/practice/scoring.ts'

// Objective-kind answering surfaces (PRD §10.2). All three write into the
// canonical response shape so drafts, progress and submission are unchanged.

function Scenario({ md }: { md?: string }) {
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  if (!md) return null
  return (
    <div className="journal-scenario markdown">
      <Markdown content={md} knownSlugs={knownSlugs} />
    </div>
  )
}

export function SingleChoiceRunner({
  config,
  response,
  onChange,
  disabled,
}: {
  config: ChoiceConfig & { scenario_md?: string }
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, value: string) => void
  disabled: boolean
}) {
  const selected = response?.answer?.choice ?? ''
  return (
    <div>
      <Scenario md={config.scenario_md} />
      <fieldset className="choice-list" disabled={disabled}>
        <legend className="sr-only">Choose one answer</legend>
        {config.options.map((o) => (
          <label key={o.id} className={'choice-row' + (selected === o.id ? ' picked' : '')}>
            <input
              type="radio"
              name="single-choice"
              value={o.id}
              checked={selected === o.id}
              onChange={() => onChange('answer', 'choice', o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

export function MultiChoiceRunner({
  config,
  response,
  onChange,
  disabled,
}: {
  config: ChoiceConfig & { scenario_md?: string }
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, value: string) => void
  disabled: boolean
}) {
  const selected = new Set(parseMultiSelection(response?.answer?.choices))
  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange('answer', 'choices', Array.from(next).sort().join(','))
  }
  return (
    <div>
      <Scenario md={config.scenario_md} />
      <fieldset className="choice-list" disabled={disabled}>
        <legend className="sr-only">Choose all answers that apply</legend>
        {config.options.map((o) => (
          <label key={o.id} className={'choice-row' + (selected.has(o.id) ? ' picked' : '')}>
            <input
              type="checkbox"
              checked={selected.has(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

export function NumericRunner({
  config,
  response,
  onChange,
  disabled,
}: {
  config: StatementConfig
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, value: string) => void
  disabled: boolean
}) {
  const row = config.rows[0]
  return (
    <div>
      <Scenario md={config.scenario_md} />
      <label className="numeric-answer">
        <span className="numeric-label">{row?.label ?? 'Amount ($)'}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          aria-label={`${row?.label ?? 'Answer'} — amount`}
          value={response?.answer?.amount ?? ''}
          disabled={disabled}
          onChange={(e) => onChange('answer', 'amount', e.target.value)}
        />
      </label>
    </div>
  )
}
