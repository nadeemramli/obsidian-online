import { useMemo } from 'react'
import { Markdown } from '../../lib/markdown'
import { useNotes } from '../../lib/notesContext'
import type { MatrixResponse, StatementConfig } from '../../lib/practice/scoring.ts'

// Proforma construction surface for statement_prep: the scenario (trial
// balance, notes) as markdown, then one numeric input per statement line.
// Keyboard-first: inputs are plain text fields in DOM order, right-aligned,
// with tabular numerals. Subtotal/total rows are emphasised but still entered
// by the learner — computing them is part of the skill.
export function StatementRunner({
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
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  return (
    <div>
      {config.scenario_md && (
        <div className="journal-scenario markdown">
          <Markdown content={config.scenario_md} knownSlugs={knownSlugs} />
        </div>
      )}
      <div className="stmt" role="group" aria-label="Statement proforma">
        <div className="stmt-head" aria-hidden="true">
          <span></span>
          <span>{config.columns[0]?.label ?? 'Amount ($)'}</span>
        </div>
        {config.rows.map((row) => (
          <label
            key={row.id}
            className={
              'stmt-row style-' + (row.style ?? 'line') + (row.indent ? ' indented' : '')
            }
          >
            <span className="stmt-label">{row.label}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              aria-label={`${row.label} — amount`}
              value={response?.[row.id]?.amount ?? ''}
              disabled={disabled}
              onChange={(e) => onChange(row.id, 'amount', e.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
