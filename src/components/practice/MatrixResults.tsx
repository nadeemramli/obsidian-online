import { useMemo } from 'react'
import { Markdown } from '../../lib/markdown'
import { useNotes } from '../../lib/notesContext'
import type { MatrixFeedback } from '../../lib/practice/scoring.ts'

// Post-submission feedback: summary scores, per-cell verdicts (icon + text +
// border — never color alone), the learner's answer vs the correct answer for
// wrong cells, per-row explanations and the corrected journal. Renders purely
// from the stored feedback snapshot, so historical attempts stay readable even
// after the question is edited (PRD §B.9).
export function MatrixResults({
  feedback,
  overallExplanationMd,
}: {
  feedback: MatrixFeedback
  overallExplanationMd?: string | null
}) {
  const { notes } = useNotes()
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])
  const labelOf = (id: string | null) =>
    id ? feedback.option_labels[id] ?? id : 'No answer'
  const colLabel = (id: string) => feedback.columns.find((c) => c.id === id)?.label ?? id
  const pct = Math.round((feedback.cell_score / feedback.cell_max) * 100)

  return (
    <div className="results">
      <div className="result-summary" role="status">
        <div className="result-score">
          <span className="result-num">
            {feedback.cell_score}/{feedback.cell_max}
          </span>
          <span className="result-caption">entries correct</span>
        </div>
        <div className="result-score">
          <span className="result-num">
            {feedback.tx_correct}/{feedback.tx_total}
          </span>
          <span className="result-caption">transactions fully correct</span>
        </div>
        <div className="result-score">
          <span className="result-num">{pct}%</span>
          <span className="result-caption">score</span>
        </div>
      </div>

      <h3 className="results-h">Row by row</h3>
      <ol className="result-rows">
        {feedback.rows.map((row) => (
          <li className={'result-row' + (row.row_correct ? ' all-ok' : '')} key={row.row_id}>
            <div className="result-tx">
              <span
                className={'verdict-chip ' + (row.row_correct ? 'ok' : 'err')}
                aria-hidden="true"
              >
                {row.row_correct ? '✓' : '✗'}
              </span>
              <strong>{row.row_label}</strong>
              <span className="sr-only">
                {row.row_correct ? 'fully correct' : 'has incorrect entries'}
              </span>
            </div>
            <div className="result-cells">
              {row.cells.map((cell) => (
                <div className={'result-cell ' + (cell.ok ? 'ok' : 'err')} key={cell.column_id}>
                  <span className="result-cell-head">
                    <span aria-hidden="true">{cell.ok ? '✓' : '✗'}</span>{' '}
                    {colLabel(cell.column_id)} {cell.ok ? '— correct' : '— incorrect'}
                  </span>
                  {cell.ok ? (
                    <span className="result-answer">{labelOf(cell.selected)}</span>
                  ) : (
                    <>
                      <span className="result-answer yours">
                        <em>Your answer:</em> {labelOf(cell.selected)}
                      </span>
                      <span className="result-answer correct">
                        <em>Correct answer:</em> {labelOf(cell.correct)}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {row.explanation_md && (
              <div className="result-explain markdown">
                <Markdown content={row.explanation_md} knownSlugs={knownSlugs} />
              </div>
            )}
          </li>
        ))}
      </ol>

      <h3 className="results-h">Correct journal entries</h3>
      <div className="journal-wrap">
        <table className="journal">
          <thead>
            <tr>
              <th scope="col">Transaction</th>
              {feedback.columns.map((c) => (
                <th scope="col" key={c.id}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feedback.rows.map((row) => (
              <tr key={row.row_id}>
                <th scope="row">{row.row_label}</th>
                {row.cells.map((cell) => (
                  <td key={cell.column_id}>{labelOf(cell.correct)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overallExplanationMd && (
        <>
          <h3 className="results-h">The general rules</h3>
          <div className="result-overall markdown">
            <Markdown content={overallExplanationMd} knownSlugs={knownSlugs} />
          </div>
        </>
      )}
    </div>
  )
}
