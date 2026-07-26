// Property-based tests for the limited-company generator (PRD §9.2, §22.2).
import { test, expect } from '@playwright/test'
import {
  generateLimitedCompanyCase,
  assertLtdInvariants,
  ltdTruthModel,
} from '../supabase/functions/case-generate/limited.ts'
import {
  scoreJournal,
  scoreStatement,
  type JournalAnswerKey,
  type JournalConfig,
  type MatrixResponse,
  type StatementAnswerKey,
  type StatementConfig,
} from '../src/lib/practice/scoring.ts'

test('300 consecutive seeds all generate and pass every invariant', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const c = generateLimitedCompanyCase(seed)
    assertLtdInvariants(c.facts)
    expect(c.stages).toHaveLength(3)
    expect((c.stages[0].config as any).rows).toHaveLength(5)
    expect((c.stages[1].config as any).rows).toHaveLength(14)
    expect((c.stages[2].config as any).rows).toHaveLength(18)
    const spl = (c.keys[1] as any).rows
    const sofp = (c.keys[2] as any).rows
    const j = (c.keys[0] as any).rows
    // Cross-stage consistency and the company-specific identities.
    expect(sofp['total-eq-liab'].amount).toBe(sofp['total-assets'].amount)
    expect(sofp['retained-cf'].amount).toBe(
      c.facts.retainedBf + spl['profit'].amount - c.facts.dividends,
    )
    expect(spl['finance-costs'].amount).toBe(c.facts.interestPaid + j['interest'].amount)
    expect(sofp['tax-payable'].amount).toBe(j['tax'].amount)
    expect(sofp['interest-accrual'].amount).toBe(j['interest'].amount)
    // Dividends never appear in the SPL.
    expect(Object.keys(spl)).not.toContain('dividends')
  }
})

test('same seed reproduces identically; seeds vary the surface', () => {
  const a = generateLimitedCompanyCase(9090)
  const b = generateLimitedCompanyCase(9090)
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  const profits = new Set(
    [1, 2, 3, 4, 5].map((s) => ltdTruthModel(generateLimitedCompanyCase(s).facts).profit),
  )
  expect(profits.size).toBeGreaterThan(1)
})

test('a perfect learner run scores full marks on every stage', () => {
  for (const seed of [13, 130, 1300]) {
    const c = generateLimitedCompanyCase(seed)
    const jKey = c.keys[0] as unknown as JournalAnswerKey
    const jResp: MatrixResponse = Object.fromEntries(
      Object.entries(jKey.rows).map(([id, r]) => [
        id,
        { debit: r.debit, credit: r.credit, amount: String(r.amount) },
      ]),
    )
    expect(
      scoreJournal(c.stages[0].config as unknown as JournalConfig, jKey, jResp).cell_score,
    ).toBe(15)
    for (const stageIdx of [1, 2]) {
      const key = c.keys[stageIdx] as unknown as StatementAnswerKey
      const resp: MatrixResponse = Object.fromEntries(
        Object.entries(key.rows).map(([id, r]) => [id, { amount: String(r.amount) }]),
      )
      const fb = scoreStatement(c.stages[stageIdx].config as unknown as StatementConfig, key, resp)
      expect(fb.cell_score).toBe(fb.cell_max)
    }
  }
})
