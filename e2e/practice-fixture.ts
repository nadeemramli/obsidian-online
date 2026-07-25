// Test fixture mirroring the seeded "Activity 1: Dual effect" learning item
// (same shape as the production seed migration; ids match so deep links agree).
import type { MatrixAnswerKey, MatrixConfig } from '../src/lib/practice/scoring.ts'

export const DUAL_EFFECT_ID = 'a1d0e5ef-70d1-4a11-8a10-000000000001'

export const DUAL_EFFECT_CONFIG: MatrixConfig = {
  note_md: 'When we refer to cash, we are referring to money going in and out of the bank account.',
  columns: [
    { id: 'debit', label: 'Debit' },
    { id: 'credit', label: 'Credit' },
  ],
  rows: [
    { id: 'sales-cash', label: 'Sales for cash' },
    { id: 'sales-credit', label: 'Sales on credit' },
    { id: 'purchase-credit', label: 'Purchase on credit' },
    { id: 'purchase-cash', label: 'Purchase for cash' },
    { id: 'electricity', label: 'Pay electricity bill' },
    { id: 'receive-customer', label: 'Receive cash from a credit customer' },
    { id: 'pay-supplier', label: 'Pay cash to a credit supplier' },
    { id: 'borrow', label: 'Borrow money from the bank' },
  ],
  options: [
    { id: 'bank-increase', label: 'Bank general ledger account — increase asset' },
    { id: 'bank-decrease', label: 'Bank general ledger account — decrease asset' },
    { id: 'bank-decrease-cash', label: 'Bank general ledger account — decrease cash' },
    { id: 'sales-increase', label: 'Sales — increase income' },
    { id: 'purchases-increase', label: 'Purchases — increase expense' },
    { id: 'electricity-increase', label: 'Electricity — increase expense' },
    { id: 'receivables-increase', label: 'Receivables — increase asset' },
    { id: 'receivables-decrease', label: 'Receivables — decrease asset' },
    { id: 'payables-increase', label: 'Payables — increase liability' },
    { id: 'payables-decrease', label: 'Payables — decrease liability' },
    { id: 'loan-increase', label: 'Loan — increase liability' },
  ],
}

export const DUAL_EFFECT_KEY: MatrixAnswerKey = {
  rows: {
    'sales-cash': {
      debit: 'bank-increase',
      credit: 'sales-increase',
      explanation_md: 'Money comes into the bank (debit asset up); sales is income (credit).',
    },
    'sales-credit': {
      debit: 'receivables-increase',
      credit: 'sales-increase',
      explanation_md: 'The customer owes us (debit receivables); sales is income (credit).',
    },
    'purchase-credit': {
      debit: 'purchases-increase',
      credit: 'payables-increase',
      explanation_md: 'Expense up (debit purchases); we owe a supplier (credit payables).',
    },
    'purchase-cash': {
      debit: 'purchases-increase',
      credit: 'bank-decrease',
      explanation_md: 'Expense up (debit purchases); bank asset down (credit).',
    },
    electricity: {
      debit: 'electricity-increase',
      credit: 'bank-decrease',
      explanation_md: 'Expense up (debit electricity); bank asset down (credit).',
    },
    'receive-customer': {
      debit: 'bank-increase',
      credit: 'receivables-decrease',
      explanation_md: 'Bank asset up (debit); receivables asset down (credit).',
    },
    'pay-supplier': {
      debit: 'payables-decrease',
      credit: 'bank-decrease',
      explanation_md: 'Liability down (debit payables); bank asset down (credit).',
    },
    borrow: {
      debit: 'bank-increase',
      credit: 'loan-increase',
      explanation_md: 'Bank asset up (debit); loan liability up (credit).',
    },
  },
}

export const DUAL_EFFECT_OVERALL =
  'Debits record increases in assets and expenses; credits record increases in liabilities, income and capital.'

// rowId -> correct {debit, credit} option ids, for filling forms in tests.
export const CORRECT: Record<string, { debit: string; credit: string }> = Object.fromEntries(
  Object.entries(DUAL_EFFECT_KEY.rows).map(([rowId, r]) => [
    rowId,
    { debit: r.debit as string, credit: r.credit as string },
  ]),
)

export const DUAL_EFFECT_ITEM = {
  id: DUAL_EFFECT_ID,
  kind: 'matrix_select',
  title: 'Activity 1: Dual effect',
  prompt_md:
    'What is the double entry for each of the following? Explain each entry in terms of the general rules.',
  source_slug: '05-ledger-accounts-and-double-entry',
  paper: 'FFA',
  syllabus_area: 'C – The use of double-entry and accounting systems',
  topic: 'Double entry',
  tags: ['ACCA/FFA', 'financial-accounting', 'double-entry', 'dual-effect'],
  difficulty: 'intro',
  status: 'published',
  version: 1,
  config: DUAL_EFFECT_CONFIG,
  created_by: null as string | null,
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T00:00:00.000Z',
}
