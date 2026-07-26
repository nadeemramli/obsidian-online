// Property-based tests for the seeded sole-trader generator (PRD §22.2).
// The generator is server-only (lives inside the case-generate function);
// importing it here is fine — tests are not part of the client bundle.
import { test, expect } from '@playwright/test'
import {
  generateSoleTraderCase,
  assertInvariants,
  truthModel,
} from '../supabase/functions/case-generate/generator.ts'
import {
  scoreJournal,
  scoreStatement,
  type JournalAnswerKey,
  type JournalConfig,
  type MatrixResponse,
  type StatementAnswerKey,
  type StatementConfig,
} from '../src/lib/practice/scoring.ts'

test.describe('seeded generation — property sweep', () => {
  test('300 consecutive seeds all generate and pass every invariant', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const c = generateSoleTraderCase(seed)
      assertInvariants(c.facts) // re-run the gate explicitly
      // Structure is stable: 3 stages, 18 + 14 + 17 scorable cells.
      expect(c.stages).toHaveLength(3)
      expect((c.stages[0].config as any).rows).toHaveLength(6)
      expect((c.stages[1].config as any).rows).toHaveLength(14)
      expect((c.stages[2].config as any).rows).toHaveLength(17)
      // Cross-stage consistency straight from the keys.
      const spl = (c.keys[1] as any).rows
      const sofp = (c.keys[2] as any).rows
      expect(sofp['profit'].amount).toBe(spl['profit'].amount)
      expect(sofp['total-cap-liab'].amount).toBe(sofp['total-assets'].amount)
      // Every displayed answer derivable: journal amounts appear in statements.
      const j = (c.keys[0] as any).rows
      expect(spl['closing-inventory'].amount).toBe(j['closing-inv'].amount)
      expect(sofp['accruals'].amount).toBe(j['wages-accrual'].amount)
      expect(sofp['prepayments'].amount).toBe(j['insurance-prepay'].amount)
    }
  })

  test('same seed reproduces the identical case; different seeds differ', () => {
    const a1 = generateSoleTraderCase(424242)
    const a2 = generateSoleTraderCase(424242)
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2))

    const others = [1, 2, 3, 4, 5].map((s) => generateSoleTraderCase(s))
    const profits = new Set(others.map((c) => truthModel(c.facts).profit))
    expect(profits.size).toBeGreaterThan(1) // surface values vary across seeds
  })

  test('a perfect learner run scores full marks on every generated stage', () => {
    for (const seed of [7, 77, 777]) {
      const c = generateSoleTraderCase(seed)
      const jKey = c.keys[0] as unknown as JournalAnswerKey
      const jResp: MatrixResponse = Object.fromEntries(
        Object.entries(jKey.rows).map(([id, r]) => [
          id,
          { debit: r.debit, credit: r.credit, amount: String(r.amount) },
        ]),
      )
      const jFb = scoreJournal(c.stages[0].config as unknown as JournalConfig, jKey, jResp)
      expect(jFb.cell_score).toBe(18)

      for (const stageIdx of [1, 2]) {
        const key = c.keys[stageIdx] as unknown as StatementAnswerKey
        const resp: MatrixResponse = Object.fromEntries(
          Object.entries(key.rows).map(([id, r]) => [id, { amount: String(r.amount) }]),
        )
        const fb = scoreStatement(
          c.stages[stageIdx].config as unknown as StatementConfig,
          key,
          resp,
        )
        expect(fb.cell_score).toBe(fb.cell_max)
      }
    }
  })

  test('generated scenarios never reuse the golden-case entity name', () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const c = generateSoleTraderCase(seed)
      expect(c.title).not.toContain('Fernleaf')
      expect((c.stages[0].config as any).scenario_md).toContain('trial balance as at 31 December')
    }
  })
})
