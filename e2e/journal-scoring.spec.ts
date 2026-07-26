// Unit tests for journal_entry scoring and validation (Node, no browser).
import { test, expect } from '@playwright/test'
import {
  parseAmount,
  scoreJournal,
  countAnswered,
  totalCells,
} from '../src/lib/practice/scoring.ts'
import {
  validateJournalConfig,
  validateJournalKey,
  validateJournalResponse,
} from '../src/lib/practice/validate.ts'
import { MUGG_CONFIG, MUGG_KEY, MUGG_CORRECT } from './journal-fixture'
import type { MatrixResponse } from '../src/lib/practice/scoring.ts'

const perfect = (): MatrixResponse =>
  Object.fromEntries(
    Object.entries(MUGG_CORRECT).map(([rowId, v]) => [
      rowId,
      { debit: v.debit, credit: v.credit, amount: String(v.amount) },
    ]),
  )

test.describe('journal scoring', () => {
  test('perfect answer scores 30/30 and 10/10', () => {
    const fb = scoreJournal(MUGG_CONFIG, MUGG_KEY, perfect())
    expect(fb.kind).toBe('journal_entry')
    expect(fb.cell_score).toBe(30)
    expect(fb.cell_max).toBe(30)
    expect(fb.tx_correct).toBe(10)
    expect(fb.tx_total).toBe(10)
  })

  test('amounts accept thousands commas and whitespace, reject arithmetic', () => {
    expect(parseAmount('1,740')).toBe(1740)
    expect(parseAmount(' 360 ')).toBe(360)
    expect(parseAmount('-73')).toBe(-73)
    expect(parseAmount('10+10')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()

    const resp = perfect()
    resp['bank-fix'].amount = ' 360 '
    resp['dep-mv'].amount = '4 35' // malformed → wrong
    const fb = scoreJournal(MUGG_CONFIG, MUGG_KEY, resp)
    expect(fb.cell_score).toBe(29)
  })

  test('wrong amount fails only the amount cell; entry not fully correct', () => {
    const resp = perfect()
    resp['elec-prepay'].amount = '180' // full year instead of 6/12
    const fb = scoreJournal(MUGG_CONFIG, MUGG_KEY, resp)
    const row = fb.rows.find((r) => r.row_id === 'elec-prepay')!
    expect(row.row_correct).toBe(false)
    expect(row.cells.find((c) => c.column_id === 'amount')!.ok).toBe(false)
    expect(row.cells.find((c) => c.column_id === 'debit')!.ok).toBe(true)
    expect(fb.cell_score).toBe(29)
    expect(fb.tx_correct).toBe(9)
  })

  test('reversed debit/credit accounts earn no credit for either account cell', () => {
    const resp = perfect()
    resp['contra'] = {
      debit: MUGG_CORRECT['contra'].credit,
      credit: MUGG_CORRECT['contra'].debit,
      amount: String(MUGG_CORRECT['contra'].amount),
    }
    const fb = scoreJournal(MUGG_CONFIG, MUGG_KEY, resp)
    const row = fb.rows.find((r) => r.row_id === 'contra')!
    expect(row.cells.find((c) => c.column_id === 'debit')!.ok).toBe(false)
    expect(row.cells.find((c) => c.column_id === 'credit')!.ok).toBe(false)
    expect(row.cells.find((c) => c.column_id === 'amount')!.ok).toBe(true)
    expect(fb.cell_score).toBe(28)
  })

  test('tolerance allows near-miss amounts when configured', () => {
    const key = JSON.parse(JSON.stringify(MUGG_KEY))
    key.rows['dep-mv'].tolerance = 1
    const resp = perfect()
    resp['dep-mv'].amount = '436'
    const fb = scoreJournal(MUGG_CONFIG, key, resp)
    expect(fb.rows.find((r) => r.row_id === 'dep-mv')!.row_correct).toBe(true)
  })

  test('missing cells score zero; progress helpers count all three columns', () => {
    const resp = perfect()
    delete (resp['irrec'] as any).amount
    delete resp['own-use']
    const fb = scoreJournal(MUGG_CONFIG, MUGG_KEY, resp)
    expect(fb.cell_score).toBe(26)
    expect(totalCells(MUGG_CONFIG as any)).toBe(30)
    expect(countAnswered(MUGG_CONFIG as any, resp)).toBe(26)
  })
})

test.describe('journal validation', () => {
  test('the Mugg fixture passes config, key and response validation', () => {
    expect(validateJournalConfig(MUGG_CONFIG)).toEqual([])
    expect(validateJournalKey(MUGG_CONFIG, MUGG_KEY)).toEqual([])
    expect(validateJournalResponse(MUGG_CONFIG, perfect())).toEqual([])
  })

  test('config must have exactly debit/credit/amount columns', () => {
    const bad = { ...MUGG_CONFIG, columns: MUGG_CONFIG.columns.slice(0, 2) }
    expect(validateJournalConfig(bad).some((i) => i.path === 'columns')).toBe(true)
  })

  test('key validation flags missing amounts and foreign accounts', () => {
    const key = JSON.parse(JSON.stringify(MUGG_KEY))
    delete key.rows['contra'].amount
    key.rows['irrec'].debit = 'not-an-account'
    const issues = validateJournalKey(MUGG_CONFIG, key)
    expect(issues.some((i) => i.path === 'answer_key.rows.contra.amount')).toBe(true)
    expect(issues.some((i) => i.message.includes('not in the account list'))).toBe(true)
  })

  test('responses reject unknown accounts but accept any amount string', () => {
    expect(
      validateJournalResponse(MUGG_CONFIG, { contra: { debit: 'i-hacked-this' } }),
    ).toEqual([{ path: 'answers.contra.debit', message: 'unknown option' }])
    expect(
      validateJournalResponse(MUGG_CONFIG, { contra: { amount: 'not a number' } }),
    ).toEqual([]) // scores wrong, but structurally fine
  })
})
