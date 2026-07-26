// practice-submit — server-side evaluation for practice attempts.
//
// Why an edge function: the client must never see an answer key before a
// submission is stored. Learners cannot SELECT learning_item_answers (RLS) or
// generated_case_keys (no policies at all), so evaluation happens here.
//
// Two targets share one flow:
//   * item_id                          — an authored learning item
//   * generated_case_id + stage_index  — a stage of a seeded generated case
//
// Privilege model (deliberately narrow): the caller's JWT is verified and ALL
// learner-state writes run through a user-scoped client under RLS; the service
// role performs exactly one read — the answer key. Idempotency:
// (user_id, client_submission_id) is unique; duplicates return the stored
// attempt. scoring.ts / validate.ts are byte-for-byte copies of
// src/lib/practice/*.ts — the unit suite fails if they drift.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { scoreMatrix, scoreJournal, scoreStatement, type MatrixFeedback } from './scoring.ts'
import {
  validateMatrixConfig,
  validateMatrixKey,
  validateMatrixResponse,
  validateJournalConfig,
  validateJournalKey,
  validateJournalResponse,
  validateStatementConfig,
  validateStatementKey,
  validateStatementResponse,
  asMatrixConfig,
  asMatrixKey,
  asMatrixResponse,
  asJournalConfig,
  asJournalKey,
  asStatementConfig,
  asStatementKey,
} from './validate.ts'

// Per-kind validation + scoring dispatch. Registering a kind here mirrors the
// client registry (src/lib/practice/registry.tsx).
const KINDS: Record<
  string,
  {
    validateConfig: (c: unknown) => { path: string; message: string }[]
    validateResponse: (c: any, r: unknown) => { path: string; message: string }[]
    validateKey: (c: any, k: unknown) => { path: string; message: string }[]
    score: (c: any, k: any, r: any) => MatrixFeedback
  }
> = {
  matrix_select: {
    validateConfig: validateMatrixConfig,
    validateResponse: (c, r) => validateMatrixResponse(asMatrixConfig(c), r),
    validateKey: (c, k) => validateMatrixKey(asMatrixConfig(c), k),
    score: (c, k, r) => scoreMatrix(asMatrixConfig(c), asMatrixKey(k), asMatrixResponse(r)),
  },
  journal_entry: {
    validateConfig: validateJournalConfig,
    validateResponse: (c, r) => validateJournalResponse(asJournalConfig(c), r),
    validateKey: (c, k) => validateJournalKey(asJournalConfig(c), k),
    score: (c, k, r) => scoreJournal(asJournalConfig(c), asJournalKey(k), asMatrixResponse(r)),
  },
  statement_prep: {
    validateConfig: validateStatementConfig,
    validateResponse: (c, r) => validateStatementResponse(asStatementConfig(c), r),
    validateKey: (c, k) => validateStatementKey(asStatementConfig(c), k),
    score: (c, k, r) => scoreStatement(asStatementConfig(c), asStatementKey(k), asMatrixResponse(r)),
  },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type StoredAttempt = {
  id: string
  feedback: Record<string, unknown>
  cell_score: number
  cell_max: number
  tx_correct: number
  tx_total: number
}

function attemptResponse(a: StoredAttempt, duplicate: boolean): Response {
  return json({
    attempt_id: a.id,
    feedback: a.feedback,
    overall_explanation_md: (a.feedback as any)?.overall_explanation_md ?? null,
    cell_score: a.cell_score,
    cell_max: a.cell_max,
    tx_correct: a.tx_correct,
    tx_total: a.tx_total,
    duplicate,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // User-scoped client: every learner-state operation stays behind RLS.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'Not signed in' }, 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const itemId = body?.item_id ?? null
  const generatedCaseId = body?.generated_case_id ?? null
  const stageIndex = body?.stage_index ?? null
  const sessionId = body?.session_id ?? null
  const submissionId = body?.client_submission_id
  const answers = body?.answers
  const durationMs =
    typeof body?.duration_ms === 'number' && body.duration_ms >= 0
      ? Math.min(Math.round(body.duration_ms), 1000 * 60 * 60 * 24)
      : null

  const isGenerated = generatedCaseId !== null
  if (isGenerated) {
    if (typeof generatedCaseId !== 'string' || !UUID_RE.test(generatedCaseId))
      return json({ error: 'generated_case_id must be a UUID' }, 400)
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 50)
      return json({ error: 'stage_index must be a small non-negative integer' }, 400)
  } else if (typeof itemId !== 'string' || !UUID_RE.test(itemId)) {
    return json({ error: 'item_id must be a UUID' }, 400)
  }
  if (typeof submissionId !== 'string' || !UUID_RE.test(submissionId))
    return json({ error: 'client_submission_id must be a UUID' }, 400)
  if (sessionId !== null && (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)))
    return json({ error: 'session_id must be a UUID or null' }, 400)

  // Idempotency: an attempt with this submission id already exists → return it.
  const { data: existing } = await userClient
    .from('attempts')
    .select('id, feedback, cell_score, cell_max, tx_correct, tx_total')
    .eq('client_submission_id', submissionId)
    .maybeSingle()
  if (existing) return attemptResponse(existing as StoredAttempt, true)

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Resolve the target: kind + config (as the user, RLS applies) and the
  // answer key (the one privileged read).
  let kind: string
  let config: unknown
  let keyPayload: unknown
  let overallExplanation: string | null = null
  let itemVersion = 1
  let errorMeta: { paper: string | null; topic: string | null } = { paper: null, topic: null }

  if (isGenerated) {
    const { data: caseRow, error: caseError } = await userClient
      .from('generated_cases')
      .select('*')
      .eq('id', generatedCaseId)
      .maybeSingle()
    if (caseError) return json({ error: caseError.message }, 500)
    if (!caseRow) return json({ error: 'Case not found' }, 404)
    const stage = Array.isArray(caseRow.stages) ? caseRow.stages[stageIndex] : null
    if (!stage) return json({ error: 'Stage not found' }, 404)
    kind = stage.kind
    config = stage.config
    errorMeta = { paper: 'FFA', topic: 'Sole trader accounts preparation' }

    const { data: keysRow, error: keysError } = await serviceClient
      .from('generated_case_keys')
      .select('keys')
      .eq('case_id', generatedCaseId)
      .maybeSingle()
    if (keysError) return json({ error: keysError.message }, 500)
    keyPayload = Array.isArray(keysRow?.keys) ? keysRow.keys[stageIndex] : null
    if (!keyPayload) return json({ error: 'This stage has no answer key' }, 500)
  } else {
    // Load AS THE USER: RLS hides drafts/archived from learners.
    const { data: item, error: itemError } = await userClient
      .from('learning_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError) return json({ error: itemError.message }, 500)
    if (!item) return json({ error: 'Activity not found' }, 404)
    kind = item.kind
    config = item.config
    itemVersion = item.version
    errorMeta = { paper: item.paper, topic: item.topic }

    const { data: keyRow, error: keyError } = await serviceClient
      .from('learning_item_answers')
      .select('answer_key, overall_explanation_md')
      .eq('item_id', item.id)
      .eq('version', item.version)
      .maybeSingle()
    if (keyError) return json({ error: keyError.message }, 500)
    if (!keyRow) return json({ error: 'This activity has no answer key yet' }, 500)
    keyPayload = keyRow.answer_key
    overallExplanation = keyRow.overall_explanation_md ?? null
  }

  const kindDef = KINDS[kind]
  if (!kindDef) return json({ error: `Unsupported question kind "${kind}"` }, 400)

  const configIssues = kindDef.validateConfig(config)
  if (configIssues.length > 0) return json({ error: 'Question configuration is invalid' }, 500)
  const responseIssues = kindDef.validateResponse(config, answers)
  if (responseIssues.length > 0)
    return json({ error: 'Malformed submission', details: responseIssues }, 400)
  const keyIssues = kindDef.validateKey(config, keyPayload)
  if (keyIssues.length > 0) return json({ error: 'Answer key is incomplete' }, 500)

  const feedback: MatrixFeedback = kindDef.score(config, keyPayload, answers)
  const storedFeedback = { ...feedback, overall_explanation_md: overallExplanation }

  // Store the attempt as the user (RLS WITH CHECK user_id = auth.uid()).
  const { data: attempt, error: insertError } = await userClient
    .from('attempts')
    .insert({
      session_id: sessionId,
      item_id: isGenerated ? null : itemId,
      generated_case_id: isGenerated ? generatedCaseId : null,
      stage_index: isGenerated ? stageIndex : null,
      item_version: itemVersion,
      client_submission_id: submissionId,
      answers,
      feedback: storedFeedback,
      cell_score: feedback.cell_score,
      cell_max: feedback.cell_max,
      tx_correct: feedback.tx_correct,
      tx_total: feedback.tx_total,
      duration_ms: durationMs,
    })
    .select('id, feedback, cell_score, cell_max, tx_correct, tx_total')
    .single()
  if (insertError) {
    // Unique violation = a concurrent duplicate submit won the race.
    if (insertError.code === '23505') {
      const { data: raced } = await userClient
        .from('attempts')
        .select('id, feedback, cell_score, cell_max, tx_correct, tx_total')
        .eq('client_submission_id', submissionId)
        .maybeSingle()
      if (raced) return attemptResponse(raced as StoredAttempt, true)
    }
    return json({ error: insertError.message }, 500)
  }

  // Error log: one row per wrong cell (unique on attempt/row/cell → no dupes).
  const errorRows = []
  for (const row of feedback.rows) {
    for (const cell of row.cells) {
      const loggable = ['debit', 'credit', 'amount'].includes(cell.column_id)
      if (cell.ok || !loggable) continue
      errorRows.push({
        attempt_id: attempt.id,
        item_id: isGenerated ? null : itemId,
        generated_case_id: isGenerated ? generatedCaseId : null,
        row_id: row.row_id,
        cell: cell.column_id,
        row_label: row.row_label,
        submitted_label: cell.selected ? feedback.option_labels[cell.selected] ?? cell.selected : '',
        expected_label: feedback.option_labels[cell.correct] ?? cell.correct,
        paper: errorMeta.paper,
        topic: errorMeta.topic,
      })
    }
  }
  if (errorRows.length > 0) {
    await userClient
      .from('error_log')
      .upsert(errorRows, { onConflict: 'attempt_id,row_id,cell', ignoreDuplicates: true })
  }

  // Naive spaced-review foundation — authored items only (generated cases are
  // one-off variants; their skills are reviewed via the authored repair drills).
  if (!isGenerated) {
    const score = feedback.cell_score / feedback.cell_max
    const { data: prevReview } = await userClient
      .from('review_states')
      .select('streak')
      .eq('item_id', itemId)
      .maybeSingle()
    const streak = score === 1 ? (prevReview?.streak ?? 0) + 1 : 0
    const dueDays = score === 1 ? Math.min(3 * Math.max(streak, 1), 21) : 1
    await userClient.from('review_states').upsert(
      {
        user_id: user.id,
        item_id: itemId,
        last_score: score,
        streak,
        due_at: new Date(Date.now() + dueDays * 86400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,item_id' },
    )
  }

  // Close the session (best-effort; RLS limits it to the caller's own row).
  if (sessionId) {
    await userClient
      .from('practice_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  return attemptResponse(attempt as StoredAttempt, false)
})
