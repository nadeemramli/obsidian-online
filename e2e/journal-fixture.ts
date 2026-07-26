// Test fixture mirroring the seeded Mugg journal_entry activity (Activity 8).
import type { JournalAnswerKey, JournalConfig } from '../src/lib/practice/scoring.ts'

export const MUGG_ID = 'a1d0e5ef-70d1-4a11-8a10-000000000008'

export const MUGG_CONFIG: JournalConfig = {
  scenario_md:
    '### Trial balance as at 31 December 20X7\n\n| | Dr $ | Cr $ |\n|---|---:|---:|\n| Suspense account | 433 | |\n\n1. Closing inventories, valued at cost, amount to $647.',
  columns: [
    { id: 'debit', label: 'Debit account' },
    { id: 'credit', label: 'Credit account' },
    { id: 'amount', label: 'Amount ($)' },
  ],
  rows: [
    { id: 'closing-inv', label: '(1) Recognise closing inventories of $647' },
    { id: 'drawings-wages', label: "(2) Reclassify the owner's monthly drawings charged to wages" },
    { id: 'dep-mv', label: '(3a) Depreciation on motor vehicles (25% on cost)' },
    { id: 'dep-ff', label: '(3b) Depreciation on furniture and fixtures (20% on cost)' },
    { id: 'irrec', label: '(4) Write off irrecoverable debts of $37' },
    { id: 'bank-fix', label: '(5) Correct the $180 receipt credited to the bank account' },
    { id: 'own-use', label: '(6) Goods taken by Mugg for his own use' },
    { id: 'rent-accrual', label: '(7a) Accrue the unpaid rent for the year' },
    { id: 'elec-prepay', label: '(7b) Recognise the electricity prepayment' },
    { id: 'contra', label: '(8) Complete the contra entry recorded only in receivables' },
  ],
  options: [
    { id: 'inventories', label: 'Inventories (SOFP)' },
    { id: 'is-closing', label: 'Income statement — closing inventories (cost of sales)' },
    { id: 'drawings', label: 'Drawings' },
    { id: 'wages', label: 'Wages' },
    { id: 'dep-expense', label: 'Depreciation expense' },
    { id: 'acc-dep-mv', label: 'Accumulated depreciation — motor vehicles' },
    { id: 'acc-dep-ff', label: 'Accumulated depreciation — furniture and fixtures' },
    { id: 'irrec-exp', label: 'Irrecoverable debts expense' },
    { id: 'receivables', label: 'Trade receivables' },
    { id: 'payables', label: 'Trade payables' },
    { id: 'bank', label: 'Bank' },
    { id: 'suspense', label: 'Suspense account' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'rent', label: 'Rent' },
    { id: 'accruals', label: 'Accruals' },
    { id: 'prepayments', label: 'Prepayments' },
    { id: 'electricity', label: 'Electricity' },
    { id: 'sales', label: 'Sales' },
    { id: 'capital', label: 'Capital account' },
  ],
}

export const MUGG_KEY: JournalAnswerKey = {
  rows: {
    'closing-inv': { debit: 'inventories', credit: 'is-closing', amount: 647, explanation_md: 'Closing inventory is an asset.' },
    'drawings-wages': { debit: 'drawings', credit: 'wages', amount: 120, explanation_md: '$10 × 12 = $120.' },
    'dep-mv': { debit: 'dep-expense', credit: 'acc-dep-mv', amount: 435, explanation_md: '25% × 1,740.' },
    'dep-ff': { debit: 'dep-expense', credit: 'acc-dep-ff', amount: 166, explanation_md: '20% × 830.' },
    irrec: { debit: 'irrec-exp', credit: 'receivables', amount: 37, explanation_md: 'Remove the dead asset.' },
    'bank-fix': { debit: 'bank', credit: 'suspense', amount: 360, explanation_md: '2 × 180.' },
    'own-use': { debit: 'drawings', credit: 'purchases', amount: 63, explanation_md: 'At cost.' },
    'rent-accrual': { debit: 'rent', credit: 'accruals', amount: 100, explanation_md: '600 − 500.' },
    'elec-prepay': { debit: 'prepayments', credit: 'electricity', amount: 90, explanation_md: '6/12 × 180.' },
    contra: { debit: 'payables', credit: 'suspense', amount: 73, explanation_md: 'Complete the contra.' },
  },
}

export const MUGG_OVERALL = 'The two suspense credits (360 + 73) clear the $433 balance.'

export const MUGG_CORRECT: Record<string, { debit: string; credit: string; amount: number }> =
  Object.fromEntries(
    Object.entries(MUGG_KEY.rows).map(([id, r]) => [
      id,
      { debit: r.debit, credit: r.credit, amount: r.amount },
    ]),
  )

export const MUGG_ITEM = {
  id: MUGG_ID,
  kind: 'journal_entry',
  title: 'Activity 8: Preparing financial statements — journal entries (Mugg)',
  prompt_md: 'Prepare the journal entries to record items (1)–(8).',
  source_slug: '06-from-trial-balance-to-financial-statements',
  paper: 'FFA',
  syllabus_area: 'F – Preparing basic financial statements',
  topic: 'Financial statement preparation',
  tags: ['ACCA/FFA', 'journal-entries'],
  difficulty: 'stretch',
  status: 'published',
  version: 1,
  config: MUGG_CONFIG,
  created_by: null as string | null,
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T00:00:00.000Z',
}
