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

export async function fetchItem(id: string): Promise<LearningItem | null> {
  const { data, error } = await supabase
    .from('learning_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------- learner: sessions & attempts ----------

export async function startSession(itemId: string): Promise<PracticeSession> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .insert({ item_id: itemId })
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
  item_id: string
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
