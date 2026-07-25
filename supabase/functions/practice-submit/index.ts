// practice-submit — server-side evaluation for practice attempts.
//
// Why an edge function: the client must never see the answer key before a
// submission is stored (PRD §B.9). Learners cannot SELECT learning_item_answers
// under RLS, so evaluation has to happen in a trusted place.
//
// Privilege model (deliberately narrow):
//   * The caller's JWT is verified and ALL learner-state writes (attempts,
//     error_log, review_states, practice_sessions) run through a user-scoped
//     client — RLS ownership predicates stay in force.
//   * The service role is used for exactly one read: the answer key row.
//     It never writes anything.
//
// Idempotency: (user_id, client_submission_id) is unique; a duplicate submit
// (double-click, network retry) returns the already-stored attempt.
//
// scoring.ts / validate.ts here are byte-for-byte copies of
// src/lib/practice/*.ts — the unit suite fails if they drift.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { scoreMatrix } from './scoring.ts'
import {
  validateMatrixConfig,
  validateMatrixKey,
  validateMatrixResponse,
  asMatrixConfig,
  asMatrixKey,
  asMatrixResponse,
} from './validate.ts'

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

  const itemId = body?.item_id
  const sessionId = body?.session_id ?? null
  const submissionId = body?.client_submission_id
  const answers = body?.answers
  const durationMs =
    typeof body?.duration_ms === 'number' && body.duration_ms >= 0
      ? Math.min(Math.round(body.duration_ms), 1000 * 60 * 60 * 24)
      : null

  if (typeof itemId !== 'string' || !UUID_RE.test(itemId))
    return json({ error: 'item_id must be a UUID' }, 400)
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

  // Load the item AS THE USER: RLS hides drafts/archived from learners, so a
  // learner cannot submit against (or probe) unpublished content.
  const { data: item, error: itemError } = await userClient
    .from('learning_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) return json({ error: itemError.message }, 500)
  if (!item) return json({ error: 'Activity not found' }, 404)
  if (item.kind !== 'matrix_select')
    return json({ error: `Unsupported question kind "${item.kind}"` }, 400)

  const configIssues = validateMatrixConfig(item.config)
  if (configIssues.length > 0) return json({ error: 'Question configuration is invalid' }, 500)
  const config = asMatrixConfig(item.config)

  const responseIssues = validateMatrixResponse(config, answers)
  if (responseIssues.length > 0)
    return json({ error: 'Malformed submission', details: responseIssues }, 400)

  // The one privileged read: the answer key (learners cannot SELECT this table).
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: keyRow, error: keyError } = await serviceClient
    .from('learning_item_answers')
    .select('answer_key, overall_explanation_md')
    .eq('item_id', item.id)
    .eq('version', item.version)
    .maybeSingle()
  if (keyError) return json({ error: keyError.message }, 500)
  if (!keyRow) return json({ error: 'This activity has no answer key yet' }, 500)
  const keyIssues = validateMatrixKey(config, keyRow.answer_key)
  if (keyIssues.length > 0) return json({ error: 'Answer key is incomplete' }, 500)

  const feedback = scoreMatrix(config, asMatrixKey(keyRow.answer_key), asMatrixResponse(answers))
  const storedFeedback = {
    ...feedback,
    overall_explanation_md: keyRow.overall_explanation_md ?? null,
  }

  // Store the attempt as the user (RLS WITH CHECK user_id = auth.uid()).
  const { data: attempt, error: insertError } = await userClient
    .from('attempts')
    .insert({
      session_id: sessionId,
      item_id: item.id,
      item_version: item.version,
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
      if (cell.ok || (cell.column_id !== 'debit' && cell.column_id !== 'credit')) continue
      errorRows.push({
        attempt_id: attempt.id,
        item_id: item.id,
        row_id: row.row_id,
        cell: cell.column_id,
        row_label: row.row_label,
        submitted_label: cell.selected ? feedback.option_labels[cell.selected] ?? cell.selected : '',
        expected_label: feedback.option_labels[cell.correct] ?? cell.correct,
        paper: item.paper,
        topic: item.topic,
      })
    }
  }
  if (errorRows.length > 0) {
    await userClient
      .from('error_log')
      .upsert(errorRows, { onConflict: 'attempt_id,row_id,cell', ignoreDuplicates: true })
  }

  // Naive spaced-review foundation (PRD §B.9): perfect → streak+1 and a longer
  // gap; anything else resets the streak and comes back tomorrow.
  const score = feedback.cell_score / feedback.cell_max
  const { data: prevReview } = await userClient
    .from('review_states')
    .select('streak')
    .eq('item_id', item.id)
    .maybeSingle()
  const streak = score === 1 ? (prevReview?.streak ?? 0) + 1 : 0
  const dueDays = score === 1 ? Math.min(3 * Math.max(streak, 1), 21) : 1
  await userClient.from('review_states').upsert(
    {
      user_id: user.id,
      item_id: item.id,
      last_score: score,
      streak,
      due_at: new Date(Date.now() + dueDays * 86400_000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,item_id' },
  )

  // Close the session (best-effort; RLS limits it to the caller's own row).
  if (sessionId) {
    await userClient
      .from('practice_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  return attemptResponse(attempt as StoredAttempt, false)
})
