// Question-type registry (PRD §B.7): each kind wires its runner component and
// pure helpers. The practice pages dispatch through this map — adding a kind
// means registering it here, not editing the runner page.
import type { ComponentType } from 'react'
import { MatrixRunner } from '../../components/practice/MatrixRunner'
import { JournalRunner } from '../../components/practice/JournalRunner'
import { StatementRunner } from '../../components/practice/StatementRunner'
import {
  countAnswered,
  totalCells,
  type MatrixConfig,
  type MatrixResponse,
} from './scoring.ts'
import {
  validateJournalConfig,
  validateMatrixConfig,
  validateStatementConfig,
} from './validate.ts'

export type RunnerProps = {
  config: any
  response: MatrixResponse
  onChange: (rowId: string, columnId: string, value: string) => void
  disabled: boolean
}

export type KindDefinition = {
  label: string
  Runner: ComponentType<RunnerProps>
  // Returns a typed config if valid, null otherwise.
  parseConfig: (raw: unknown) => any | null
  countAnswered: (config: any, response: MatrixResponse) => number
  totalCells: (config: any) => number
  // Drop stale draft selections that no longer exist in the config.
  sanitize: (config: any, response: MatrixResponse) => MatrixResponse
}

function sanitizeSelects(
  config: MatrixConfig,
  response: MatrixResponse,
  freeTextColumns: string[] = [],
): MatrixResponse {
  const optionIds = new Set(config.options.map((o) => o.id))
  const colIds = new Set(config.columns.map((c) => c.id))
  const out: MatrixResponse = {}
  for (const row of config.rows) {
    const cells = response?.[row.id]
    if (!cells) continue
    for (const [colId, value] of Object.entries(cells)) {
      if (!colIds.has(colId) || typeof value !== 'string') continue
      if (freeTextColumns.includes(colId) || optionIds.has(value)) {
        ;(out[row.id] ??= {})[colId] = value
      }
    }
  }
  return out
}

export const questionKinds: Record<string, KindDefinition> = {
  matrix_select: {
    label: 'Matrix (dropdown table)',
    Runner: MatrixRunner,
    parseConfig: (raw) => (validateMatrixConfig(raw).length === 0 ? raw : null),
    countAnswered,
    totalCells,
    sanitize: (config, response) => sanitizeSelects(config, response),
  },
  journal_entry: {
    label: 'Journal entries (FS preparation)',
    Runner: JournalRunner,
    parseConfig: (raw) => (validateJournalConfig(raw).length === 0 ? raw : null),
    countAnswered,
    totalCells,
    sanitize: (config, response) => sanitizeSelects(config, response, ['amount']),
  },
  statement_prep: {
    label: 'Statement construction',
    Runner: StatementRunner,
    parseConfig: (raw) => (validateStatementConfig(raw).length === 0 ? raw : null),
    countAnswered,
    totalCells,
    sanitize: (config, response) => sanitizeSelects(config, response, ['amount']),
  },
}
