// Runtime validation for matrix_select configuration, answer keys and learner
// submissions. Hand-rolled on purpose: the project has no validation library and
// adding one for three validators would be an unnecessary dependency (CLAUDE.md).
//
// CANONICAL COPY. `supabase/functions/practice-submit/validate.ts` is a byte-for-byte
// copy deployed with the edge function; the unit suite fails if the two drift.

import type {
  ChoiceConfig,
  JournalAnswerKey,
  JournalConfig,
  MatrixAnswerKey,
  MatrixConfig,
  MatrixResponse,
  MultiChoiceKey,
  NumericKey,
  SingleChoiceKey,
  StatementAnswerKey,
  StatementConfig,
} from './scoring.ts'

export type ValidationIssue = { path: string; message: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkIdLabelList(
  value: unknown,
  path: string,
  out: ValidationIssue[],
): value is Array<{ id: string; label: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    out.push({ path, message: 'must be a non-empty list' })
    return false
  }
  const seen = new Set<string>()
  let ok = true
  value.forEach((entry, i) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()) {
      out.push({ path: `${path}[${i}].id`, message: 'missing id' })
      ok = false
      return
    }
    if (typeof entry.label !== 'string' || !entry.label.trim()) {
      out.push({ path: `${path}[${i}].label`, message: 'missing label' })
      ok = false
    }
    if (seen.has(entry.id)) {
      out.push({ path: `${path}[${i}].id`, message: `duplicate id "${entry.id}"` })
      ok = false
    }
    seen.add(entry.id)
  })
  return ok
}

export function validateMatrixConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(config)) return [{ path: 'config', message: 'must be an object' }]

  checkIdLabelList(config.columns, 'columns', issues)
  checkIdLabelList(config.rows, 'rows', issues)
  checkIdLabelList(config.options, 'options', issues)

  if (Array.isArray(config.columns)) {
    for (const col of config.columns) {
      if (isRecord(col) && col.id === 'explanation_md') {
        issues.push({ path: 'columns', message: '"explanation_md" is a reserved column id' })
      }
    }
  }
  if ('note_md' in config && config.note_md !== undefined && typeof config.note_md !== 'string') {
    issues.push({ path: 'note_md', message: 'must be a string' })
  }
  return issues
}

// The key must give exactly one valid option per (row, column) plus a per-row
// explanation. Used by the builder's publish gate and by the edge function.
export function validateMatrixKey(config: MatrixConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key) || !isRecord(key.rows)) {
    return [{ path: 'answer_key', message: 'must be an object with a "rows" map' }]
  }
  const optionIds = new Set(config.options.map((o) => o.id))
  for (const row of config.rows) {
    const keyRow = (key.rows as Record<string, unknown>)[row.id]
    if (!isRecord(keyRow)) {
      issues.push({ path: `answer_key.rows.${row.id}`, message: `missing answers for "${row.label}"` })
      continue
    }
    for (const col of config.columns) {
      const v = keyRow[col.id]
      if (typeof v !== 'string' || !v) {
        issues.push({
          path: `answer_key.rows.${row.id}.${col.id}`,
          message: `"${row.label}" has no correct ${col.label.toLowerCase()} answer`,
        })
      } else if (!optionIds.has(v)) {
        issues.push({
          path: `answer_key.rows.${row.id}.${col.id}`,
          message: `correct answer for "${row.label}" (${col.label}) is not in the option set`,
        })
      }
    }
    if (typeof keyRow.explanation_md !== 'string' || !keyRow.explanation_md.trim()) {
      issues.push({
        path: `answer_key.rows.${row.id}.explanation_md`,
        message: `"${row.label}" has no explanation`,
      })
    }
  }
  return issues
}

// Structural check of a learner submission. Unanswered cells are allowed (they
// score zero); unknown rows/columns/options mean a malformed or tampered payload.
export function validateMatrixResponse(config: MatrixConfig, response: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(response)) return [{ path: 'answers', message: 'must be an object' }]
  const rowIds = new Set(config.rows.map((r) => r.id))
  const colIds = new Set(config.columns.map((c) => c.id))
  const optionIds = new Set(config.options.map((o) => o.id))

  for (const [rowId, cells] of Object.entries(response)) {
    if (!rowIds.has(rowId)) {
      issues.push({ path: `answers.${rowId}`, message: 'unknown row' })
      continue
    }
    if (!isRecord(cells)) {
      issues.push({ path: `answers.${rowId}`, message: 'must be an object' })
      continue
    }
    for (const [colId, optionId] of Object.entries(cells)) {
      if (!colIds.has(colId)) {
        issues.push({ path: `answers.${rowId}.${colId}`, message: 'unknown column' })
      } else if (optionId !== undefined && (typeof optionId !== 'string' || !optionIds.has(optionId))) {
        issues.push({ path: `answers.${rowId}.${colId}`, message: 'unknown option' })
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// journal_entry
// ---------------------------------------------------------------------------

const JOURNAL_COLUMNS = ['debit', 'credit', 'amount']

export function validateJournalConfig(config: unknown): ValidationIssue[] {
  const issues = validateMatrixConfig(config)
  if (isRecord(config) && Array.isArray(config.columns)) {
    const ids = config.columns.map((c: any) => (isRecord(c) ? c.id : null))
    if (
      ids.length !== 3 ||
      !JOURNAL_COLUMNS.every((id) => ids.includes(id))
    ) {
      issues.push({
        path: 'columns',
        message: 'journal questions need exactly the columns debit, credit and amount',
      })
    }
  }
  if (isRecord(config) && 'scenario_md' in config && config.scenario_md !== undefined && typeof config.scenario_md !== 'string') {
    issues.push({ path: 'scenario_md', message: 'must be a string' })
  }
  return issues
}

export function validateJournalKey(config: JournalConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key) || !isRecord(key.rows)) {
    return [{ path: 'answer_key', message: 'must be an object with a "rows" map' }]
  }
  const optionIds = new Set(config.options.map((o) => o.id))
  for (const row of config.rows) {
    const keyRow = (key.rows as Record<string, unknown>)[row.id]
    if (!isRecord(keyRow)) {
      issues.push({ path: `answer_key.rows.${row.id}`, message: `missing answers for "${row.label}"` })
      continue
    }
    for (const side of ['debit', 'credit'] as const) {
      const v = keyRow[side]
      if (typeof v !== 'string' || !v) {
        issues.push({
          path: `answer_key.rows.${row.id}.${side}`,
          message: `"${row.label}" has no correct ${side} account`,
        })
      } else if (!optionIds.has(v)) {
        issues.push({
          path: `answer_key.rows.${row.id}.${side}`,
          message: `correct ${side} account for "${row.label}" is not in the account list`,
        })
      }
    }
    if (typeof keyRow.amount !== 'number' || !isFinite(keyRow.amount)) {
      issues.push({
        path: `answer_key.rows.${row.id}.amount`,
        message: `"${row.label}" has no correct amount`,
      })
    }
    if (
      'tolerance' in keyRow &&
      keyRow.tolerance !== undefined &&
      (typeof keyRow.tolerance !== 'number' || keyRow.tolerance < 0)
    ) {
      issues.push({
        path: `answer_key.rows.${row.id}.tolerance`,
        message: `"${row.label}" has an invalid tolerance`,
      })
    }
    if (typeof keyRow.explanation_md !== 'string' || !keyRow.explanation_md.trim()) {
      issues.push({
        path: `answer_key.rows.${row.id}.explanation_md`,
        message: `"${row.label}" has no explanation`,
      })
    }
  }
  return issues
}

// Debit/credit cells must reference known accounts; amount cells may be any
// string (they score wrong if unparseable, but a string payload is not
// "malformed" — learners type freely).
export function validateJournalResponse(config: JournalConfig, response: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(response)) return [{ path: 'answers', message: 'must be an object' }]
  const rowIds = new Set(config.rows.map((r) => r.id))
  const optionIds = new Set(config.options.map((o) => o.id))

  for (const [rowId, cells] of Object.entries(response)) {
    if (!rowIds.has(rowId)) {
      issues.push({ path: `answers.${rowId}`, message: 'unknown row' })
      continue
    }
    if (!isRecord(cells)) {
      issues.push({ path: `answers.${rowId}`, message: 'must be an object' })
      continue
    }
    for (const [colId, value] of Object.entries(cells)) {
      if (!JOURNAL_COLUMNS.includes(colId)) {
        issues.push({ path: `answers.${rowId}.${colId}`, message: 'unknown column' })
      } else if (colId !== 'amount' && value !== undefined && (typeof value !== 'string' || !optionIds.has(value))) {
        issues.push({ path: `answers.${rowId}.${colId}`, message: 'unknown option' })
      } else if (colId === 'amount' && value !== undefined && typeof value !== 'string') {
        issues.push({ path: `answers.${rowId}.amount`, message: 'must be a string' })
      }
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// statement_prep
// ---------------------------------------------------------------------------

export function validateStatementConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(config)) return [{ path: 'config', message: 'must be an object' }]

  checkIdLabelList(config.rows, 'rows', issues)
  if (
    !Array.isArray(config.columns) ||
    config.columns.length !== 1 ||
    !isRecord(config.columns[0]) ||
    config.columns[0].id !== 'amount'
  ) {
    issues.push({
      path: 'columns',
      message: 'statement questions need exactly one column with id "amount"',
    })
  }
  if ('options' in config && config.options !== undefined && !Array.isArray(config.options)) {
    issues.push({ path: 'options', message: 'must be a list' })
  }
  for (const k of ['scenario_md', 'note_md'] as const) {
    if (k in config && config[k] !== undefined && typeof config[k] !== 'string') {
      issues.push({ path: k, message: 'must be a string' })
    }
  }
  if (Array.isArray(config.rows)) {
    config.rows.forEach((r: any, i: number) => {
      if (isRecord(r) && 'style' in r && r.style !== undefined &&
          !['line', 'subtotal', 'total'].includes(r.style as string)) {
        issues.push({ path: `rows[${i}].style`, message: 'style must be line, subtotal or total' })
      }
    })
  }
  return issues
}

export function validateStatementKey(config: StatementConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key) || !isRecord(key.rows)) {
    return [{ path: 'answer_key', message: 'must be an object with a "rows" map' }]
  }
  for (const row of config.rows) {
    const keyRow = (key.rows as Record<string, unknown>)[row.id]
    if (!isRecord(keyRow)) {
      issues.push({ path: `answer_key.rows.${row.id}`, message: `missing answer for "${row.label}"` })
      continue
    }
    if (typeof keyRow.amount !== 'number' || !isFinite(keyRow.amount)) {
      issues.push({
        path: `answer_key.rows.${row.id}.amount`,
        message: `"${row.label}" has no correct amount`,
      })
    }
    if (
      'tolerance' in keyRow &&
      keyRow.tolerance !== undefined &&
      (typeof keyRow.tolerance !== 'number' || keyRow.tolerance < 0)
    ) {
      issues.push({
        path: `answer_key.rows.${row.id}.tolerance`,
        message: `"${row.label}" has an invalid tolerance`,
      })
    }
    if (typeof keyRow.explanation_md !== 'string' || !keyRow.explanation_md.trim()) {
      issues.push({
        path: `answer_key.rows.${row.id}.explanation_md`,
        message: `"${row.label}" has no explanation`,
      })
    }
  }
  return issues
}

export function validateStatementResponse(
  config: StatementConfig,
  response: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(response)) return [{ path: 'answers', message: 'must be an object' }]
  const rowIds = new Set(config.rows.map((r) => r.id))
  for (const [rowId, cells] of Object.entries(response)) {
    if (!rowIds.has(rowId)) {
      issues.push({ path: `answers.${rowId}`, message: 'unknown row' })
      continue
    }
    if (!isRecord(cells)) {
      issues.push({ path: `answers.${rowId}`, message: 'must be an object' })
      continue
    }
    for (const [colId, value] of Object.entries(cells)) {
      if (colId !== 'amount') {
        issues.push({ path: `answers.${rowId}.${colId}`, message: 'unknown column' })
      } else if (value !== undefined && typeof value !== 'string') {
        issues.push({ path: `answers.${rowId}.amount`, message: 'must be a string' })
      }
    }
  }
  return issues
}

export function asStatementConfig(v: unknown): StatementConfig {
  return v as StatementConfig
}
export function asStatementKey(v: unknown): StatementAnswerKey {
  return v as StatementAnswerKey
}

// ---------------------------------------------------------------------------
// Objective kinds: single_select / multi_select / numeric_entry
// ---------------------------------------------------------------------------

function validateChoiceShape(
  config: unknown,
  columnId: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(config)) {
    issues.push({ path: 'config', message: 'must be an object' })
    return
  }
  checkIdLabelList(config.options, 'options', issues)
  if (Array.isArray(config.options) && config.options.length < 2) {
    issues.push({ path: 'options', message: 'needs at least two options' })
  }
  if (
    !Array.isArray(config.rows) ||
    config.rows.length !== 1 ||
    !isRecord(config.rows[0]) ||
    config.rows[0].id !== 'answer'
  ) {
    issues.push({ path: 'rows', message: 'needs exactly one row with id "answer"' })
  }
  if (
    !Array.isArray(config.columns) ||
    config.columns.length !== 1 ||
    !isRecord(config.columns[0]) ||
    config.columns[0].id !== columnId
  ) {
    issues.push({ path: 'columns', message: `needs exactly one column with id "${columnId}"` })
  }
}

export function validateSingleChoiceConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  validateChoiceShape(config, 'choice', issues)
  return issues
}

export function validateSingleChoiceKey(config: ChoiceConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key)) return [{ path: 'answer_key', message: 'must be an object' }]
  const optionIds = new Set(config.options.map((o) => o.id))
  if (typeof key.correct !== 'string' || !optionIds.has(key.correct)) {
    issues.push({ path: 'answer_key.correct', message: 'correct answer must be one of the options' })
  }
  if (typeof key.explanation_md !== 'string' || !key.explanation_md.trim()) {
    issues.push({ path: 'answer_key.explanation_md', message: 'an explanation is required' })
  }
  return issues
}

export function validateSingleChoiceResponse(
  config: ChoiceConfig,
  response: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(response)) return [{ path: 'answers', message: 'must be an object' }]
  const optionIds = new Set(config.options.map((o) => o.id))
  for (const [rowId, cells] of Object.entries(response)) {
    if (rowId !== 'answer' || !isRecord(cells)) {
      issues.push({ path: `answers.${rowId}`, message: 'unknown row' })
      continue
    }
    for (const [colId, v] of Object.entries(cells)) {
      if (colId !== 'choice') issues.push({ path: `answers.answer.${colId}`, message: 'unknown column' })
      else if (v !== undefined && (typeof v !== 'string' || !optionIds.has(v)))
        issues.push({ path: 'answers.answer.choice', message: 'unknown option' })
    }
  }
  return issues
}

export function validateMultiChoiceConfig(config: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  validateChoiceShape(config, 'choices', issues)
  return issues
}

export function validateMultiChoiceKey(config: ChoiceConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key)) return [{ path: 'answer_key', message: 'must be an object' }]
  const optionIds = new Set(config.options.map((o) => o.id))
  if (
    !Array.isArray(key.correct) ||
    key.correct.length === 0 ||
    key.correct.some((c) => typeof c !== 'string' || !optionIds.has(c))
  ) {
    issues.push({
      path: 'answer_key.correct',
      message: 'correct answers must be a non-empty subset of the options',
    })
  }
  if (Array.isArray(key.correct) && key.correct.length === config.options.length) {
    issues.push({ path: 'answer_key.correct', message: 'at least one option must be a distractor' })
  }
  if (
    'policy' in key &&
    key.policy !== undefined &&
    key.policy !== 'per_option' &&
    key.policy !== 'all_or_nothing'
  ) {
    issues.push({ path: 'answer_key.policy', message: 'policy must be per_option or all_or_nothing' })
  }
  if (typeof key.explanation_md !== 'string' || !key.explanation_md.trim()) {
    issues.push({ path: 'answer_key.explanation_md', message: 'an explanation is required' })
  }
  return issues
}

export function validateMultiChoiceResponse(
  config: ChoiceConfig,
  response: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(response)) return [{ path: 'answers', message: 'must be an object' }]
  const optionIds = new Set(config.options.map((o) => o.id))
  for (const [rowId, cells] of Object.entries(response)) {
    if (rowId !== 'answer' || !isRecord(cells)) {
      issues.push({ path: `answers.${rowId}`, message: 'unknown row' })
      continue
    }
    for (const [colId, v] of Object.entries(cells)) {
      if (colId !== 'choices') issues.push({ path: `answers.answer.${colId}`, message: 'unknown column' })
      else if (v !== undefined) {
        if (typeof v !== 'string') {
          issues.push({ path: 'answers.answer.choices', message: 'must be a string' })
        } else if (
          v.split(',').map((s) => s.trim()).filter(Boolean).some((id) => !optionIds.has(id))
        ) {
          issues.push({ path: 'answers.answer.choices', message: 'unknown option' })
        }
      }
    }
  }
  return issues
}

export function validateNumericConfig(config: unknown): ValidationIssue[] {
  const issues = validateStatementConfig(config)
  if (isRecord(config) && Array.isArray(config.rows) && config.rows.length !== 1) {
    issues.push({ path: 'rows', message: 'numeric questions have exactly one answer row' })
  }
  return issues
}

export function validateNumericKey(_config: StatementConfig, key: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(key)) return [{ path: 'answer_key', message: 'must be an object' }]
  if (typeof key.amount !== 'number' || !isFinite(key.amount)) {
    issues.push({ path: 'answer_key.amount', message: 'a correct amount is required' })
  }
  if (
    'tolerance' in key &&
    key.tolerance !== undefined &&
    (typeof key.tolerance !== 'number' || key.tolerance < 0)
  ) {
    issues.push({ path: 'answer_key.tolerance', message: 'tolerance must be a non-negative number' })
  }
  if (typeof key.explanation_md !== 'string' || !key.explanation_md.trim()) {
    issues.push({ path: 'answer_key.explanation_md', message: 'an explanation is required' })
  }
  return issues
}

export function asChoiceConfig(v: unknown): ChoiceConfig {
  return v as ChoiceConfig
}
export function asSingleChoiceKey(v: unknown): SingleChoiceKey {
  return v as SingleChoiceKey
}
export function asMultiChoiceKey(v: unknown): MultiChoiceKey {
  return v as MultiChoiceKey
}
export function asNumericKey(v: unknown): NumericKey {
  return v as NumericKey
}

// Convenience for typed callers once validation passed.
export function asMatrixConfig(v: unknown): MatrixConfig {
  return v as MatrixConfig
}
export function asMatrixKey(v: unknown): MatrixAnswerKey {
  return v as MatrixAnswerKey
}
export function asMatrixResponse(v: unknown): MatrixResponse {
  return v as MatrixResponse
}
export function asJournalConfig(v: unknown): JournalConfig {
  return v as JournalConfig
}
export function asJournalKey(v: unknown): JournalAnswerKey {
  return v as JournalAnswerKey
}
