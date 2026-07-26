// Runtime validation for matrix_select configuration, answer keys and learner
// submissions. Hand-rolled on purpose: the project has no validation library and
// adding one for three validators would be an unnecessary dependency (CLAUDE.md).
//
// CANONICAL COPY. `supabase/functions/practice-submit/validate.ts` is a byte-for-byte
// copy deployed with the edge function; the unit suite fails if the two drift.

import type {
  JournalAnswerKey,
  JournalConfig,
  MatrixAnswerKey,
  MatrixConfig,
  MatrixResponse,
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
