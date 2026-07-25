// Unit tests for the pure scoring/validation core (run in Node, no browser).
// Also guards the byte-for-byte contract between src/lib/practice/*.ts and the
// copies deployed inside the practice-submit edge function.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { scoreMatrix, countAnswered, totalCells } from '../src/lib/practice/scoring.ts'
import {
  validateMatrixConfig,
  validateMatrixKey,
  validateMatrixResponse,
} from '../src/lib/practice/validate.ts'
import { DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, CORRECT } from './practice-fixture'
import type { MatrixResponse } from '../src/lib/practice/scoring.ts'

const perfect = (): MatrixResponse =>
  Object.fromEntries(
    Object.entries(CORRECT).map(([rowId, v]) => [rowId, { debit: v.debit, credit: v.credit }]),
  )

test.describe('matrix scoring', () => {
  test('perfect answer scores 16/16 and 8/8', () => {
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, perfect())
    expect(fb.cell_score).toBe(16)
    expect(fb.cell_max).toBe(16)
    expect(fb.tx_correct).toBe(8)
    expect(fb.tx_total).toBe(8)
    expect(fb.rows.every((r) => r.row_correct)).toBe(true)
  })

  test('fully incorrect answer scores 0', () => {
    const wrong: MatrixResponse = Object.fromEntries(
      Object.keys(CORRECT).map((rowId) => [
        rowId,
        // bank-decrease-cash is a distractor that is never a correct answer.
        { debit: 'bank-decrease-cash', credit: 'bank-decrease-cash' },
      ]),
    )
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, wrong)
    expect(fb.cell_score).toBe(0)
    expect(fb.tx_correct).toBe(0)
  })

  test('partial correctness counts cells and transactions separately', () => {
    const resp = perfect()
    // Break three cells across two transactions.
    resp['sales-cash'].debit = 'bank-decrease'
    resp['borrow'].debit = 'loan-increase'
    resp['borrow'].credit = 'bank-increase'
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, resp)
    expect(fb.cell_score).toBe(13)
    expect(fb.cell_max).toBe(16)
    expect(fb.tx_correct).toBe(6)
    expect(fb.tx_total).toBe(8)
  })

  test('debit/credit reversal earns no credit for either cell', () => {
    const resp = perfect()
    resp['borrow'] = { debit: CORRECT['borrow'].credit, credit: CORRECT['borrow'].debit }
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, resp)
    const row = fb.rows.find((r) => r.row_id === 'borrow')!
    expect(row.row_correct).toBe(false)
    expect(row.cells.every((c) => !c.ok)).toBe(true)
    expect(fb.cell_score).toBe(14)
  })

  test('missing responses score zero and are reported as unanswered', () => {
    const resp = perfect()
    delete (resp['electricity'] as any).credit
    delete resp['pay-supplier']
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, resp)
    expect(fb.cell_score).toBe(13)
    const elec = fb.rows.find((r) => r.row_id === 'electricity')!
    expect(elec.cells.find((c) => c.column_id === 'credit')!.selected).toBeNull()
    expect(countAnswered(DUAL_EFFECT_CONFIG, resp)).toBe(13)
    expect(totalCells(DUAL_EFFECT_CONFIG)).toBe(16)
  })

  test('empty response scores zero across the board', () => {
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, {})
    expect(fb.cell_score).toBe(0)
    expect(fb.cell_max).toBe(16)
    expect(fb.tx_correct).toBe(0)
  })

  test('feedback snapshot is self-contained (labels embedded)', () => {
    const fb = scoreMatrix(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY, perfect())
    expect(fb.columns.map((c) => c.label)).toEqual(['Debit', 'Credit'])
    expect(fb.option_labels['bank-increase']).toContain('increase asset')
    expect(fb.rows[0].explanation_md.length).toBeGreaterThan(0)
  })

  test('scoring throws on a broken answer key instead of misreporting', () => {
    const badKey = { rows: { ...DUAL_EFFECT_KEY.rows } }
    delete (badKey.rows as any)['borrow']
    expect(() => scoreMatrix(DUAL_EFFECT_CONFIG, badKey, perfect())).toThrow(/borrow/)
  })
})

test.describe('matrix validation', () => {
  test('valid fixture passes config, key and response validation', () => {
    expect(validateMatrixConfig(DUAL_EFFECT_CONFIG)).toEqual([])
    expect(validateMatrixKey(DUAL_EFFECT_CONFIG, DUAL_EFFECT_KEY)).toEqual([])
    expect(validateMatrixResponse(DUAL_EFFECT_CONFIG, perfect())).toEqual([])
  })

  test('malformed responses are rejected (unknown row/column/option, wrong shape)', () => {
    expect(validateMatrixResponse(DUAL_EFFECT_CONFIG, 'nope').length).toBeGreaterThan(0)
    expect(
      validateMatrixResponse(DUAL_EFFECT_CONFIG, { 'no-such-row': { debit: 'bank-increase' } }),
    ).toEqual([{ path: 'answers.no-such-row', message: 'unknown row' }])
    expect(
      validateMatrixResponse(DUAL_EFFECT_CONFIG, { borrow: { sideways: 'bank-increase' } }),
    ).toEqual([{ path: 'answers.borrow.sideways', message: 'unknown column' }])
    expect(
      validateMatrixResponse(DUAL_EFFECT_CONFIG, { borrow: { debit: 'not-an-option' } }),
    ).toEqual([{ path: 'answers.borrow.debit', message: 'unknown option' }])
  })

  test('config validation flags duplicates and empties', () => {
    expect(validateMatrixConfig({})).not.toEqual([])
    const dupes = {
      columns: [
        { id: 'debit', label: 'Debit' },
        { id: 'debit', label: 'Debit again' },
      ],
      rows: [{ id: 'r1', label: 'Row' }],
      options: [{ id: 'o1', label: '' }],
    }
    const issues = validateMatrixConfig(dupes)
    expect(issues.some((i) => i.message.includes('duplicate id'))).toBe(true)
    expect(issues.some((i) => i.message === 'missing label')).toBe(true)
  })

  test('key validation flags missing answers, foreign options and missing explanations', () => {
    const key = JSON.parse(JSON.stringify(DUAL_EFFECT_KEY))
    delete key.rows['borrow'].credit
    key.rows['sales-cash'].debit = 'not-in-set'
    key.rows['electricity'].explanation_md = '  '
    const issues = validateMatrixKey(DUAL_EFFECT_CONFIG, key)
    expect(issues.some((i) => i.path === 'answer_key.rows.borrow.credit')).toBe(true)
    expect(issues.some((i) => i.message.includes('not in the option set'))).toBe(true)
    expect(issues.some((i) => i.path.includes('electricity.explanation_md'))).toBe(true)
  })
})

test.describe('edge-function copies stay in sync', () => {
  const root = path.resolve(__dirname, '..')
  for (const name of ['scoring.ts', 'validate.ts']) {
    test(`${name} matches the deployed copy byte for byte`, () => {
      const canonical = fs.readFileSync(path.join(root, 'src/lib/practice', name), 'utf8')
      const deployed = fs.readFileSync(
        path.join(root, 'supabase/functions/practice-submit', name),
        'utf8',
      )
      expect(deployed).toBe(canonical)
    })
  }
})
