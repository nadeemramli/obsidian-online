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
  kind:
    | 'matrix_select'
    | 'journal_entry'
    | 'statement_prep'
    | 'single_select'
    | 'multi_select'
    | 'numeric_entry'
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

// ---------------------------------------------------------------------------
// journal_entry — "prepare the journal entries" questions (FS preparation).
// Config reuses the matrix shape with exactly three columns: debit, credit
// (account pickers over a shared option set) and amount (numeric input).
// The scorer emits the same self-contained MatrixFeedback snapshot, so the
// results renderer and stored attempts are kind-agnostic.
// ---------------------------------------------------------------------------

export type JournalConfig = {
  scenario_md?: string // trial balance / background, rendered above the rows
  note_md?: string
  columns: MatrixColumn[] // must be debit / credit / amount
  rows: MatrixRow[]
  options: MatrixOption[] // the account list shared by debit and credit
}

export type JournalKeyRow = {
  debit: string
  credit: string
  amount: number
  tolerance?: number // absolute; defaults to 0 (exact)
  explanation_md: string
}
export type JournalAnswerKey = { rows: Record<string, JournalKeyRow> }

// Amounts arrive as the raw input string; parse strictly (plain number,
// optional thousands commas) so "1,740" works but "10+10" does not.
export function parseAmount(raw: string | undefined | null): number | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/,/g, '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

export function scoreJournal(
  config: JournalConfig,
  key: JournalAnswerKey,
  response: MatrixResponse,
): MatrixFeedback {
  const rows: RowFeedback[] = []
  let cellScore = 0
  let cellMax = 0
  let txCorrect = 0

  for (const row of config.rows) {
    const keyRow = key.rows[row.id]
    if (!keyRow) throw new Error(`answer key missing row "${row.id}"`)
    const cells: CellVerdict[] = []
    let rowCorrect = true
    for (const col of config.columns) {
      const raw = response?.[row.id]?.[col.id]
      const selected = typeof raw === 'string' && raw.trim() ? raw.trim() : null
      let correct: string
      let ok: boolean
      if (col.id === 'amount') {
        correct = String(keyRow.amount)
        const parsed = parseAmount(selected)
        const tolerance = typeof keyRow.tolerance === 'number' ? keyRow.tolerance : 0
        ok = parsed !== null && Math.abs(parsed - keyRow.amount) <= tolerance
      } else {
        const expected = keyRow[col.id as 'debit' | 'credit']
        if (typeof expected !== 'string' || !expected) {
          throw new Error(`answer key missing cell "${row.id}.${col.id}"`)
        }
        correct = expected
        ok = selected === expected
      }
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
    kind: 'journal_entry',
    columns: config.columns.map((c) => ({ id: c.id, label: c.label })),
    option_labels: optionLabels,
    rows,
    cell_score: cellScore,
    cell_max: cellMax,
    tx_correct: txCorrect,
    tx_total: config.rows.length,
  }
}

// ---------------------------------------------------------------------------
// statement_prep — construct a financial statement or extract line by line.
// One numeric cell per row; rows carry display metadata (indent, style) so the
// runner can render a proforma. Emits the same self-contained snapshot.
// ---------------------------------------------------------------------------

export type StatementRow = {
  id: string
  label: string
  indent?: number // 0 or 1 — visual nesting in the proforma
  style?: 'line' | 'subtotal' | 'total'
}

export type StatementConfig = {
  scenario_md?: string
  note_md?: string
  columns: MatrixColumn[] // exactly one column with id "amount"
  rows: StatementRow[]
  options: MatrixOption[] // unused for this kind; kept for shape compatibility
}

export type StatementKeyRow = {
  amount: number
  tolerance?: number
  explanation_md: string
}
export type StatementAnswerKey = { rows: Record<string, StatementKeyRow> }

export function scoreStatement(
  config: StatementConfig,
  key: StatementAnswerKey,
  response: MatrixResponse,
): MatrixFeedback {
  const rows: RowFeedback[] = []
  let cellScore = 0
  let cellMax = 0
  let txCorrect = 0

  for (const row of config.rows) {
    const keyRow = key.rows[row.id]
    if (!keyRow || typeof keyRow.amount !== 'number') {
      throw new Error(`answer key missing row "${row.id}"`)
    }
    const raw = response?.[row.id]?.amount
    const selected = typeof raw === 'string' && raw.trim() ? raw.trim() : null
    const parsed = parseAmount(selected)
    const tolerance = typeof keyRow.tolerance === 'number' ? keyRow.tolerance : 0
    const ok = parsed !== null && Math.abs(parsed - keyRow.amount) <= tolerance
    cellMax += 1
    if (ok) {
      cellScore += 1
      txCorrect += 1
    }
    rows.push({
      row_id: row.id,
      row_label: row.label,
      cells: [{ column_id: 'amount', selected, correct: String(keyRow.amount), ok }],
      row_correct: ok,
      explanation_md: typeof keyRow.explanation_md === 'string' ? keyRow.explanation_md : '',
    })
  }

  const optionLabels: Record<string, string> = {}
  for (const o of config.options) optionLabels[o.id] = o.label

  return {
    kind: 'statement_prep',
    columns: config.columns.map((c) => ({ id: c.id, label: c.label })),
    option_labels: optionLabels,
    rows,
    cell_score: cellScore,
    cell_max: cellMax,
    tx_correct: txCorrect,
    tx_total: config.rows.length,
  }
}

// ---------------------------------------------------------------------------
// Objective kinds (PRD §10.2): single_select, multi_select, numeric_entry.
// All use the canonical rows/columns shape so the progress helpers and the
// self-contained feedback snapshot work unchanged:
//   single_select : rows [{id:'answer'}], columns [{id:'choice'}]
//                   response { answer: { choice: optionId } }
//   multi_select  : rows [{id:'answer'}], columns [{id:'choices'}]
//                   response { answer: { choices: 'id1,id2' } } (sorted, comma-joined)
//   numeric_entry : rows [{id:'answer'}], columns [{id:'amount'}]
//                   response { answer: { amount: '123' } }
// ---------------------------------------------------------------------------

export type ChoiceConfig = {
  note_md?: string
  columns: MatrixColumn[]
  rows: MatrixRow[]
  options: MatrixOption[]
}

export type SingleChoiceKey = { correct: string; explanation_md: string }

export function scoreSingleChoice(
  config: ChoiceConfig,
  key: SingleChoiceKey,
  response: MatrixResponse,
): MatrixFeedback {
  const raw = response?.answer?.choice
  const selected = typeof raw === 'string' && raw ? raw : null
  const ok = selected === key.correct
  const optionLabels: Record<string, string> = {}
  for (const o of config.options) optionLabels[o.id] = o.label
  return {
    kind: 'single_select',
    columns: [{ id: 'choice', label: 'Answer' }],
    option_labels: optionLabels,
    rows: [
      {
        row_id: 'answer',
        row_label: config.rows[0]?.label ?? 'Your answer',
        cells: [{ column_id: 'choice', selected, correct: key.correct, ok }],
        row_correct: ok,
        explanation_md: key.explanation_md,
      },
    ],
    cell_score: ok ? 1 : 0,
    cell_max: 1,
    tx_correct: ok ? 1 : 0,
    tx_total: 1,
  }
}

export type MultiChoiceKey = {
  correct: string[]
  policy?: 'per_option' | 'all_or_nothing' // default per_option
  explanation_md: string
}

export function parseMultiSelection(raw: string | undefined | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean).sort()
}

export function scoreMultiChoice(
  config: ChoiceConfig,
  key: MultiChoiceKey,
  response: MatrixResponse,
): MatrixFeedback {
  const selectedIds = new Set(parseMultiSelection(response?.answer?.choices))
  const correctIds = new Set(key.correct)
  const policy = key.policy ?? 'per_option'

  const optionLabels: Record<string, string> = {
    __sel: 'Selected',
    __not: 'Not selected',
  }
  for (const o of config.options) optionLabels[o.id] = o.label

  // One feedback row per option: was the include/exclude decision right?
  const rows: RowFeedback[] = config.options.map((o) => {
    const chose = selectedIds.has(o.id)
    const should = correctIds.has(o.id)
    const ok = chose === should
    return {
      row_id: o.id,
      row_label: o.label,
      cells: [
        {
          column_id: 'choices',
          selected: chose ? '__sel' : '__not',
          correct: should ? '__sel' : '__not',
          ok,
        },
      ],
      row_correct: ok,
      explanation_md: '',
    }
  })
  const perOptionScore = rows.filter((r) => r.row_correct).length
  const allRight = perOptionScore === config.options.length
  if (rows.length > 0) rows[rows.length - 1].explanation_md = key.explanation_md

  return {
    kind: 'multi_select',
    columns: [{ id: 'choices', label: 'Your decision' }],
    option_labels: optionLabels,
    rows,
    cell_score: policy === 'per_option' ? perOptionScore : allRight ? 1 : 0,
    cell_max: policy === 'per_option' ? config.options.length : 1,
    tx_correct: allRight ? 1 : 0,
    tx_total: 1,
  }
}

export type NumericKey = { amount: number; tolerance?: number; explanation_md: string }

export function scoreNumeric(
  config: StatementConfig,
  key: NumericKey,
  response: MatrixResponse,
): MatrixFeedback {
  const fb = scoreStatement(
    config,
    { rows: { answer: { amount: key.amount, tolerance: key.tolerance, explanation_md: key.explanation_md } } },
    response,
  )
  return { ...fb, kind: 'numeric_entry' }
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
