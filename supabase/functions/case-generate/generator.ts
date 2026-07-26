// sole-trader-v1 — deterministic seeded case generator (PRD §11).
//
// SERVER-ONLY. This module must never be imported from src/: if the generator
// shipped in the client bundle, a learner could recompute the answer key from
// the seed. It lives inside the case-generate edge function and is imported by
// the Node test suite directly (tests are not part of the client bundle).
//
// Design: constructive generation (values sampled so the accounting identities
// hold by construction) followed by a full invariant assertion pass (§11.4).
// Same seed → byte-identical case. No Date.now(), no Math.random().

export const TEMPLATE = 'sole-trader-v1'

// ---------- deterministic PRNG (mulberry32) ----------
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

// Original fictional entities only (PRD §6.4).
const ENTITIES = [
  'Marlowe Supplies', 'Cobalt Trading', 'Juniper Goods', 'Harbourlight Stores',
  'Bracken & Vale', 'Ironquay Traders', 'Saltmarsh Provisions', 'Kestrel Hardware',
  'Alderwick Trading', 'Pemberley Stores', 'Quayside Outfitters', 'Fothergill Supplies',
]
const YEARS = ['20X5', '20X6', '20X7', '20X8', '20X9']

export type SoleTraderFacts = {
  entity: string
  year: string
  capital: number
  drawings: number
  sales: number
  purchases: number
  openingInventory: number
  closingInventory: number
  rent: number
  insurance: number
  insurancePrepaid: number
  premiumSixMonths: number
  wages: number
  wagesOwing: number
  sundry: number
  receivables: number
  writeOff: number
  allowanceBf: number
  allowanceIncrease: number
  payables: number
  bank: number
  equipmentCost: number
  depRatePct: number
  depCharge: number
  accDepBf: number
}

export type GeneratedStage = {
  title: string
  kind: 'journal_entry' | 'statement_prep'
  prompt_md: string
  config: Record<string, unknown>
}

export type GeneratedCase = {
  template: string
  seed: number
  title: string
  facts: SoleTraderFacts
  stages: GeneratedStage[]
  keys: Array<Record<string, unknown>>
  config: Record<string, unknown> // skills map + retest policy
}

// ---------- fact sampling ----------
function sampleFacts(seed: number, attempt: number): SoleTraderFacts | null {
  const r = mulberry32((seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0)

  const entity = pick(r, ENTITIES)
  const year = pick(r, YEARS)

  const equipmentCost = pickInt(r, 10000, 24000, 1000)
  const depRatePct = pick(r, [10, 20])
  const depCharge = (equipmentCost * depRatePct) / 100
  const accDepBf = pickInt(r, 1000, Math.floor((equipmentCost * 0.5) / 100) * 100, 100)
  if (accDepBf + depCharge >= equipmentCost * 0.85) return null

  const sales = pickInt(r, 60000, 120000, 100)
  const purchases = pickInt(r, Math.round(sales * 0.55), Math.round(sales * 0.7), 100)
  const openingInventory = pickInt(r, 3000, 8000, 100)
  const closingInventory = pickInt(r, 3000, 9000, 100)
  if (closingInventory === openingInventory) return null

  const rent = pickInt(r, 3000, 7200, 100)
  const premiumSixMonths = pick(r, [400, 600, 800, 1000])
  const insurancePrepaid = premiumSixMonths / 2 // three of the six months prepaid
  const insurance = insurancePrepaid * 2 + pickInt(r, 800, 2000, 100)
  const wages = pickInt(r, 8000, 14000, 100)
  const wagesOwing = pickInt(r, 200, 800, 100)
  const sundry = pickInt(r, 800, 2000, 10)

  const writeOff = pickInt(r, 200, 800, 100)
  const remaining = pickInt(r, 5000, 9000, 200) // divisible by 20 → 5% is an integer
  const receivables = remaining + writeOff
  const allowanceRequired = remaining / 20
  const allowanceIncrease = pickInt(r, 40, 150, 10)
  const allowanceBf = allowanceRequired - allowanceIncrease
  if (allowanceBf < 50) return null

  const payables = pickInt(r, 4000, 8000, 100)
  const drawings = pickInt(r, 4000, 9000, 100)

  // Bank is the residual that makes the unadjusted TB balance exactly; pick
  // capital so the residual lands in a sensible range.
  const targetBank = pickInt(r, 500, 6000, 10)
  const drSansBank =
    drawings + purchases + openingInventory + rent + insurance + wages + sundry +
    receivables + equipmentCost
  const capital = drSansBank + targetBank - sales - payables - allowanceBf - accDepBf
  if (capital < 2000) return null
  const bank = capital + sales + payables + allowanceBf + accDepBf - drSansBank
  if (bank !== targetBank) return null // arithmetic identity; belt and braces

  // Profitability check: this template always produces a profitable year.
  const costOfSales = openingInventory + purchases - closingInventory
  const grossProfit = sales - costOfSales
  const totalExpenses =
    rent + (insurance - insurancePrepaid) + (wages + wagesOwing) + sundry +
    depCharge + (writeOff + allowanceIncrease)
  const profit = grossProfit - totalExpenses
  if (profit < 2000) return null

  return {
    entity, year, capital, drawings, sales, purchases, openingInventory,
    closingInventory, rent, insurance, insurancePrepaid, premiumSixMonths,
    wages, wagesOwing, sundry, receivables, writeOff, allowanceBf,
    allowanceIncrease, payables, bank, equipmentCost, depRatePct, depCharge,
    accDepBf,
  }
}

// ---------- truth model ----------
export function truthModel(f: SoleTraderFacts) {
  const costOfSales = f.openingInventory + f.purchases - f.closingInventory
  const grossProfit = f.sales - costOfSales
  const insuranceExpense = f.insurance - f.insurancePrepaid
  const wagesExpense = f.wages + f.wagesOwing
  const irrecExpense = f.writeOff + f.allowanceIncrease
  const totalExpenses =
    f.rent + insuranceExpense + wagesExpense + f.sundry + f.depCharge + irrecExpense
  const profit = grossProfit - totalExpenses

  const accDep = f.accDepBf + f.depCharge
  const carrying = f.equipmentCost - accDep
  const remaining = f.receivables - f.writeOff
  const allowance = f.allowanceBf + f.allowanceIncrease
  const receivablesNet = remaining - allowance
  const totalCurrent = f.closingInventory + receivablesNet + f.insurancePrepaid + f.bank
  const totalAssets = carrying + totalCurrent
  const closingCapital = f.capital + profit - f.drawings
  const totalLiabilities = f.payables + f.wagesOwing
  const totalCapLiab = closingCapital + totalLiabilities

  return {
    costOfSales, grossProfit, insuranceExpense, wagesExpense, irrecExpense,
    totalExpenses, profit, accDep, carrying, receivablesNet, totalCurrent,
    totalAssets, closingCapital, totalLiabilities, totalCapLiab,
    allowanceRequired: allowance,
  }
}

// ---------- invariant gate (PRD §11.4) ----------
export function assertInvariants(f: SoleTraderFacts): void {
  const t = truthModel(f)
  const fail = (msg: string) => {
    throw new Error(`invariant failed [seed case ${f.entity} ${f.year}]: ${msg}`)
  }
  const drTotal =
    f.drawings + f.purchases + f.openingInventory + f.rent + f.insurance +
    f.wages + f.sundry + f.receivables + f.bank + f.equipmentCost
  const crTotal = f.capital + f.sales + f.payables + f.allowanceBf + f.accDepBf
  if (drTotal !== crTotal) fail('trial balance does not balance')
  if (t.costOfSales !== f.openingInventory + f.purchases - f.closingInventory)
    fail('cost of sales arithmetic')
  if (t.grossProfit !== f.sales - t.costOfSales) fail('gross profit arithmetic')
  if (t.profit !== t.grossProfit - t.totalExpenses) fail('profit arithmetic')
  if (f.depCharge !== (f.equipmentCost * f.depRatePct) / 100) fail('depreciation derivation')
  if (!Number.isInteger(f.insurancePrepaid)) fail('prepayment not integral')
  if (t.allowanceRequired !== (f.receivables - f.writeOff) / 20)
    fail('allowance is not 5% of remaining receivables')
  if (t.totalAssets !== t.carrying + t.totalCurrent) fail('total assets arithmetic')
  if (t.closingCapital !== f.capital + t.profit - f.drawings)
    fail('closing capital reconciliation')
  if (t.totalCapLiab !== t.totalAssets) fail('accounting equation (SOFP does not balance)')
  if (t.carrying <= 0) fail('carrying amount not positive')
  if (t.receivablesNet <= 0) fail('net receivables not positive')
  if (t.profit <= 0) fail('profit not positive')
  const values = [
    f.capital, f.drawings, f.sales, f.purchases, f.openingInventory,
    f.closingInventory, f.rent, f.insurance, f.wages, f.sundry, f.receivables,
    f.payables, f.allowanceBf, f.bank, f.equipmentCost, f.accDepBf,
  ]
  if (values.some((v) => !Number.isInteger(v) || v <= 0)) fail('non-positive or fractional TB value')
}

// ---------- rendering ----------
const fmt = (n: number) => n.toLocaleString('en-US')

function scenarioMd(f: SoleTraderFacts): string {
  return [
    `### ${f.entity} — trial balance as at 31 December ${f.year}`,
    '',
    '| | Dr $ | Cr $ |',
    '|---|---:|---:|',
    `| Capital at 1 January ${f.year} | | ${fmt(f.capital)} |`,
    `| Drawings | ${fmt(f.drawings)} | |`,
    `| Sales | | ${fmt(f.sales)} |`,
    `| Purchases | ${fmt(f.purchases)} | |`,
    `| Inventories at 1 January ${f.year} | ${fmt(f.openingInventory)} | |`,
    `| Rent | ${fmt(f.rent)} | |`,
    `| Insurance | ${fmt(f.insurance)} | |`,
    `| Wages | ${fmt(f.wages)} | |`,
    `| Sundry expenses | ${fmt(f.sundry)} | |`,
    `| Trade receivables | ${fmt(f.receivables)} | |`,
    `| Trade payables | | ${fmt(f.payables)} |`,
    `| Allowance for receivables at 1 January ${f.year} | | ${fmt(f.allowanceBf)} |`,
    `| Bank | ${fmt(f.bank)} | |`,
    `| Equipment at cost | ${fmt(f.equipmentCost)} | |`,
    `| Accumulated depreciation at 1 January ${f.year} | | ${fmt(f.accDepBf)} |`,
    '',
    'The following information is also available:',
    '',
    `1. Closing inventories, valued at cost, amount to $${fmt(f.closingInventory)}.`,
    `2. Equipment is depreciated at ${f.depRatePct}% per annum on cost.`,
    `3. Wages of $${fmt(f.wagesOwing)} were owing at 31 December ${f.year}.`,
    `4. Insurance includes $${fmt(f.premiumSixMonths)} paid for a six-month period of which three months fall after the year end.`,
    `5. A debt of $${fmt(f.writeOff)} is irrecoverable and is to be written off.`,
    '6. The allowance for receivables is to be adjusted to 5% of remaining receivables.',
  ].join('\n')
}

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

const REPAIR_ITEM_ID = 'a1d0e5ef-70d1-4a11-8a10-000000000002'
const SKILLS = [
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

export function generateSoleTraderCase(seed: number): GeneratedCase {
  let facts: SoleTraderFacts | null = null
  for (let attempt = 0; attempt < 40 && !facts; attempt++) {
    facts = sampleFacts(seed, attempt)
  }
  if (!facts) throw new Error(`no valid case found for seed ${seed}`)
  assertInvariants(facts)
  const f = facts
  const t = truthModel(f)
  const scenario = scenarioMd(f)

  const stages: GeneratedStage[] = [
    {
      title: 'Stage 1 — Adjusting journal entries',
      kind: 'journal_entry',
      prompt_md: 'Prepare the journal entry for each reporting-date adjustment (notes 1–6).',
      config: {
        scenario_md: scenario,
        columns: JOURNAL_COLUMNS,
        rows: JOURNAL_ROWS,
        options: JOURNAL_OPTIONS,
      },
    },
    {
      title: 'Stage 2 — Statement of profit or loss',
      kind: 'statement_prep',
      prompt_md: `Using the trial balance and your adjustments, complete the statement of profit or loss for the year ended 31 December ${f.year}. Enter all amounts as positive numbers.`,
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
          { id: 'rent', label: 'Rent', indent: 1 },
          { id: 'insurance', label: 'Insurance', indent: 1 },
          { id: 'wages', label: 'Wages', indent: 1 },
          { id: 'sundry', label: 'Sundry expenses', indent: 1 },
          { id: 'depreciation', label: 'Depreciation', indent: 1 },
          { id: 'irrec', label: 'Irrecoverable debts and allowance', indent: 1 },
          { id: 'total-expenses', label: 'Total expenses', style: 'subtotal' },
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
        scenario_md: `Use the ${f.entity} trial balance and your adjustments together with your profit for the year.`,
        columns: AMOUNT_COLUMNS,
        rows: [
          { id: 'equip-cost', label: 'Equipment at cost' },
          { id: 'acc-dep', label: 'Less: accumulated depreciation', indent: 1 },
          { id: 'carrying', label: 'Carrying amount', style: 'subtotal' },
          { id: 'inventories', label: 'Inventories', indent: 1 },
          { id: 'receivables-net', label: 'Trade receivables (net of allowance)', indent: 1 },
          { id: 'prepayments', label: 'Prepayments', indent: 1 },
          { id: 'bank', label: 'Bank', indent: 1 },
          { id: 'total-current', label: 'Total current assets', style: 'subtotal' },
          { id: 'total-assets', label: 'Total assets', style: 'total' },
          { id: 'opening-capital', label: `Capital at 1 January ${f.year}` },
          { id: 'profit', label: 'Profit for the year', indent: 1 },
          { id: 'drawings', label: 'Less: drawings', indent: 1 },
          { id: 'closing-capital', label: 'Closing capital', style: 'subtotal' },
          { id: 'payables', label: 'Trade payables', indent: 1 },
          { id: 'accruals', label: 'Accruals', indent: 1 },
          { id: 'total-liabilities', label: 'Total current liabilities', style: 'subtotal' },
          { id: 'total-cap-liab', label: 'Capital and liabilities', style: 'total' },
        ],
        options: [],
      },
    },
  ]

  const x = (amount: number, explanation: string) => ({ amount, explanation_md: explanation })
  const keys: Array<Record<string, unknown>> = [
    {
      rows: {
        'closing-inv': {
          debit: 'inventories', credit: 'is-cos', amount: f.closingInventory,
          explanation_md: 'Unsold goods are an asset at the year end; the credit reduces cost of sales.',
        },
        depreciation: {
          debit: 'dep-exp', credit: 'acc-dep', amount: f.depCharge,
          explanation_md: `${f.depRatePct}% × cost $${fmt(f.equipmentCost)} = **$${fmt(f.depCharge)}**.`,
        },
        'wages-accrual': {
          debit: 'wages', credit: 'accruals', amount: f.wagesOwing,
          explanation_md: 'The amount owed belongs to this year: debit Wages, credit Accruals.',
        },
        'insurance-prepay': {
          debit: 'prepayments', credit: 'insurance', amount: f.insurancePrepaid,
          explanation_md: `Three of the six covered months fall after the year end: 3/6 × $${fmt(f.premiumSixMonths)} = **$${fmt(f.insurancePrepaid)}**.`,
        },
        'write-off': {
          debit: 'irrec-exp', credit: 'receivables', amount: f.writeOff,
          explanation_md: 'The dead debt leaves receivables entirely.',
        },
        allowance: {
          debit: 'irrec-exp', credit: 'allowance', amount: f.allowanceIncrease,
          explanation_md: `Remaining receivables $${fmt(f.receivables - f.writeOff)} × 5% = $${fmt(t.allowanceRequired)}; held $${fmt(f.allowanceBf)} → increase **$${fmt(f.allowanceIncrease)}**.`,
        },
      },
    },
    {
      rows: {
        revenue: x(f.sales, 'Sales from the trial balance.'),
        'opening-inventory': x(f.openingInventory, 'From the trial balance.'),
        purchases: x(f.purchases, 'From the trial balance.'),
        'closing-inventory': x(f.closingInventory, 'Note 1 — deducted in cost of sales.'),
        'cost-of-sales': x(t.costOfSales, `${fmt(f.openingInventory)} + ${fmt(f.purchases)} − ${fmt(f.closingInventory)} = **${fmt(t.costOfSales)}**.`),
        'gross-profit': x(t.grossProfit, `${fmt(f.sales)} − ${fmt(t.costOfSales)} = **${fmt(t.grossProfit)}**.`),
        rent: x(f.rent, 'No adjustment.'),
        insurance: x(t.insuranceExpense, `${fmt(f.insurance)} − ${fmt(f.insurancePrepaid)} prepaid = **${fmt(t.insuranceExpense)}**.`),
        wages: x(t.wagesExpense, `${fmt(f.wages)} + ${fmt(f.wagesOwing)} accrued = **${fmt(t.wagesExpense)}**.`),
        sundry: x(f.sundry, 'No adjustment.'),
        depreciation: x(f.depCharge, `${f.depRatePct}% × ${fmt(f.equipmentCost)}.`),
        irrec: x(t.irrecExpense, `${fmt(f.writeOff)} written off + ${fmt(f.allowanceIncrease)} allowance increase.`),
        'total-expenses': x(t.totalExpenses, 'Sum of the six expense lines.'),
        profit: x(t.profit, `${fmt(t.grossProfit)} − ${fmt(t.totalExpenses)} = **${fmt(t.profit)}**.`),
      },
    },
    {
      rows: {
        'equip-cost': x(f.equipmentCost, 'Cost stays at cost.'),
        'acc-dep': x(t.accDep, `${fmt(f.accDepBf)} b/f + ${fmt(f.depCharge)} this year.`),
        carrying: x(t.carrying, `${fmt(f.equipmentCost)} − ${fmt(t.accDep)} = **${fmt(t.carrying)}**.`),
        inventories: x(f.closingInventory, 'Closing inventories at cost.'),
        'receivables-net': x(t.receivablesNet, `${fmt(f.receivables)} − ${fmt(f.writeOff)} written off − ${fmt(t.allowanceRequired)} allowance = **${fmt(t.receivablesNet)}**.`),
        prepayments: x(f.insurancePrepaid, 'Insurance paid in advance.'),
        bank: x(f.bank, 'From the trial balance.'),
        'total-current': x(t.totalCurrent, 'Sum of the four current assets.'),
        'total-assets': x(t.totalAssets, `${fmt(t.carrying)} + ${fmt(t.totalCurrent)} = **${fmt(t.totalAssets)}**.`),
        'opening-capital': x(f.capital, 'From the trial balance.'),
        profit: x(t.profit, 'From your statement of profit or loss.'),
        drawings: x(f.drawings, 'Drawings reduce capital — never an expense.'),
        'closing-capital': x(t.closingCapital, `${fmt(f.capital)} + ${fmt(t.profit)} − ${fmt(f.drawings)} = **${fmt(t.closingCapital)}**.`),
        payables: x(f.payables, 'From the trial balance.'),
        accruals: x(f.wagesOwing, 'Wages owing (note 3).'),
        'total-liabilities': x(t.totalLiabilities, `${fmt(f.payables)} + ${fmt(f.wagesOwing)} = **${fmt(t.totalLiabilities)}**.`),
        'total-cap-liab': x(t.totalCapLiab, `${fmt(t.closingCapital)} + ${fmt(t.totalLiabilities)} = **${fmt(t.totalCapLiab)}** — balances with total assets.`),
      },
    },
  ]

  return {
    template: TEMPLATE,
    seed,
    title: `${f.entity} — year ended 31 December ${f.year} (generated)`,
    facts: f,
    stages,
    keys,
    config: { skills: SKILLS, generated: true },
  }
}
