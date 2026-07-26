// Fernleaf Traders golden case — mirrors the seeded production content for
// variant A (20X8) and the altered retest B (20X9). The invariant suite
// (fernleaf-invariants.spec.ts) checks the PRD §11.4 accounting identities
// over these numbers.
import type {
  JournalAnswerKey,
  JournalConfig,
  StatementAnswerKey,
  StatementConfig,
} from '../src/lib/practice/scoring.ts'
import type { SkillDef } from '../src/lib/practice/diagnose.ts'

export type TrialBalanceLine = { name: string; dr?: number; cr?: number }

const JOURNAL_COLUMNS = [
  { id: 'debit', label: 'Debit account' },
  { id: 'credit', label: 'Credit account' },
  { id: 'amount', label: 'Amount ($)' },
]
const JOURNAL_ROWS = [
  { id: 'closing-inv', label: '(1) Recognise closing inventories' },
  { id: 'depreciation', label: '(2) Depreciation on equipment for the year' },
  { id: 'wages-accrual', label: '(3) Wages owing at the year end' },
  { id: 'insurance-prepay', label: '(4) Insurance paid in advance' },
  { id: 'write-off', label: '(5) Write off the irrecoverable debt' },
  { id: 'allowance', label: '(6) Adjust the allowance for receivables' },
]
const JOURNAL_OPTIONS = [
  { id: 'inventories', label: 'Inventories (SOFP)' },
  { id: 'is-cos', label: 'Income statement — cost of sales (closing inventory)' },
  { id: 'dep-exp', label: 'Depreciation expense' },
  { id: 'acc-dep', label: 'Accumulated depreciation' },
  { id: 'wages', label: 'Wages' },
  { id: 'accruals', label: 'Accruals' },
  { id: 'prepayments', label: 'Prepayments' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'irrec-exp', label: 'Irrecoverable debts expense' },
  { id: 'receivables', label: 'Trade receivables' },
  { id: 'allowance', label: 'Allowance for receivables' },
  { id: 'bank', label: 'Bank' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'drawings', label: 'Drawings' },
]
const AMOUNT_COLUMNS = [{ id: 'amount', label: 'Amount ($)' }]
const SPL_ROWS = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'opening-inventory', label: 'Opening inventory', indent: 1 },
  { id: 'purchases', label: 'Purchases', indent: 1 },
  { id: 'closing-inventory', label: 'Less: closing inventory', indent: 1 },
  { id: 'cost-of-sales', label: 'Cost of sales', style: 'subtotal' as const },
  { id: 'gross-profit', label: 'Gross profit', style: 'subtotal' as const },
  { id: 'rent', label: 'Rent', indent: 1 },
  { id: 'insurance', label: 'Insurance', indent: 1 },
  { id: 'wages', label: 'Wages', indent: 1 },
  { id: 'sundry', label: 'Sundry expenses', indent: 1 },
  { id: 'depreciation', label: 'Depreciation', indent: 1 },
  { id: 'irrec', label: 'Irrecoverable debts and allowance', indent: 1 },
  { id: 'total-expenses', label: 'Total expenses', style: 'subtotal' as const },
  { id: 'profit', label: 'Profit for the year', style: 'total' as const },
]
const SOFP_ROWS = [
  { id: 'equip-cost', label: 'Equipment at cost' },
  { id: 'acc-dep', label: 'Less: accumulated depreciation', indent: 1 },
  { id: 'carrying', label: 'Carrying amount', style: 'subtotal' as const },
  { id: 'inventories', label: 'Inventories', indent: 1 },
  { id: 'receivables-net', label: 'Trade receivables (net of allowance)', indent: 1 },
  { id: 'prepayments', label: 'Prepayments', indent: 1 },
  { id: 'bank', label: 'Bank', indent: 1 },
  { id: 'total-current', label: 'Total current assets', style: 'subtotal' as const },
  { id: 'total-assets', label: 'Total assets', style: 'total' as const },
  { id: 'opening-capital', label: 'Capital at 1 January' },
  { id: 'profit', label: 'Profit for the year', indent: 1 },
  { id: 'drawings', label: 'Less: drawings', indent: 1 },
  { id: 'closing-capital', label: 'Closing capital', style: 'subtotal' as const },
  { id: 'payables', label: 'Trade payables', indent: 1 },
  { id: 'accruals', label: 'Accruals', indent: 1 },
  { id: 'total-liabilities', label: 'Total current liabilities', style: 'subtotal' as const },
  { id: 'total-cap-liab', label: 'Capital and liabilities', style: 'total' as const },
]

export type FernleafVariant = {
  tb: {
    capital: number
    drawings: number
    sales: number
    purchases: number
    openingInventory: number
    rent: number
    insurance: number
    wages: number
    sundry: number
    receivables: number
    payables: number
    allowanceBf: number
    bank: number
    equipmentCost: number
    accDepBf: number
  }
  journal: { config: JournalConfig; key: JournalAnswerKey }
  spl: { config: StatementConfig; key: StatementAnswerKey }
  sofp: { config: StatementConfig; key: StatementAnswerKey }
}

function statementKey(amounts: Record<string, number>): StatementAnswerKey {
  return {
    rows: Object.fromEntries(
      Object.entries(amounts).map(([id, amount]) => [id, { amount, explanation_md: 'x' }]),
    ),
  }
}

function journalKey(
  entries: Record<string, { debit: string; credit: string; amount: number }>,
): JournalAnswerKey {
  return {
    rows: Object.fromEntries(
      Object.entries(entries).map(([id, e]) => [id, { ...e, explanation_md: 'x' }]),
    ),
  }
}

export const FERNLEAF_A: FernleafVariant = {
  tb: {
    capital: 12000, drawings: 6200, sales: 84600, purchases: 51400,
    openingInventory: 4900, rent: 4800, insurance: 1800, wages: 9600,
    sundry: 1250, receivables: 7400, payables: 5300, allowanceBf: 280,
    bank: 2930, equipmentCost: 15000, accDepBf: 3100,
  },
  journal: {
    config: { columns: JOURNAL_COLUMNS, rows: JOURNAL_ROWS, options: JOURNAL_OPTIONS },
    key: journalKey({
      'closing-inv': { debit: 'inventories', credit: 'is-cos', amount: 5600 },
      depreciation: { debit: 'dep-exp', credit: 'acc-dep', amount: 1500 },
      'wages-accrual': { debit: 'wages', credit: 'accruals', amount: 400 },
      'insurance-prepay': { debit: 'prepayments', credit: 'insurance', amount: 300 },
      'write-off': { debit: 'irrec-exp', credit: 'receivables', amount: 400 },
      allowance: { debit: 'irrec-exp', credit: 'allowance', amount: 70 },
    }),
  },
  spl: {
    config: { columns: AMOUNT_COLUMNS, rows: SPL_ROWS, options: [] },
    key: statementKey({
      revenue: 84600, 'opening-inventory': 4900, purchases: 51400,
      'closing-inventory': 5600, 'cost-of-sales': 50700, 'gross-profit': 33900,
      rent: 4800, insurance: 1500, wages: 10000, sundry: 1250,
      depreciation: 1500, irrec: 470, 'total-expenses': 19520, profit: 14380,
    }),
  },
  sofp: {
    config: { columns: AMOUNT_COLUMNS, rows: SOFP_ROWS, options: [] },
    key: statementKey({
      'equip-cost': 15000, 'acc-dep': 4600, carrying: 10400, inventories: 5600,
      'receivables-net': 6650, prepayments: 300, bank: 2930, 'total-current': 15480,
      'total-assets': 25880, 'opening-capital': 12000, profit: 14380, drawings: 6200,
      'closing-capital': 20180, payables: 5300, accruals: 400,
      'total-liabilities': 5700, 'total-cap-liab': 25880,
    }),
  },
}

export const FERNLEAF_B: FernleafVariant = {
  tb: {
    capital: 14000, drawings: 7100, sales: 92300, purchases: 56900,
    openingInventory: 5200, rent: 5400, insurance: 2400, wages: 10800,
    sundry: 1430, receivables: 8600, payables: 6100, allowanceBf: 310,
    bank: 1080, equipmentCost: 18000, accDepBf: 4200,
  },
  journal: {
    config: { columns: JOURNAL_COLUMNS, rows: JOURNAL_ROWS, options: JOURNAL_OPTIONS },
    key: journalKey({
      'closing-inv': { debit: 'inventories', credit: 'is-cos', amount: 6100 },
      depreciation: { debit: 'dep-exp', credit: 'acc-dep', amount: 1800 },
      'wages-accrual': { debit: 'wages', credit: 'accruals', amount: 500 },
      'insurance-prepay': { debit: 'prepayments', credit: 'insurance', amount: 400 },
      'write-off': { debit: 'irrec-exp', credit: 'receivables', amount: 600 },
      allowance: { debit: 'irrec-exp', credit: 'allowance', amount: 90 },
    }),
  },
  spl: {
    config: { columns: AMOUNT_COLUMNS, rows: SPL_ROWS, options: [] },
    key: statementKey({
      revenue: 92300, 'opening-inventory': 5200, purchases: 56900,
      'closing-inventory': 6100, 'cost-of-sales': 56000, 'gross-profit': 36300,
      rent: 5400, insurance: 2000, wages: 11300, sundry: 1430,
      depreciation: 1800, irrec: 690, 'total-expenses': 22620, profit: 13680,
    }),
  },
  sofp: {
    config: { columns: AMOUNT_COLUMNS, rows: SOFP_ROWS, options: [] },
    key: statementKey({
      'equip-cost': 18000, 'acc-dep': 6000, carrying: 12000, inventories: 6100,
      'receivables-net': 7600, prepayments: 400, bank: 1080, 'total-current': 15180,
      'total-assets': 27180, 'opening-capital': 14000, profit: 13680, drawings: 7100,
      'closing-capital': 20580, payables: 6100, accruals: 500,
      'total-liabilities': 6600, 'total-cap-liab': 27180,
    }),
  },
}

// Diagnosis map (mirrors the seeded spine config; repair points at Activity 2).
export const REPAIR_ITEM_ID = 'a1d0e5ef-70d1-4a11-8a10-000000000002'
export const FERNLEAF_SKILLS: SkillDef[] = [
  {
    id: 'closing-inventory', label: 'Closing inventory', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['closing-inv'] }],
    downstream: [
      { stage: 1, rows: ['closing-inventory', 'cost-of-sales', 'gross-profit', 'profit'] },
      { stage: 2, rows: ['inventories', 'profit', 'closing-capital', 'total-current', 'total-assets', 'total-cap-liab'] },
    ],
  },
  {
    id: 'depreciation', label: 'Depreciation', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['depreciation'] }],
    downstream: [
      { stage: 1, rows: ['depreciation', 'total-expenses', 'profit'] },
      { stage: 2, rows: ['acc-dep', 'carrying', 'profit', 'closing-capital', 'total-assets', 'total-cap-liab'] },
    ],
  },
  {
    id: 'accrual', label: 'Accruals', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['wages-accrual'] }],
    downstream: [
      { stage: 1, rows: ['wages', 'total-expenses', 'profit'] },
      { stage: 2, rows: ['accruals', 'profit', 'closing-capital', 'total-liabilities', 'total-cap-liab'] },
    ],
  },
  {
    id: 'prepayment', label: 'Prepayments', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['insurance-prepay'] }],
    downstream: [
      { stage: 1, rows: ['insurance', 'total-expenses', 'profit'] },
      { stage: 2, rows: ['prepayments', 'profit', 'closing-capital', 'total-current', 'total-assets', 'total-cap-liab'] },
    ],
  },
  {
    id: 'irrecoverable', label: 'Irrecoverable debts', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['write-off'] }],
    downstream: [
      { stage: 1, rows: ['irrec', 'total-expenses', 'profit'] },
      { stage: 2, rows: ['receivables-net', 'profit', 'closing-capital', 'total-current', 'total-assets', 'total-cap-liab'] },
    ],
  },
  {
    id: 'allowance', label: 'Allowance for receivables', repair_item_id: REPAIR_ITEM_ID,
    root: [{ stage: 0, rows: ['allowance'] }],
    downstream: [
      { stage: 1, rows: ['irrec', 'total-expenses', 'profit'] },
      { stage: 2, rows: ['receivables-net', 'profit', 'closing-capital', 'total-current', 'total-assets', 'total-cap-liab'] },
    ],
  },
]

function makeItem(id: string, kind: string, title: string, config: unknown) {
  return {
    id, kind, title,
    prompt_md: title,
    source_slug: null, paper: 'FFA', syllabus_area: null,
    topic: 'Sole trader accounts preparation', tags: [], difficulty: 'core',
    status: 'published', version: 1, config, created_by: null,
    created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
  }
}

export const SPINE_A_ID = 'a1d0e5ef-70d1-4a11-8a10-0000000000a1'
export const SPINE_B_ID = 'a1d0e5ef-70d1-4a11-8a10-0000000000b1'

// Everything the mock needs to serve the Fernleaf case end to end.
export function fernleafMockData() {
  const items = [
    makeItem('item-fern-a1', 'journal_entry', 'Fernleaf 20X8 — Stage 1: Adjusting journal entries', {
      ...FERNLEAF_A.journal.config,
      scenario_md:
        '### Fernleaf Traders — trial balance as at 31 December 20X8\n\n| | Dr $ | Cr $ |\n|---|---:|---:|\n| Equipment at cost | 15,000 | |\n\n1. Closing inventories, valued at cost, amount to $5,600.',
    }),
    makeItem('item-fern-a2', 'statement_prep', 'Fernleaf 20X8 — Stage 2: Statement of profit or loss', FERNLEAF_A.spl.config),
    makeItem('item-fern-a3', 'statement_prep', 'Fernleaf 20X8 — Stage 3: Statement of financial position', FERNLEAF_A.sofp.config),
  ]
  const answers = [
    { item_id: 'item-fern-a1', version: 1, answer_key: FERNLEAF_A.journal.key, overall_explanation_md: null },
    { item_id: 'item-fern-a2', version: 1, answer_key: FERNLEAF_A.spl.key, overall_explanation_md: null },
    { item_id: 'item-fern-a3', version: 1, answer_key: FERNLEAF_A.sofp.key, overall_explanation_md: null },
  ]
  const spines = [
    {
      id: SPINE_A_ID,
      title: 'Case 1: Fernleaf Traders — year ended 31 December 20X8',
      family: 'sole_trader', description_md: '', paper: 'FFA', status: 'published', version: 1,
      config: { retest_spine_id: SPINE_B_ID, skills: FERNLEAF_SKILLS },
      created_by: null, created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
    },
    {
      id: SPINE_B_ID,
      title: 'Case 1B (altered retest): Fernleaf Traders — year ended 31 December 20X9',
      family: 'sole_trader', description_md: '', paper: 'FFA', status: 'published', version: 1,
      config: { is_retest_variant: true, skills: FERNLEAF_SKILLS },
      created_by: null, created_at: '2026-07-27T00:00:00.000Z', updated_at: '2026-07-27T00:00:00.000Z',
    },
  ]
  const stages = [
    { spine_id: SPINE_A_ID, position: 0, item_id: 'item-fern-a1', title: 'Stage 1 — Adjusting journal entries' },
    { spine_id: SPINE_A_ID, position: 1, item_id: 'item-fern-a2', title: 'Stage 2 — Statement of profit or loss' },
    { spine_id: SPINE_A_ID, position: 2, item_id: 'item-fern-a3', title: 'Stage 3 — Statement of financial position' },
  ]
  return { items, answers, spines, stages }
}
