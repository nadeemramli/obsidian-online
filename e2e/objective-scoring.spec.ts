// Unit tests for the objective kinds: single_select, multi_select, numeric_entry.
import { test, expect } from '@playwright/test'
import {
  parseMultiSelection,
  scoreMultiChoice,
  scoreNumeric,
  scoreSingleChoice,
  type ChoiceConfig,
  type StatementConfig,
} from '../src/lib/practice/scoring.ts'
import {
  validateMultiChoiceKey,
  validateNumericKey,
  validateSingleChoiceKey,
  validateSingleChoiceResponse,
} from '../src/lib/practice/validate.ts'

const CHOICE_CONFIG: ChoiceConfig = {
  columns: [{ id: 'choice', label: 'Answer' }],
  rows: [{ id: 'answer', label: 'Your answer' }],
  options: [
    { id: 'a', label: 'Option A' },
    { id: 'b', label: 'Option B' },
    { id: 'c', label: 'Option C' },
    { id: 'd', label: 'Option D' },
  ],
}
const MULTI_CONFIG: ChoiceConfig = {
  ...CHOICE_CONFIG,
  columns: [{ id: 'choices', label: 'Your decision' }],
}
const NUM_CONFIG: StatementConfig = {
  columns: [{ id: 'amount', label: 'Amount ($)' }],
  rows: [{ id: 'answer', label: 'Amount ($)' }],
  options: [],
}

test.describe('single_select scoring', () => {
  const key = { correct: 'c', explanation_md: 'Because C.' }

  test('correct, incorrect and blank', () => {
    expect(scoreSingleChoice(CHOICE_CONFIG, key, { answer: { choice: 'c' } }).cell_score).toBe(1)
    const wrong = scoreSingleChoice(CHOICE_CONFIG, key, { answer: { choice: 'a' } })
    expect(wrong.cell_score).toBe(0)
    expect(wrong.rows[0].cells[0].selected).toBe('a')
    expect(wrong.rows[0].cells[0].correct).toBe('c')
    const blank = scoreSingleChoice(CHOICE_CONFIG, key, {})
    expect(blank.cell_score).toBe(0)
    expect(blank.rows[0].cells[0].selected).toBeNull()
    expect(blank.kind).toBe('single_select')
  })

  test('key and response validation', () => {
    expect(validateSingleChoiceKey(CHOICE_CONFIG, key)).toEqual([])
    expect(
      validateSingleChoiceKey(CHOICE_CONFIG, { correct: 'zzz', explanation_md: 'x' }).length,
    ).toBeGreaterThan(0)
    expect(
      validateSingleChoiceResponse(CHOICE_CONFIG, { answer: { choice: 'nope' } }),
    ).toEqual([{ path: 'answers.answer.choice', message: 'unknown option' }])
  })
})

test.describe('multi_select scoring', () => {
  const key = { correct: ['a', 'c'], explanation_md: 'A and C.' } as const

  test('per-option partial credit is the default', () => {
    // Learner picks a (right) and b (wrong), misses c: verdicts a✓ b✗ c✗ d✓ = 2/4.
    const fb = scoreMultiChoice(MULTI_CONFIG, { ...key, correct: ['a', 'c'] }, {
      answer: { choices: 'a,b' },
    })
    expect(fb.cell_max).toBe(4)
    expect(fb.cell_score).toBe(2)
    expect(fb.tx_correct).toBe(0)
    expect(fb.rows.map((r) => r.row_correct)).toEqual([true, false, false, true])
  })

  test('all_or_nothing policy scores one cell', () => {
    const aon = { correct: ['a', 'c'], policy: 'all_or_nothing' as const, explanation_md: 'x' }
    expect(scoreMultiChoice(MULTI_CONFIG, aon, { answer: { choices: 'a,c' } }).cell_score).toBe(1)
    expect(scoreMultiChoice(MULTI_CONFIG, aon, { answer: { choices: 'a,c' } }).cell_max).toBe(1)
    expect(scoreMultiChoice(MULTI_CONFIG, aon, { answer: { choices: 'a' } }).cell_score).toBe(0)
  })

  test('perfect selection is fully correct regardless of order', () => {
    const fb = scoreMultiChoice(MULTI_CONFIG, { ...key, correct: ['a', 'c'] }, {
      answer: { choices: 'c,a' },
    })
    expect(fb.cell_score).toBe(4)
    expect(fb.tx_correct).toBe(1)
  })

  test('selection parsing and key validation', () => {
    expect(parseMultiSelection(' b , a ')).toEqual(['a', 'b'])
    expect(parseMultiSelection('')).toEqual([])
    expect(validateMultiChoiceKey(MULTI_CONFIG, { correct: ['a', 'c'], explanation_md: 'x' })).toEqual([])
    // Every option correct = no distractor = invalid.
    expect(
      validateMultiChoiceKey(MULTI_CONFIG, {
        correct: ['a', 'b', 'c', 'd'],
        explanation_md: 'x',
      }).length,
    ).toBeGreaterThan(0)
  })
})

test.describe('numeric_entry scoring', () => {
  const key = { amount: 4000, explanation_md: '(24,000 − 4,000) ÷ 5.' }

  test('exact, comma-formatted, tolerant and wrong answers', () => {
    expect(scoreNumeric(NUM_CONFIG, key, { answer: { amount: '4000' } }).cell_score).toBe(1)
    expect(scoreNumeric(NUM_CONFIG, key, { answer: { amount: '4,000' } }).cell_score).toBe(1)
    expect(scoreNumeric(NUM_CONFIG, key, { answer: { amount: '4800' } }).cell_score).toBe(0)
    expect(
      scoreNumeric(NUM_CONFIG, { ...key, tolerance: 1 }, { answer: { amount: '4001' } }).cell_score,
    ).toBe(1)
    const fb = scoreNumeric(NUM_CONFIG, key, {})
    expect(fb.kind).toBe('numeric_entry')
    expect(fb.cell_score).toBe(0)
  })

  test('key validation', () => {
    expect(validateNumericKey(NUM_CONFIG, key)).toEqual([])
    expect(validateNumericKey(NUM_CONFIG, { explanation_md: 'x' }).length).toBeGreaterThan(0)
    expect(
      validateNumericKey(NUM_CONFIG, { amount: 1, tolerance: -2, explanation_md: 'x' }).length,
    ).toBeGreaterThan(0)
  })
})
