// limited-company-v1 — deterministic seeded case generator (PRD §9.2).
//
// SERVER-ONLY, like the sole-trader generator: never import from src/.
// The company case adds the Family-2 transition skills: loan interest accrual,
// the income-tax provision, and dividends as a distribution (never an expense).
// Constructive generation (retained earnings b/f is the TB balancing figure,
// proven algebraically so the SOFP balances by construction) plus a full
// invariant assertion pass per §11.4.

export const LTD_TEMPLATE = 'limited-company-v1'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function pickInt(r: () => number, min: number, max: number, step: number): number {
  const steps = Math.floor((max - min) / step)
  return min + Math.floor(r() * (steps + 1)) * step
}
function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length) % list.length]
}

const ENTITIES = [
  'Ashgrove Ltd', 'Bellmont Trading Ltd', 'Cinderpath Ltd', 'Dovewell Supplies Ltd',
  'Elmsworth Ltd', 'Farrowgate Ltd', 'Glassmere Ltd', 'Hollowbrook Ltd',
  'Inglenook Retail Ltd', 'Jorvik Traders Ltd',
]
const YEARS = ['20X5', '20X6', '20X7', '20X8', '20X9']

export type LtdFacts = {
  entity: string
  year: string
  shareCapital: number
  sharePremium: number
  retainedBf: number
  loanNotes: number
  loanRatePct: number
  interestFull: number
  interestPaid: number
  interestAccrual: number
  taxCharge: number
  dividends: number
  sales: number
  purchases: number
  openingInventory: number
  closingInventory: number
  admin: number
  distribution: number
  receivables: number
  payables: number
  bank: number
  plantCost: number
  depRatePct: number
  depCharge: number
  accDepBf: number
}

export function ltdTruthModel(f: LtdFacts) {
  const costOfSales = f.openingInventory + f.purchases - f.closingInventory
  const grossProfit = f.sales - costOfSales
  const operatingProfit = grossProfit - f.admin - f.distribution - f.depCharge
  const profitBeforeTax = operatingProfit - f.interestFull
  const profit = profitBeforeTax - f.taxCharge
  const retainedCf = f.retainedBf + profit - f.dividends
  const accDep = f.accDepBf + f.depCharge
  const carrying = f.plantCost - accDep
  const totalCurrent = f.closingInventory + f.receivables + f.bank
  const totalAssets = carrying + totalCurrent
  const totalEquity = f.shareCapital + f.sharePremium + retainedCf
  const totalLiabilities = f.payables + f.loanNotes + f.interestAccrual + f.taxCharge
  const totalEqLiab = totalEquity + totalLiabilities
  return {
    costOfSales, grossProfit, operatingProfit, profitBeforeTax, profit, retainedCf,
    accDep, carrying, totalCurrent, totalAssets, totalEquity, totalLiabilities, totalEqLiab,
  }
}

export function assertLtdInvariants(f: LtdFacts): void {
  const t = ltdTruthModel(f)
  const fail = (msg: string) => {
    throw new Error(`invariant failed [${f.entity} ${f.year}]: ${msg}`)
  }
  const dr =
    f.purchases + f.openingInventory + f.admin + f.distribution + f.receivables +
    f.plantCost + f.dividends + f.interestPaid + f.bank
  const cr =
    f.sales + f.payables + f.shareCapital + f.sharePremium + f.retainedBf +
    f.accDepBf + f.loanNotes
  if (dr !== cr) fail('trial balance does not balance')
  if (f.interestFull !== (f.loanNotes * f.loanRatePct) / 100) fail('interest derivation')
  if (f.interestAccrual !== f.interestFull - f.interestPaid) fail('interest accrual derivation')
  if (f.depCharge !== (f.plantCost * f.depRatePct) / 100) fail('depreciation derivation')
  if (t.profit !== t.profitBeforeTax - f.taxCharge) fail('profit arithmetic')
  if (t.retainedCf !== f.retainedBf + t.profit - f.dividends) fail('retained earnings reconciliation')
  if (t.totalEqLiab !== t.totalAssets) fail('SOFP does not balance')
  if (t.carrying <= 0) fail('carrying amount not positive')
  if (t.profit < 3000) fail('profit too small')
  if (t.retainedCf < 1000) fail('retained earnings c/f too small')
  const values = [
    f.shareCapital, f.sharePremium, f.retainedBf, f.loanNotes, f.taxCharge,
    f.dividends, f.sales, f.purchases, f.openingInventory, f.closingInventory,
    f.admin, f.distribution, f.receivables, f.payables, f.bank, f.plantCost, f.accDepBf,
  ]
  if (values.some((v) => !Number.isInteger(v) || v <= 0)) fail('non-positive or fractional value')
}

function sample(seed: number, attempt: number): LtdFacts | null {
  const r = mulberry32((seed ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0)
  const entity = pick(r, ENTITIES)
  const year = pick(r, YEARS)

  const shareCapital = pickInt(r, 20000, 50000, 1000)
  const sharePremium = pickInt(r, 2000, 10000, 500)
  const retainedBf = pickInt(r, 5000, 25000, 100)
  const loanNotes = pickInt(r, 10000, 20000, 1000)
  const loanRatePct = pick(r, [6, 8, 10])
  const interestFull = (loanNotes * loanRatePct) / 100
  const interestPaid = interestFull / 2 // half-year paid; the rest accrues
  const interestAccrual = interestFull - interestPaid

  const plantCost = pickInt(r, 30000, 60000, 1000)
  const depRatePct = pick(r, [10, 20])
  const depCharge = (plantCost * depRatePct) / 100
  const accDepBf = pickInt(r, 3000, Math.floor((plantCost * 0.4) / 100) * 100, 100)
  if (accDepBf + depCharge >= plantCost * 0.8) return null

  const openingInventory = pickInt(r, 8000, 20000, 100)
  const closingInventory = pickInt(r, 8000, 22000, 100)
  if (closingInventory === openingInventory) return null
  const admin = pickInt(r, 15000, 30000, 100)
  const distribution = pickInt(r, 8000, 20000, 100)
  const receivables = pickInt(r, 12000, 25000, 100)
  const payables = pickInt(r, 8000, 18000, 100)
  const taxCharge = pickInt(r, 3000, 9000, 100)
  const dividends = pickInt(r, 2000, 8000, 100)
  const bank = pickInt(r, 1000, 9000, 100)

  // Sales and purchases are derived so the trial balance holds exactly:
  // TB identity: purchases + K + bank = sales + C, with a chosen gross-margin
  // ratio purchases ≈ m·sales. Solving gives sales, then purchases absorbs the
  // rounding, keeping the identity exact to the dollar.
  const K =
    openingInventory + admin + distribution + receivables + plantCost +
    dividends + interestPaid
  const C =
    payables + shareCapital + sharePremium + retainedBf + accDepBf + loanNotes
  const m = pick(r, [0.55, 0.6, 0.65, 0.7])
  const salesRaw = (K + bank - C) / (1 - m)
  if (!isFinite(salesRaw) || salesRaw < 90000 || salesRaw > 400000) return null
  const sales = Math.round(salesRaw / 100) * 100
  const purchases = sales + C - K - bank
  if (purchases < sales * 0.45 || purchases > sales * 0.78) return null

  const f: LtdFacts = {
    entity, year, shareCapital, sharePremium, retainedBf, loanNotes, loanRatePct,
    interestFull, interestPaid, interestAccrual, taxCharge, dividends, sales,
    purchases, openingInventory, closingInventory, admin, distribution,
    receivables, payables, bank, plantCost, depRatePct, depCharge, accDepBf,
  }
  const t = ltdTruthModel(f)
  if (t.profit < 3000 || t.retainedCf < 1000 || t.carrying <= 0) return null
  return f
}

const fmt = (n: number) => n.toLocaleString('en-US')

function scenarioMd(f: LtdFacts): string {
  return [
    `### ${f.entity} — trial balance as at 31 December ${f.year}`,
    '',
    '| | Dr $ | Cr $ |',
    '|---|---:|---:|',
    `| Sales | | ${fmt(f.sales)} |`,
    `| Purchases | ${fmt(f.purchases)} | |`,
    `| Inventories at 1 January ${f.year} | ${fmt(f.openingInventory)} | |`,
    `| Administrative expenses | ${fmt(f.admin)} | |`,
    `| Distribution costs | ${fmt(f.distribution)} | |`,
    `| Plant and equipment at cost | ${fmt(f.plantCost)} | |`,
    `| Accumulated depreciation at 1 January ${f.year} | | ${fmt(f.accDepBf)} |`,
    `| Trade receivables | ${fmt(f.receivables)} | |`,
    `| Trade payables | | ${fmt(f.payables)} |`,
    `| Bank | ${fmt(f.bank)} | |`,
    `| ${f.loanRatePct}% loan notes (repayable ${Number(f.year.slice(-1)) + 4 > 9 ? '20Y' : '20X'}${(Number(f.year.slice(-1)) + 4) % 10}) | | ${fmt(f.loanNotes)} |`,
    `| Loan interest paid | ${fmt(f.interestPaid)} | |`,
    `| Ordinary share capital ($1 shares) | | ${fmt(f.shareCapital)} |`,
    `| Share premium | | ${fmt(f.sharePremium)} |`,
    `| Retained earnings at 1 January ${f.year} | | ${fmt(f.retainedBf)} |`,
    `| Dividends paid | ${fmt(f.dividends)} | |`,
    '',
    'The following information is also available:',
    '',
    `1. Closing inventories, valued at cost, amount to $${fmt(f.closingInventory)}.`,
    `2. Plant and equipment is depreciated at ${f.depRatePct}% per annum on cost (charge to operating expenses).`,
    `3. The loan notes were in issue for the whole year; only six months' interest has been paid.`,
    `4. Income tax for the year is estimated at $${fmt(f.taxCharge)}.`,
    `5. The dividends paid during the year must be dealt with correctly — they are a distribution, not an expense.`,
  ].join('\n')
}

const JOURNAL_COLUMNS = [
  { id: 'debit', label: 'Debit account' },
  { id: 'credit', label: 'Credit account' },
  { id: 'amount', label: 'Amount ($)' },
]
const AMOUNT_COLUMNS = [{ id: 'amount', label: 'Amount ($)' }]
const LTD_OPTIONS = [
  { id: 'inventories', label: 'Inventories (SOFP)' },
  { id: 'is-cos', label: 'Income statement — cost of sales (closing inventory)' },
  { id: 'dep-exp', label: 'Depreciation expense' },
  { id: 'acc-dep', label: 'Accumulated depreciation' },
  { id: 'finance-costs', label: 'Finance costs' },
  { id: 'interest-accrual', label: 'Interest accrual (liability)' },
  { id: 'tax-expense', label: 'Income tax expense' },
  { id: 'tax-payable', label: 'Income tax payable (liability)' },
  { id: 'retained', label: 'Retained earnings' },
  { id: 'dividends-paid', label: 'Dividends paid' },
  { id: 'bank', label: 'Bank' },
  { id: 'share-capital', label: 'Ordinary share capital' },
  { id: 'share-premium', label: 'Share premium' },
  { id: 'admin', label: 'Administrative expenses' },
]

const REPAIR_ADJUSTMENTS = 'a1d0e5ef-70d1-4a11-8a10-000000000002' // Activity 2
const REPAIR_CLASSIFY = 'a1d0e5ef-70d1-4a11-8a10-000000000003' // Activity 3

const LTD_SKILLS = [
  {
    id: 'closing-inventory', label: 'Closing inventory', repair_item_id: REPAIR_ADJUSTMENTS,
    root: [{ stage: 0, rows: ['closing-inv'] }],
    downstream: [
      { stage: 1, rows: ['closing-inventory', 'cost-of-sales', 'gross-profit', 'operating-profit', 'profit-before-tax', 'profit'] },
      { stage: 2, rows: ['inventories', 'retained-cf', 'total-equity', 'total-current', 'total-assets', 'total-eq-liab'] },
    ],
  },
  {
    id: 'depreciation', label: 'Depreciation', repair_item_id: REPAIR_ADJUSTMENTS,
    root: [{ stage: 0, rows: ['depreciation'] }],
    downstream: [
      { stage: 1, rows: ['depreciation', 'operating-profit', 'profit-before-tax', 'profit'] },
      { stage: 2, rows: ['acc-dep', 'carrying', 'retained-cf', 'total-equity', 'total-assets', 'total-eq-liab'] },
    ],
  },
  {
    id: 'loan-interest', label: 'Loan interest accrual', repair_item_id: REPAIR_ADJUSTMENTS,
    root: [{ stage: 0, rows: ['interest'] }],
    downstream: [
      { stage: 1, rows: ['finance-costs', 'profit-before-tax', 'profit'] },
      { stage: 2, rows: ['interest-accrual', 'retained-cf', 'total-equity', 'total-liabilities', 'total-eq-liab'] },
    ],
  },
  {
    id: 'tax-provision', label: 'Income tax provision', repair_item_id: REPAIR_ADJUSTMENTS,
    root: [{ stage: 0, rows: ['tax'] }],
    downstream: [
      { stage: 1, rows: ['tax', 'profit'] },
      { stage: 2, rows: ['tax-payable', 'retained-cf', 'total-equity', 'total-liabilities', 'total-eq-liab'] },
    ],
  },
  {
    id: 'dividends', label: 'Dividends (distribution, not expense)', repair_item_id: REPAIR_CLASSIFY,
    root: [{ stage: 0, rows: ['dividends'] }],
    downstream: [{ stage: 2, rows: ['retained-cf', 'total-equity', 'total-eq-liab'] }],
  },
]

export function generateLimitedCompanyCase(seed: number) {
  let facts: LtdFacts | null = null
  for (let attempt = 0; attempt < 60 && !facts; attempt++) {
    facts = sample(seed, attempt)
  }
  if (!facts) throw new Error(`no valid limited-company case for seed ${seed}`)
  assertLtdInvariants(facts)
  const f = facts
  const t = ltdTruthModel(f)
  const scenario = scenarioMd(f)
  const x = (amount: number, explanation: string) => ({ amount, explanation_md: explanation })

  const stages = [
    {
      title: 'Stage 1 — Adjusting journal entries',
      kind: 'journal_entry',
      prompt_md: 'Prepare the journal entry for each year-end item (notes 1–5).',
      config: {
        scenario_md: scenario,
        columns: JOURNAL_COLUMNS,
        rows: [
          { id: 'closing-inv', label: '(1) Recognise closing inventories' },
          { id: 'depreciation', label: '(2) Depreciation on plant for the year' },
          { id: 'interest', label: '(3) Accrue the unpaid loan interest' },
          { id: 'tax', label: '(4) Provide for income tax on the profit' },
          { id: 'dividends', label: '(5) Transfer dividends paid to retained earnings' },
        ],
        options: LTD_OPTIONS,
      },
    },
    {
      title: 'Stage 2 — Statement of profit or loss',
      kind: 'statement_prep',
      prompt_md: `Complete the statement of profit or loss for the year ended 31 December ${f.year}. Enter all amounts as positive numbers.`,
      config: {
        scenario_md: scenario,
        columns: AMOUNT_COLUMNS,
        rows: [
          { id: 'revenue', label: 'Revenue' },
          { id: 'opening-inventory', label: 'Opening inventory', indent: 1 },
          { id: 'purchases', label: 'Purchases', indent: 1 },
          { id: 'closing-inventory', label: 'Less: closing inventory', indent: 1 },
          { id: 'cost-of-sales', label: 'Cost of sales', style: 'subtotal' },
          { id: 'gross-profit', label: 'Gross profit', style: 'subtotal' },
          { id: 'admin', label: 'Administrative expenses', indent: 1 },
          { id: 'distribution', label: 'Distribution costs', indent: 1 },
          { id: 'depreciation', label: 'Depreciation', indent: 1 },
          { id: 'operating-profit', label: 'Operating profit', style: 'subtotal' },
          { id: 'finance-costs', label: 'Finance costs', indent: 1 },
          { id: 'profit-before-tax', label: 'Profit before tax', style: 'subtotal' },
          { id: 'tax', label: 'Income tax expense', indent: 1 },
          { id: 'profit', label: 'Profit for the year', style: 'total' },
        ],
        options: [],
      },
    },
    {
      title: 'Stage 3 — Statement of financial position',
      kind: 'statement_prep',
      prompt_md: `Complete the statement of financial position as at 31 December ${f.year}. It must balance.`,
      config: {
        scenario_md: `Use the ${f.entity} trial balance and your adjustments together with your profit for the year. Remember: loan notes are a non-current liability; dividends reduce retained earnings.`,
        columns: AMOUNT_COLUMNS,
        rows: [
          { id: 'plant-cost', label: 'Plant and equipment at cost' },
          { id: 'acc-dep', label: 'Less: accumulated depreciation', indent: 1 },
          { id: 'carrying', label: 'Carrying amount', style: 'subtotal' },
          { id: 'inventories', label: 'Inventories', indent: 1 },
          { id: 'receivables', label: 'Trade receivables', indent: 1 },
          { id: 'bank', label: 'Bank', indent: 1 },
          { id: 'total-current', label: 'Total current assets', style: 'subtotal' },
          { id: 'total-assets', label: 'Total assets', style: 'total' },
          { id: 'share-capital', label: 'Ordinary share capital' },
          { id: 'share-premium', label: 'Share premium', indent: 1 },
          { id: 'retained-cf', label: 'Retained earnings', indent: 1 },
          { id: 'total-equity', label: 'Total equity', style: 'subtotal' },
          { id: 'loan-notes', label: `${f.loanRatePct}% loan notes (non-current)`, indent: 1 },
          { id: 'payables', label: 'Trade payables', indent: 1 },
          { id: 'interest-accrual', label: 'Interest accrual', indent: 1 },
          { id: 'tax-payable', label: 'Income tax payable', indent: 1 },
          { id: 'total-liabilities', label: 'Total liabilities', style: 'subtotal' },
          { id: 'total-eq-liab', label: 'Equity and liabilities', style: 'total' },
        ],
        options: [],
      },
    },
  ]

  const keys = [
    {
      rows: {
        'closing-inv': {
          debit: 'inventories', credit: 'is-cos', amount: f.closingInventory,
          explanation_md: 'Unsold goods are an asset; the credit reduces cost of sales.',
        },
        depreciation: {
          debit: 'dep-exp', credit: 'acc-dep', amount: f.depCharge,
          explanation_md: `${f.depRatePct}% × cost $${fmt(f.plantCost)} = **$${fmt(f.depCharge)}**.`,
        },
        interest: {
          debit: 'finance-costs', credit: 'interest-accrual', amount: f.interestAccrual,
          explanation_md: `Full-year interest is ${f.loanRatePct}% × $${fmt(f.loanNotes)} = $${fmt(f.interestFull)}; only $${fmt(f.interestPaid)} was paid, so accrue **$${fmt(f.interestAccrual)}**.`,
        },
        tax: {
          debit: 'tax-expense', credit: 'tax-payable', amount: f.taxCharge,
          explanation_md: 'The estimated tax is charged against profit and owed at the year end.',
        },
        dividends: {
          debit: 'retained', credit: 'dividends-paid', amount: f.dividends,
          explanation_md: 'Dividends are a **distribution of profit**, never an expense: they reduce retained earnings directly and never touch the statement of profit or loss.',
        },
      },
    },
    {
      rows: {
        revenue: x(f.sales, 'From the trial balance.'),
        'opening-inventory': x(f.openingInventory, 'From the trial balance.'),
        purchases: x(f.purchases, 'From the trial balance.'),
        'closing-inventory': x(f.closingInventory, 'Note 1.'),
        'cost-of-sales': x(t.costOfSales, `${fmt(f.openingInventory)} + ${fmt(f.purchases)} − ${fmt(f.closingInventory)} = **${fmt(t.costOfSales)}**.`),
        'gross-profit': x(t.grossProfit, `${fmt(f.sales)} − ${fmt(t.costOfSales)} = **${fmt(t.grossProfit)}**.`),
        admin: x(f.admin, 'From the trial balance.'),
        distribution: x(f.distribution, 'From the trial balance.'),
        depreciation: x(f.depCharge, `${f.depRatePct}% × ${fmt(f.plantCost)} (note 2).`),
        'operating-profit': x(t.operatingProfit, 'Gross profit less operating expenses.'),
        'finance-costs': x(f.interestFull, `A full year's interest belongs to this year: paid ${fmt(f.interestPaid)} + accrued ${fmt(f.interestAccrual)} = **${fmt(f.interestFull)}**.`),
        'profit-before-tax': x(t.profitBeforeTax, `${fmt(t.operatingProfit)} − ${fmt(f.interestFull)} = **${fmt(t.profitBeforeTax)}**.`),
        tax: x(f.taxCharge, 'Note 4.'),
        profit: x(t.profit, `${fmt(t.profitBeforeTax)} − ${fmt(f.taxCharge)} = **${fmt(t.profit)}**. Dividends are NOT deducted here.`),
      },
    },
    {
      rows: {
        'plant-cost': x(f.plantCost, 'Cost stays at cost.'),
        'acc-dep': x(t.accDep, `${fmt(f.accDepBf)} b/f + ${fmt(f.depCharge)} this year.`),
        carrying: x(t.carrying, `${fmt(f.plantCost)} − ${fmt(t.accDep)} = **${fmt(t.carrying)}**.`),
        inventories: x(f.closingInventory, 'Closing inventories.'),
        receivables: x(f.receivables, 'From the trial balance.'),
        bank: x(f.bank, 'From the trial balance.'),
        'total-current': x(t.totalCurrent, 'Sum of the three current assets.'),
        'total-assets': x(t.totalAssets, `${fmt(t.carrying)} + ${fmt(t.totalCurrent)} = **${fmt(t.totalAssets)}**.`),
        'share-capital': x(f.shareCapital, 'From the trial balance.'),
        'share-premium': x(f.sharePremium, 'From the trial balance.'),
        'retained-cf': x(t.retainedCf, `${fmt(f.retainedBf)} b/f + ${fmt(t.profit)} profit − ${fmt(f.dividends)} dividends = **${fmt(t.retainedCf)}**.`),
        'total-equity': x(t.totalEquity, 'Share capital + share premium + retained earnings.'),
        'loan-notes': x(f.loanNotes, 'A non-current liability — repayable in several years.'),
        payables: x(f.payables, 'From the trial balance.'),
        'interest-accrual': x(f.interestAccrual, 'The unpaid half-year of loan interest (note 3).'),
        'tax-payable': x(f.taxCharge, 'The tax provision is owed at the year end (note 4).'),
        'total-liabilities': x(t.totalLiabilities, 'Loan notes + payables + interest accrual + tax payable.'),
        'total-eq-liab': x(t.totalEqLiab, `${fmt(t.totalEquity)} + ${fmt(t.totalLiabilities)} = **${fmt(t.totalEqLiab)}** — balances with total assets.`),
      },
    },
  ]

  return {
    template: LTD_TEMPLATE,
    seed,
    title: `${f.entity} — year ended 31 December ${f.year} (generated)`,
    facts: f,
    stages,
    keys,
    config: { skills: LTD_SKILLS, generated: true },
  }
}
