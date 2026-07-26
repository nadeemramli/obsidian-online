// Golden-case accounting invariants (PRD §11.4, §22.5) plus statement_prep
// scorer and causal-diagnosis unit tests. Runs in Node — pure functions only.
import { test, expect } from '@playwright/test'
import {
  scoreJournal,
  scoreStatement,
  type MatrixResponse,
  type StatementAnswerKey,
} from '../src/lib/practice/scoring.ts'
import {
  validateStatementConfig,
  validateStatementKey,
  validateStatementResponse,
} from '../src/lib/practice/validate.ts'
import { diagnose } from '../src/lib/practice/diagnose.ts'
import {
  FERNLEAF_A,
  FERNLEAF_B,
  FERNLEAF_SKILLS,
  type FernleafVariant,
} from './fernleaf-fixture'

const amounts = (key: StatementAnswerKey) =>
  Object.fromEntries(Object.entries(key.rows).map(([id, r]) => [id, r.amount]))
const journalAmount = (v: FernleafVariant, row: string) => v.journal.key.rows[row].amount

function checkInvariants(name: string, v: FernleafVariant) {
  test.describe(`golden case invariants — ${name}`, () => {
    const tb = v.tb
    const spl = amounts(v.spl.key)
    const sofp = amounts(v.sofp.key)

    test('unadjusted trial balance balances', () => {
      const dr =
        tb.drawings + tb.purchases + tb.openingInventory + tb.rent + tb.insurance +
        tb.wages + tb.sundry + tb.receivables + tb.bank + tb.equipmentCost
      const cr = tb.capital + tb.sales + tb.payables + tb.allowanceBf + tb.accDepBf
      expect(dr).toBe(cr)
    })

    test('adjustment amounts derive from the scenario facts', () => {
      expect(journalAmount(v, 'depreciation')).toBe(tb.equipmentCost * 0.1)
      const remaining = tb.receivables - journalAmount(v, 'write-off')
      expect(journalAmount(v, 'allowance')).toBe(remaining * 0.05 - tb.allowanceBf)
    })

    test('statement of profit or loss arithmetic holds', () => {
      expect(spl['revenue']).toBe(tb.sales)
      expect(spl['opening-inventory']).toBe(tb.openingInventory)
      expect(spl['purchases']).toBe(tb.purchases)
      expect(spl['closing-inventory']).toBe(journalAmount(v, 'closing-inv'))
      expect(spl['cost-of-sales']).toBe(
        spl['opening-inventory'] + spl['purchases'] - spl['closing-inventory'],
      )
      expect(spl['gross-profit']).toBe(spl['revenue'] - spl['cost-of-sales'])
      expect(spl['insurance']).toBe(tb.insurance - journalAmount(v, 'insurance-prepay'))
      expect(spl['wages']).toBe(tb.wages + journalAmount(v, 'wages-accrual'))
      expect(spl['depreciation']).toBe(journalAmount(v, 'depreciation'))
      expect(spl['irrec']).toBe(journalAmount(v, 'write-off') + journalAmount(v, 'allowance'))
      expect(spl['total-expenses']).toBe(
        spl['rent'] + spl['insurance'] + spl['wages'] + spl['sundry'] +
          spl['depreciation'] + spl['irrec'],
      )
      expect(spl['profit']).toBe(spl['gross-profit'] - spl['total-expenses'])
    })

    test('statement of financial position balances and reconciles', () => {
      expect(sofp['acc-dep']).toBe(tb.accDepBf + journalAmount(v, 'depreciation'))
      expect(sofp['carrying']).toBe(sofp['equip-cost'] - sofp['acc-dep'])
      expect(sofp['inventories']).toBe(journalAmount(v, 'closing-inv'))
      const remaining = tb.receivables - journalAmount(v, 'write-off')
      const allowance = tb.allowanceBf + journalAmount(v, 'allowance')
      expect(sofp['receivables-net']).toBe(remaining - allowance)
      expect(sofp['prepayments']).toBe(journalAmount(v, 'insurance-prepay'))
      expect(sofp['total-current']).toBe(
        sofp['inventories'] + sofp['receivables-net'] + sofp['prepayments'] + sofp['bank'],
      )
      expect(sofp['total-assets']).toBe(sofp['carrying'] + sofp['total-current'])
      // Closing-capital reconciliation and cross-stage profit consistency.
      expect(sofp['profit']).toBe(spl['profit'])
      expect(sofp['closing-capital']).toBe(
        sofp['opening-capital'] + sofp['profit'] - sofp['drawings'],
      )
      expect(sofp['total-liabilities']).toBe(sofp['payables'] + sofp['accruals'])
      expect(sofp['accruals']).toBe(journalAmount(v, 'wages-accrual'))
      // The accounting equation.
      expect(sofp['total-cap-liab']).toBe(sofp['closing-capital'] + sofp['total-liabilities'])
      expect(sofp['total-cap-liab']).toBe(sofp['total-assets'])
    })

    test('the altered variant changes surface values but not structure', () => {
      const other = name === 'Fernleaf 20X8' ? FERNLEAF_B : FERNLEAF_A
      expect(Object.keys(spl).sort()).toEqual(Object.keys(amounts(other.spl.key)).sort())
      expect(spl['profit']).not.toBe(amounts(other.spl.key)['profit'])
    })
  })
}

checkInvariants('Fernleaf 20X8', FERNLEAF_A)
checkInvariants('Fernleaf 20X9 (altered)', FERNLEAF_B)

test.describe('statement_prep scoring', () => {
  const { config, key } = FERNLEAF_A.spl
  const perfect = (): MatrixResponse =>
    Object.fromEntries(
      Object.entries(key.rows).map(([id, r]) => [id, { amount: String(r.amount) }]),
    )

  test('perfect statement scores full marks', () => {
    const fb = scoreStatement(config, key, perfect())
    expect(fb.kind).toBe('statement_prep')
    expect(fb.cell_score).toBe(14)
    expect(fb.cell_max).toBe(14)
  })

  test('wrong and missing lines score zero individually', () => {
    const resp = perfect()
    resp['cost-of-sales'].amount = '50000'
    delete resp['profit']
    const fb = scoreStatement(config, key, resp)
    expect(fb.cell_score).toBe(12)
    expect(fb.rows.find((r) => r.row_id === 'profit')!.cells[0].selected).toBeNull()
  })

  test('amounts accept thousands separators', () => {
    const resp = perfect()
    resp['revenue'].amount = '84,600'
    expect(scoreStatement(config, key, resp).cell_score).toBe(14)
  })

  test('validators accept the fixture and reject broken shapes', () => {
    expect(validateStatementConfig(config)).toEqual([])
    expect(validateStatementKey(config, key)).toEqual([])
    expect(validateStatementResponse(config, perfect())).toEqual([])
    expect(
      validateStatementConfig({ ...config, columns: [{ id: 'x', label: 'X' }] }).length,
    ).toBeGreaterThan(0)
    expect(validateStatementResponse(config, { revenue: { debit: 'no' } })).toEqual([
      { path: 'answers.revenue.debit', message: 'unknown column' },
    ])
  })
})

test.describe('causal diagnosis (earliest-failure precedence)', () => {
  // Build stage feedbacks by scoring real responses against the real keys.
  const scoreStages = (mutate: (r: {
    journal: MatrixResponse
    spl: MatrixResponse
    sofp: MatrixResponse
  }) => void) => {
    const j: MatrixResponse = Object.fromEntries(
      Object.entries(FERNLEAF_A.journal.key.rows).map(([id, r]) => [
        id,
        { debit: r.debit, credit: r.credit, amount: String(r.amount) },
      ]),
    )
    const spl: MatrixResponse = Object.fromEntries(
      Object.entries(FERNLEAF_A.spl.key.rows).map(([id, r]) => [id, { amount: String(r.amount) }]),
    )
    const sofp: MatrixResponse = Object.fromEntries(
      Object.entries(FERNLEAF_A.sofp.key.rows).map(([id, r]) => [id, { amount: String(r.amount) }]),
    )
    const rs = { journal: j, spl, sofp }
    mutate(rs)
    return [
      scoreJournal(FERNLEAF_A.journal.config, FERNLEAF_A.journal.key, rs.journal),
      scoreStatement(FERNLEAF_A.spl.config, FERNLEAF_A.spl.key, rs.spl),
      scoreStatement(FERNLEAF_A.sofp.config, FERNLEAF_A.sofp.key, rs.sofp),
    ]
  }

  test('a clean run has no failed skills', () => {
    const d = diagnose(FERNLEAF_SKILLS, scoreStages(() => {}))
    expect(d.failedSkills).toEqual([])
    expect(d.independent).toEqual([])
  })

  test('a wrong adjustment plus its knock-on lines is ONE root error, not many', () => {
    const d = diagnose(
      FERNLEAF_SKILLS,
      scoreStages((rs) => {
        // Learner used $180-style thinking: wrong closing inventory everywhere.
        rs.journal['closing-inv'].amount = '5000'
        rs.spl['closing-inventory'].amount = '5000'
        rs.spl['cost-of-sales'].amount = '51300'
        rs.spl['gross-profit'].amount = '33300'
        rs.spl['profit'].amount = '13780'
        rs.sofp['inventories'].amount = '5000'
        rs.sofp['profit'].amount = '13780'
        rs.sofp['closing-capital'].amount = '19580'
        rs.sofp['total-current'].amount = '14880'
        rs.sofp['total-assets'].amount = '25280'
        rs.sofp['total-cap-liab'].amount = '25280'
      }),
    )
    expect(d.failedSkills.map((s) => s.id)).toEqual(['closing-inventory'])
    expect(d.downstreamRows.size).toBe(10)
    expect(d.independent).toEqual([])
  })

  test('a statement-only mistake with correct journals is independent', () => {
    const d = diagnose(
      FERNLEAF_SKILLS,
      scoreStages((rs) => {
        rs.sofp['bank'].amount = '9999' // placement/copy error, no failed root
      }),
    )
    expect(d.failedSkills).toEqual([])
    expect(d.independent).toEqual(['2:bank'])
  })

  test('failed skills expose their repair drill', () => {
    const d = diagnose(
      FERNLEAF_SKILLS,
      scoreStages((rs) => {
        rs.journal['depreciation'].amount = '150'
      }),
    )
    expect(d.failedSkills[0].repair_item_id).toBeTruthy()
  })
})
