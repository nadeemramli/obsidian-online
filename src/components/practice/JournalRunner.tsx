import { useMemo } from 'react'
import { Markdown } from '../../lib/markdown'
import { useNotes } from '../../lib/notesContext'
import type { JournalConfig, MatrixResponse } from '../../lib/practice/scoring.ts'

// The answering surface for a journal_entry question: the scenario (e.g. a
// trial balance) rendered as markdown, then one entry per adjustment — debit
// account, credit account, and a numeric amount. Desktop: aligned grid rows;
// mobile: the same DOM stacks into cards (CSS only).
export function JournalRunner({
  config,
  response,
  onChange,
  disabled,
}: {
  config: JournalConfig
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, value: string) => void
  disabled: boolean
}) {
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const accounts = config.options

  return (
    <div>
      {config.scenario_md && (
        <div className="journal-scenario markdown">
          <Markdown content={config.scenario_md} knownSlugs={knownSlugs} />
        </div>
      )}
      <div className="jr" role="group" aria-label="Journal entries">
        <div className="jr-head" aria-hidden="true">
          <span>Item</span>
          <span>Debit account</span>
          <span>Credit account</span>
          <span>Amount ($)</span>
        </div>
        {config.rows.map((row, i) => (
          <fieldset className="jr-row" key={row.id}>
            <legend className="jr-item">
              <span className="matrix-tx-num" aria-hidden="true">
                {i + 1}
              </span>
              {row.label}
            </legend>
            {(['debit', 'credit'] as const).map((side) => (
              <label className="jr-cell" key={side}>
                <span className="matrix-cell-label" aria-hidden="true">
                  {side === 'debit' ? 'Debit account' : 'Credit account'}
                </span>
                <select
                  aria-label={`${row.label} — ${side} account`}
                  value={response?.[row.id]?.[side] ?? ''}
                  disabled={disabled}
                  onChange={(e) => onChange(row.id, side, e.target.value)}
                >
                  <option value="">Select account…</option>
                  {accounts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="jr-cell jr-amount">
              <span className="matrix-cell-label" aria-hidden="true">
                Amount ($)
              </span>
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
          </fieldset>
        ))}
      </div>
    </div>
  )
}
