// Pure, dependency-free scoring for `matrix_select` questions.
//
// CANONICAL COPY. `supabase/functions/practice-submit/scoring.ts` is a byte-for-byte
// copy deployed with the edge function (Deno can't import from src/ at runtime).
// The unit suite (e2e/practice-scoring.spec.ts) fails if the two files drift.
//
// Scoring rules (PRD §B.9): every cell scores independently; a transaction is fully
// correct only when all its cells are; a debit/credit reversal is simply two wrong
// cells — no partial credit. Deterministic: same inputs, same output, no clock, no IO.

export type MatrixColumn = { id: string; label: string }
export type MatrixRow = { id: string; label: string }
export type MatrixOption = { id: string; label: string }

export type MatrixConfig = {
  note_md?: string
  columns: MatrixColumn[]
  rows: MatrixRow[]
  options: MatrixOption[]
}

// Answer key row: one correct option id per column id, plus the row's teaching
// explanation. Column ids therefore may not be named "explanation_md".
export type MatrixKeyRow = { [columnIdOrExplanation: string]: string }
export type MatrixAnswerKey = { rows: Record<string, MatrixKeyRow> }

// Learner response: rowId -> columnId -> selected option id (missing = unanswered).
export type MatrixResponse = Record<string, Record<string, string | undefined>>

export type CellVerdict = {
  column_id: string
  selected: string | null // option id the learner chose, null = unanswered
  correct: string // option id from the key
  ok: boolean
}

export type RowFeedback = {
  row_id: string
  row_label: string
  cells: CellVerdict[]
  row_correct: boolean
  explanation_md: string
}

export type MatrixFeedback = {
  kind: 'matrix_select'
  // Self-contained snapshot: column and option labels are embedded at scoring
  // time so a stored attempt stays readable even after the question is edited.
  columns: MatrixColumn[]
  option_labels: Record<string, string>
  rows: RowFeedback[]
  cell_score: number
  cell_max: number
  tx_correct: number
  tx_total: number
}

export function scoreMatrix(
  config: MatrixConfig,
  key: MatrixAnswerKey,
  response: MatrixResponse,
): MatrixFeedback {
  const rows: RowFeedback[] = []
  let cellScore = 0
  let cellMax = 0
  let txCorrect = 0

  for (const row of config.rows) {
    const keyRow = key.rows[row.id]
    if (!keyRow) {
      // Publishing validation guarantees completeness; a hole here means the
      // content is broken, and silently skipping would misreport the score.
      throw new Error(`answer key missing row "${row.id}"`)
    }
    const cells: CellVerdict[] = []
    let rowCorrect = true
    for (const col of config.columns) {
      const correct = keyRow[col.id]
      if (typeof correct !== 'string' || !correct) {
        throw new Error(`answer key missing cell "${row.id}.${col.id}"`)
      }
      const raw = response?.[row.id]?.[col.id]
      const selected = typeof raw === 'string' && raw ? raw : null
      const ok = selected === correct
      cellMax += 1
      if (ok) cellScore += 1
      else rowCorrect = false
      cells.push({ column_id: col.id, selected, correct, ok })
    }
    if (rowCorrect) txCorrect += 1
    rows.push({
      row_id: row.id,
      row_label: row.label,
      cells,
      row_correct: rowCorrect,
      explanation_md: typeof keyRow.explanation_md === 'string' ? keyRow.explanation_md : '',
    })
  }

  const optionLabels: Record<string, string> = {}
  for (const o of config.options) optionLabels[o.id] = o.label

  return {
    kind: 'matrix_select',
    columns: config.columns.map((c) => ({ id: c.id, label: c.label })),
    option_labels: optionLabels,
    rows,
    cell_score: cellScore,
    cell_max: cellMax,
    tx_correct: txCorrect,
    tx_total: config.rows.length,
  }
}

// How many cells of the matrix have an answer selected (for the progress meter).
export function countAnswered(config: MatrixConfig, response: MatrixResponse): number {
  let n = 0
  for (const row of config.rows) {
    for (const col of config.columns) {
      const v = response?.[row.id]?.[col.id]
      if (typeof v === 'string' && v) n += 1
    }
  }
  return n
}

export function totalCells(config: MatrixConfig): number {
  return config.rows.length * config.columns.length
}
