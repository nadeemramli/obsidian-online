import { useMemo } from 'react'
import type { MatrixConfig, MatrixResponse } from '../../lib/practice/scoring.ts'

// The answering surface for a matrix_select question. Desktop: a table-like
// grid (Transaction | Debit | Credit). Mobile: the same DOM collapses into a
// card per transaction (CSS only), so semantics and fields are identical.
// Each row is a fieldset whose legend is the transaction, and every select has
// an explicit aria-label — no color-only or layout-only meaning.
export function MatrixRunner({
  config,
  response,
  onChange,
  disabled,
}: {
  config: MatrixConfig
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, optionId: string) => void
  disabled: boolean
}) {
  const options = config.options
  return (
    <div className="matrix" role="group" aria-label="Double entry matrix">
      <div className="matrix-head" aria-hidden="true">
        <span>Transaction</span>
        {config.columns.map((c) => (
          <span key={c.id}>{c.label}</span>
        ))}
      </div>
      {config.rows.map((row, i) => (
        <fieldset className="matrix-row" key={row.id}>
          <legend className="matrix-tx">
            <span className="matrix-tx-num" aria-hidden="true">
              {i + 1}
            </span>
            {row.label}
          </legend>
          {config.columns.map((col) => {
            const value = response?.[row.id]?.[col.id] ?? ''
            return (
              <label className="matrix-cell" key={col.id}>
                <span className="matrix-cell-label" aria-hidden="true">
                  {col.label}
                </span>
                <select
                  aria-label={`${row.label} — ${col.label.toLowerCase()} entry`}
                  value={value}
                  disabled={disabled}
                  onChange={(e) => onChange(row.id, col.id, e.target.value)}
                >
                  <option value="">Select account effect…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

// Small helper used by pages: option id -> display label.
export function useOptionLabels(config: MatrixConfig): Map<string, string> {
  return useMemo(() => new Map(config.options.map((o) => [o.id, o.label])), [config.options])
}
