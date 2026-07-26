// Unit tests for mastery evidence (PRD §12.5) and next-best-action (PRD §17.2).
import { test, expect } from '@playwright/test'
import { computeMastery, type AttemptEvidence, type StageSource } from '../src/lib/practice/mastery'
import { recommendNext } from '../src/lib/practice/recommend'
import type { SkillDef } from '../src/lib/practice/diagnose.ts'
import type { MatrixFeedback } from '../src/lib/practice/scoring.ts'

const SKILLS: SkillDef[] = [
  {
    id: 'closing-inventory', label: 'Closing inventory', repair_item_id: 'repair-1',
    root: [{ stage: 0, rows: ['closing-inv'] }], downstream: [],
  },
  {
    id: 'depreciation', label: 'Depreciation', repair_item_id: 'repair-1',
    root: [{ stage: 0, rows: ['depreciation'] }], downstream: [],
  },
]
const STAGE_MAP: Record<string, StageSource> = {
  'base-journal': { stage: 0, source: 'base' },
  'retest-journal': { stage: 0, source: 'transfer' },
}

function fb(rows: Array<[string, boolean]>): MatrixFeedback {
  return {
    kind: 'journal_entry',
    columns: [],
    option_labels: {},
    rows: rows.map(([row_id, ok]) => ({
      row_id, row_label: row_id, cells: [], row_correct: ok, explanation_md: '',
    })),
    cell_score: 0, cell_max: 1, tx_correct: 0, tx_total: 1,
  }
}
const attempt = (
  itemId: string | null,
  gen: string | null,
  stage: number | null,
  at: string,
  rows: Array<[string, boolean]>,
): AttemptEvidence => ({
  item_id: itemId, generated_case_id: gen, stage_index: stage, created_at: at, feedback: fb(rows),
})

test('mastery: unseen → independent → transfer, and failure demotes to needs_repair', () => {
  // No attempts: unseen.
  expect(computeMastery(SKILLS, [], STAGE_MAP)['closing-inventory'].state).toBe('unseen')

  // Clean base run: independent_success (never transfer from the base case).
  const base = [attempt('base-journal', null, null, '2026-07-01', [['closing-inv', true], ['depreciation', true]])]
  expect(computeMastery(SKILLS, base, STAGE_MAP)['closing-inventory'].state).toBe('independent_success')

  // Clean generated-case run afterwards: transfer_success.
  const withTransfer = [
    ...base,
    attempt(null, 'gen-1', 0, '2026-07-02', [['closing-inv', true], ['depreciation', false]]),
  ]
  const m = computeMastery(SKILLS, withTransfer, STAGE_MAP)
  expect(m['closing-inventory'].state).toBe('transfer_success')
  // Depreciation failed on the LATEST evidence → needs_repair even though the
  // base run was clean.
  expect(m['depreciation'].state).toBe('needs_repair')

  // The authored retest also counts as a transfer source.
  const retest = [attempt('retest-journal', null, null, '2026-07-03', [['depreciation', true]])]
  expect(computeMastery(SKILLS, [...withTransfer, ...retest], STAGE_MAP)['depreciation'].state).toBe(
    'transfer_success',
  )
})

test('a repeated identical base run never yields transfer_success', () => {
  const attempts = [
    attempt('base-journal', null, null, '2026-07-01', [['closing-inv', true]]),
    attempt('base-journal', null, null, '2026-07-02', [['closing-inv', true]]),
    attempt('base-journal', null, null, '2026-07-03', [['closing-inv', true]]),
  ]
  expect(computeMastery(SKILLS, attempts, STAGE_MAP)['closing-inventory'].state).toBe(
    'independent_success',
  )
})

test('recommendation priority: repair > retest > errors > reviews > case > mock', () => {
  const baseInput = {
    skills: SKILLS,
    mastery: {
      'closing-inventory': { state: 'transfer_success' as const, lastEvidenceAt: null },
      depreciation: { state: 'transfer_success' as const, lastEvidenceAt: null },
    },
    openErrorItemIds: [] as Array<{ item_id: string; count: number; title: string }>,
    dueReviews: [] as Array<{ item_id: string; title: string }>,
    caseAttempted: true,
    baseCaseHref: '/practice/case/spine-a',
  }

  // 1. needs_repair wins over everything.
  expect(
    recommendNext({
      ...baseInput,
      mastery: { ...baseInput.mastery, depreciation: { state: 'needs_repair', lastEvidenceAt: null } },
      openErrorItemIds: [{ item_id: 'x', count: 9, title: 'Drill' }],
    }).href,
  ).toBe('/practice/run/repair-1')

  // 2. independent-but-untransferred → altered case.
  expect(
    recommendNext({
      ...baseInput,
      mastery: { ...baseInput.mastery, depreciation: { state: 'independent_success', lastEvidenceAt: null } },
    }).label,
  ).toContain('altered case')

  // 3. open errors → rerun that drill.
  expect(
    recommendNext({
      ...baseInput,
      openErrorItemIds: [{ item_id: 'drill-9', count: 3, title: 'Books of prime entry' }],
    }).href,
  ).toBe('/practice/run/drill-9')

  // 4. due reviews.
  expect(
    recommendNext({
      ...baseInput,
      dueReviews: [{ item_id: 'rev-1', title: 'Dual effect' }],
    }).href,
  ).toBe('/practice/run/rev-1')

  // 5. case never attempted.
  expect(recommendNext({ ...baseInput, caseAttempted: false }).href).toBe('/practice/case/spine-a')

  // 6. all green → mock.
  expect(recommendNext(baseInput).href).toBe('/practice/mock')
})
