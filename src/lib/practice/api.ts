// Data access for the practice system. All reads/writes go through the anon-key
// client under RLS; the one privileged step (answer-key lookup + evaluation) is the
// `practice-submit` edge function, invoked with the caller's JWT.
import { supabase } from '../supabase'
import type { Json, Tables } from '../database.types'
import type { MatrixFeedback, MatrixResponse } from './scoring.ts'

export type LearningItem = Tables<'learning_items'>
export type Attempt = Tables<'attempts'>
export type PracticeSession = Tables<'practice_sessions'>
export type ErrorLogEntry = Tables<'error_log'>
export type Profile = Tables<'profiles'>
export type ItemAnswers = Tables<'learning_item_answers'>
export type Quiz = Tables<'quizzes'>
export type QuizItem = Tables<'quiz_items'>
export type PracticeSpine = Tables<'practice_spines'>
export type SpineStage = Tables<'spine_stages'>

// ---------- learner: content ----------

export async function fetchPublishedItems(): Promise<LearningItem[]> {
  const { data, error } = await supabase
    .from('learning_items')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchItemsByIds(ids: string[]): Promise<LearningItem[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('learning_items').select('*').in('id', ids)
  if (error) throw error
  return data || []
}

export async function fetchItem(id: string): Promise<LearningItem | null> {
  const { data, error } = await supabase
    .from('learning_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------- learner: quizzes & spines ----------

export async function fetchPublishedQuizzes(): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchQuiz(id: string): Promise<Quiz | null> {
  const { data, error } = await supabase.from('quizzes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchQuizItems(quizId: string): Promise<QuizItem[]> {
  const { data, error } = await supabase
    .from('quiz_items')
    .select('*')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchPublishedSpines(): Promise<PracticeSpine[]> {
  const { data, error } = await supabase
    .from('practice_spines')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchSpine(id: string): Promise<PracticeSpine | null> {
  const { data, error } = await supabase
    .from('practice_spines')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchSpineStages(spineId: string): Promise<SpineStage[]> {
  const { data, error } = await supabase
    .from('spine_stages')
    .select('*')
    .eq('spine_id', spineId)
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

// ---------- learner: sessions & attempts ----------

export async function startSession(
  itemId: string | null,
  opts?: {
    lane?: 'specific' | 'statements'
    quizId?: string
    spineId?: string
    generatedCaseId?: string
  },
): Promise<PracticeSession> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .insert({
      item_id: itemId,
      lane: opts?.lane ?? 'specific',
      quiz_id: opts?.quizId ?? null,
      spine_id: opts?.spineId ?? null,
      generated_case_id: opts?.generatedCaseId ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export type SubmitResult = {
  attempt_id: string
  feedback: MatrixFeedback
  overall_explanation_md: string | null
  cell_score: number
  cell_max: number
  tx_correct: number
  tx_total: number
  duplicate: boolean
}

export async function submitAttempt(input: {
  item_id?: string
  generated_case_id?: string
  stage_index?: number
  session_id: string | null
  client_submission_id: string
  answers: MatrixResponse
  duration_ms?: number
}): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke('practice-submit', { body: input })
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message.
    const ctx = (error as any).context as Response | undefined
    let message = error.message || 'Submission failed'
    try {
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.error) message = body.error
      }
    } catch {
      /* keep the generic message */
    }
    throw new Error(message)
  }
  return data as SubmitResult
}

export async function fetchAttempts(limit = 50): Promise<Attempt[]> {
  const { data, error } = await supabase
    .from('attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function fetchAttempt(id: string): Promise<Attempt | null> {
  const { data, error } = await supabase.from('attempts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// ---------- learner: generated cases ----------

export type GeneratedCaseRow = Tables<'generated_cases'>

export async function generateCase(family = 'sole_trader', seed?: number): Promise<{
  case_id: string
  seed: number
  title: string
}> {
  const { data, error } = await supabase.functions.invoke('case-generate', {
    body: seed !== undefined ? { family, seed } : { family },
  })
  if (error) {
    const ctx = (error as any).context as Response | undefined
    let message = error.message || 'Generation failed'
    try {
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.error) message = body.error
      }
    } catch {
      /* keep the generic message */
    }
    throw new Error(message)
  }
  return data as { case_id: string; seed: number; title: string }
}

export async function fetchGeneratedCase(id: string): Promise<GeneratedCaseRow | null> {
  const { data, error } = await supabase
    .from('generated_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------- learner: review states ----------

export type ReviewState = Tables<'review_states'>

export async function fetchReviewStates(): Promise<ReviewState[]> {
  const { data, error } = await supabase
    .from('review_states')
    .select('*')
    .order('due_at', { ascending: true })
  if (error) throw error
  return data || []
}

// ---------- learner: error log ----------

export async function fetchErrors(onlyOpen: boolean): Promise<ErrorLogEntry[]> {
  let q = supabase.from('error_log').select('*').order('created_at', { ascending: false })
  if (onlyOpen) q = q.eq('resolved', false)
  const { data, error } = await q.limit(200)
  if (error) throw error
  return data || []
}

export async function setErrorResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await supabase.from('error_log').update({ resolved }).eq('id', id)
  if (error) throw error
}

// ---------- profile ----------

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateDisplayName(name: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Not signed in')
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('user_id', uid)
  if (error) throw error
}

// ---------- editor: builder ----------

export async function fetchAllItems(): Promise<LearningItem[]> {
  const { data, error } = await supabase
    .from('learning_items')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchItemAnswers(itemId: string, version: number): Promise<ItemAnswers | null> {
  const { data, error } = await supabase
    .from('learning_item_answers')
    .select('*')
    .eq('item_id', itemId)
    .eq('version', version)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createDraftItem(input: {
  kind: string
  title: string
  config: Json
}): Promise<LearningItem> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('learning_items')
    .insert({ ...input, status: 'draft', created_by: userData.user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateItem(
  id: string,
  patch: Partial<
    Pick<
      LearningItem,
      | 'title'
      | 'prompt_md'
      | 'config'
      | 'status'
      | 'version'
      | 'paper'
      | 'syllabus_area'
      | 'topic'
      | 'tags'
      | 'difficulty'
      | 'source_slug'
    >
  >,
): Promise<LearningItem> {
  const { data, error } = await supabase
    .from('learning_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertItemAnswers(input: {
  item_id: string
  version: number
  answer_key: Json
  overall_explanation_md: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('learning_item_answers')
    .upsert(input, { onConflict: 'item_id,version' })
  if (error) throw error
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('learning_items').delete().eq('id', id)
  if (error) throw error
}

// ---------- editor: quizzes ----------

export async function fetchAllQuizzes(): Promise<Quiz[]> {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createQuiz(title: string): Promise<Quiz> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('quizzes')
    .insert({ title, status: 'draft', created_by: userData.user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateQuiz(
  id: string,
  patch: Partial<Pick<Quiz, 'title' | 'description_md' | 'paper' | 'topic' | 'difficulty' | 'status' | 'est_minutes'>>,
): Promise<Quiz> {
  const { data, error } = await supabase.from('quizzes').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await supabase.from('quizzes').delete().eq('id', id)
  if (error) throw error
}

// Replace a quiz's ordered membership atomically enough for a single editor:
// delete then insert (positions are 0..n-1; the unique constraint is deferred).
export async function setQuizItems(quizId: string, itemIds: string[]): Promise<void> {
  const { error: delError } = await supabase.from('quiz_items').delete().eq('quiz_id', quizId)
  if (delError) throw delError
  if (itemIds.length === 0) return
  const { error } = await supabase
    .from('quiz_items')
    .insert(itemIds.map((item_id, position) => ({ quiz_id: quizId, item_id, position })))
  if (error) throw error
}

// ---------- local draft persistence (survive refresh; PRD §B.5) ----------

export type LocalDraft = {
  answers: MatrixResponse
  session_id: string | null
  client_submission_id: string
  started_at: number
}

const draftKey = (itemId: string, userId: string) => `practice-draft:${userId}:${itemId}`

export function loadLocalDraft(itemId: string, userId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(itemId, userId))
    return raw ? (JSON.parse(raw) as LocalDraft) : null
  } catch {
    return null
  }
}

export function saveLocalDraft(itemId: string, userId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(draftKey(itemId, userId), JSON.stringify(draft))
  } catch {
    /* storage full/blocked — drafts are best-effort */
  }
}

export function clearLocalDraft(itemId: string, userId: string): void {
  try {
    localStorage.removeItem(draftKey(itemId, userId))
  } catch {
    /* ignore */
  }
}
