import type { Page, Route } from '@playwright/test'
import { SUPABASE_URL } from '../src/lib/config'
import {
  scoreMatrix,
  scoreJournal,
  scoreStatement,
  type MatrixConfig,
  type MatrixAnswerKey,
  type JournalConfig,
  type JournalAnswerKey,
  type StatementConfig,
  type StatementAnswerKey,
} from '../src/lib/practice/scoring.ts'
import {
  DUAL_EFFECT_ITEM,
  DUAL_EFFECT_KEY,
  DUAL_EFFECT_OVERALL,
} from './practice-fixture'
import { MUGG_ITEM, MUGG_KEY, MUGG_OVERALL } from './journal-fixture'
import { fernleafMockData } from './fernleaf-fixture'
import { generateSoleTraderCase } from '../supabase/functions/case-generate/generator.ts'

export const TEST_EMAIL = 'reader@vault.test'
export const TEST_PASSWORD = 'test-password-123'
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'

export type MockNote = {
  id: string
  title: string
  slug: string
  content: string
  folder: string
  created_at: string
  updated_at: string
}

export type MockItem = typeof DUAL_EFFECT_ITEM
export type MockAttempt = Record<string, any>

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
}

// 1x1 transparent PNG for storage image responses.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  })
}

function makeUser(email: string) {
  const now = new Date().toISOString()
  return {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
  }
}

function makeSession(email: string) {
  return {
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: 'mock-refresh-token',
    user: makeUser(email),
  }
}

/**
 * In-memory stand-in for the Supabase backend (GoTrue auth, PostgREST tables,
 * Storage `screenshots` bucket, and the `practice-submit` edge function),
 * installed at the network layer with page.route(). The real app code runs
 * unmodified in a real browser; only HTTP responses are simulated.
 *
 * RLS is simulated where the app depends on it: learners only see published
 * learning items and never see learning_item_answers.
 */
export class MockSupabase {
  notes: MockNote[] = []
  role: 'learner' | 'content_editor' | 'admin' = 'learner'
  displayName: string | null = null
  items: MockItem[] = []
  answers: Array<{
    item_id: string
    version: number
    answer_key: MatrixAnswerKey
    overall_explanation_md: string | null
  }> = []
  sessions: Array<Record<string, any>> = []
  attempts: MockAttempt[] = []
  errors: Array<Record<string, any>> = []
  quizzes: Array<Record<string, any>> = []
  quizItems: Array<Record<string, any>> = []
  spines: Array<Record<string, any>> = []
  spineStages: Array<Record<string, any>> = []
  generatedCases: Array<Record<string, any>> = []
  generatedKeys: Array<{ case_id: string; keys: any[] }> = []
  // Fixed default seed keeps generation-dependent tests deterministic.
  generateSeed = 12345
  private seq = 0

  seed(items: Array<{ title: string; slug: string; content: string; folder?: string }>) {
    for (const it of items) {
      this.seq += 1
      const t = new Date(Date.UTC(2026, 0, 1, 0, this.seq)).toISOString()
      this.notes.push({ id: `seed-${this.seq}`, created_at: t, updated_at: t, folder: '', ...it })
    }
  }

  // Seed the Dual Effect activity (mirrors the production seed migration).
  seedPractice() {
    this.items.push(JSON.parse(JSON.stringify(DUAL_EFFECT_ITEM)))
    this.answers.push({
      item_id: DUAL_EFFECT_ITEM.id,
      version: 1,
      answer_key: DUAL_EFFECT_KEY,
      overall_explanation_md: DUAL_EFFECT_OVERALL,
    })
  }

  // Seed the Fernleaf sole-trader case (spine A + retest spine B stub).
  seedFernleaf() {
    const data = fernleafMockData()
    this.items.push(...(JSON.parse(JSON.stringify(data.items)) as MockItem[]))
    this.answers.push(...(JSON.parse(JSON.stringify(data.answers)) as any[]))
    this.spines.push(...JSON.parse(JSON.stringify(data.spines)))
    this.spineStages.push(...JSON.parse(JSON.stringify(data.stages)))
  }

  // Seed the Mugg journal_entry activity (Activity 8).
  seedJournal() {
    this.items.push(JSON.parse(JSON.stringify(MUGG_ITEM)) as unknown as MockItem)
    this.answers.push({
      item_id: MUGG_ITEM.id,
      version: 1,
      answer_key: MUGG_KEY as unknown as MatrixAnswerKey,
      overall_explanation_md: MUGG_OVERALL,
    })
  }

  get isEditor() {
    return this.role === 'content_editor' || this.role === 'admin'
  }

  async install(page: Page) {
    await page.route(`${SUPABASE_URL}/**`, (route) => this.handle(route))
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const path = url.pathname

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS })
    }

    // ---- Auth (GoTrue) ----
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = req.postDataJSON() as { email: string; password: string }
      if (body.email === TEST_EMAIL && body.password === TEST_PASSWORD) {
        return json(route, makeSession(body.email))
      }
      return json(
        route,
        {
          code: 400,
          error_code: 'invalid_credentials',
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          msg: 'Invalid login credentials',
        },
        400,
      )
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS })
    if (path === '/auth/v1/signup') return json(route, { user: makeUser(TEST_EMAIL), session: null })
    if (path === '/auth/v1/user') return json(route, makeUser(TEST_EMAIL))

    // ---- PostgREST: notes table ----
    if (path === '/rest/v1/notes') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const idFilter = param(url, 'id')
      const slugFilter = param(url, 'slug')

      if (method === 'GET') {
        let rows = this.notes.slice()
        if (idFilter) rows = rows.filter((n) => n.id === idFilter)
        if (slugFilter) rows = rows.filter((n) => n.slug === slugFilter)
        if ((url.searchParams.get('order') || '').startsWith('updated_at.desc')) {
          rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        }
        return this.reply(route, rows, wantsObject)
      }

      if (method === 'POST') {
        const body = req.postDataJSON() as Partial<MockNote>
        this.seq += 1
        const now = new Date().toISOString()
        const note: MockNote = {
          id: `note-${this.seq}`,
          title: body.title || '',
          slug: body.slug || '',
          content: body.content || '',
          folder: body.folder || '',
          created_at: now,
          updated_at: now,
        }
        this.notes.push(note)
        return this.reply(route, [note], wantsObject, 201)
      }

      if (method === 'PATCH') {
        const body = req.postDataJSON() as Partial<MockNote>
        const rows = this.notes.filter((n) => n.id === idFilter)
        for (const n of rows) {
          Object.assign(n, body)
          n.updated_at = new Date().toISOString()
        }
        return this.reply(route, rows, wantsObject)
      }

      if (method === 'DELETE') {
        this.notes = this.notes.filter((n) => n.id !== idFilter)
        return route.fulfill({ status: 204, headers: CORS })
      }
    }

    // ---- PostgREST: profiles ----
    if (path === '/rest/v1/profiles') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const profile = {
        user_id: TEST_USER_ID,
        role: this.role,
        display_name: this.displayName,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      }
      if (method === 'GET') {
        const uid = param(url, 'user_id')
        const rows = !uid || uid === TEST_USER_ID ? [profile] : []
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'PATCH') {
        const body = req.postDataJSON() as { display_name?: string }
        if (typeof body.display_name === 'string') this.displayName = body.display_name
        return this.reply(route, [{ ...profile, display_name: this.displayName }], wantsObject)
      }
    }

    // ---- PostgREST: learning_items (RLS: learners see published only) ----
    if (path === '/rest/v1/learning_items') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const idFilter = param(url, 'id')
      const statusFilter = param(url, 'status')

      if (method === 'GET') {
        let rows = this.items.slice()
        if (!this.isEditor) rows = rows.filter((i) => i.status === 'published')
        if (idFilter) rows = rows.filter((i) => i.id === idFilter)
        if (statusFilter) rows = rows.filter((i) => i.status === statusFilter)
        rows = applyOrder(rows, url)
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'POST') {
        if (!this.isEditor) return json(route, { message: 'permission denied', code: '42501' }, 403)
        const body = req.postDataJSON() as Partial<MockItem>
        this.seq += 1
        const now = new Date().toISOString()
        const item = {
          id: `item-${this.seq}`,
          kind: 'matrix_select',
          title: '',
          prompt_md: '',
          source_slug: null,
          paper: null,
          syllabus_area: null,
          topic: null,
          tags: [],
          difficulty: null,
          status: 'draft',
          version: 1,
          config: {},
          created_by: TEST_USER_ID,
          created_at: now,
          updated_at: now,
          ...body,
        } as unknown as MockItem
        this.items.push(item)
        return this.reply(route, [item], wantsObject, 201)
      }
      if (method === 'PATCH') {
        if (!this.isEditor) return json(route, { message: 'permission denied', code: '42501' }, 403)
        const body = req.postDataJSON() as Partial<MockItem>
        const rows = this.items.filter((i) => i.id === idFilter)
        for (const i of rows) Object.assign(i, body, { updated_at: new Date().toISOString() })
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'DELETE') {
        if (!this.isEditor) return json(route, { message: 'permission denied', code: '42501' }, 403)
        this.items = this.items.filter((i) => i.id !== idFilter)
        return route.fulfill({ status: 204, headers: CORS })
      }
    }

    // ---- PostgREST: learning_item_answers (RLS: editors only) ----
    if (path === '/rest/v1/learning_item_answers') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (!this.isEditor) {
        // RLS returns an empty result set, not an error.
        return this.reply(route, [], wantsObject)
      }
      if (method === 'GET') {
        const itemId = param(url, 'item_id')
        const version = param(url, 'version')
        let rows = this.answers.slice()
        if (itemId) rows = rows.filter((a) => a.item_id === itemId)
        if (version) rows = rows.filter((a) => String(a.version) === version)
        return this.reply(
          route,
          rows.map((a) => ({ ...a, created_at: '2026-07-26T00:00:00.000Z' })),
          wantsObject,
        )
      }
      if (method === 'POST') {
        const body = req.postDataJSON() as any
        const list = Array.isArray(body) ? body : [body]
        for (const entry of list) {
          const existing = this.answers.find(
            (a) => a.item_id === entry.item_id && a.version === entry.version,
          )
          if (existing) Object.assign(existing, entry)
          else this.answers.push(entry)
        }
        return this.reply(route, list, wantsObject, 201)
      }
    }

    // ---- PostgREST: quizzes ----
    if (path === '/rest/v1/quizzes') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const idFilter = param(url, 'id')
      const statusFilter = param(url, 'status')
      if (method === 'GET') {
        let rows = this.quizzes.slice()
        if (!this.isEditor) rows = rows.filter((q) => q.status === 'published')
        if (idFilter) rows = rows.filter((q) => q.id === idFilter)
        if (statusFilter) rows = rows.filter((q) => q.status === statusFilter)
        return this.reply(route, applyOrder(rows, url), wantsObject)
      }
      if (method === 'POST') {
        if (!this.isEditor) return json(route, { message: 'permission denied', code: '42501' }, 403)
        const body = req.postDataJSON() as Record<string, any>
        this.seq += 1
        const quiz = {
          id: `quiz-${this.seq}`,
          title: '',
          description_md: '',
          paper: null,
          syllabus_area: null,
          topic: null,
          tags: [],
          difficulty: null,
          est_minutes: null,
          timed: false,
          status: 'draft',
          created_by: TEST_USER_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...body,
        }
        this.quizzes.push(quiz)
        return this.reply(route, [quiz], wantsObject, 201)
      }
      if (method === 'PATCH') {
        if (!this.isEditor) return json(route, { message: 'permission denied', code: '42501' }, 403)
        const body = req.postDataJSON() as Record<string, any>
        const rows = this.quizzes.filter((q) => q.id === idFilter)
        for (const q of rows) Object.assign(q, body, { updated_at: new Date().toISOString() })
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'DELETE') {
        this.quizzes = this.quizzes.filter((q) => q.id !== idFilter)
        return route.fulfill({ status: 204, headers: CORS })
      }
    }

    // ---- PostgREST: quiz_items ----
    if (path === '/rest/v1/quiz_items') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const quizFilter = param(url, 'quiz_id')
      if (method === 'GET') {
        let rows = this.quizItems.slice()
        if (quizFilter) rows = rows.filter((m) => m.quiz_id === quizFilter)
        rows.sort((a, b) => a.position - b.position)
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'POST') {
        const body = req.postDataJSON()
        const list = Array.isArray(body) ? body : [body]
        this.quizItems.push(...list)
        return this.reply(route, list, wantsObject, 201)
      }
      if (method === 'DELETE') {
        this.quizItems = this.quizItems.filter((m) => m.quiz_id !== quizFilter)
        return route.fulfill({ status: 204, headers: CORS })
      }
    }

    // ---- PostgREST: practice_spines / spine_stages ----
    if (path === '/rest/v1/practice_spines') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const idFilter = param(url, 'id')
      const statusFilter = param(url, 'status')
      if (method === 'GET') {
        let rows = this.spines.slice()
        if (!this.isEditor) rows = rows.filter((s) => s.status === 'published')
        if (idFilter) rows = rows.filter((s) => s.id === idFilter)
        if (statusFilter) rows = rows.filter((s) => s.status === statusFilter)
        return this.reply(route, applyOrder(rows, url), wantsObject)
      }
    }
    if (path === '/rest/v1/spine_stages') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const spineFilter = param(url, 'spine_id')
      if (method === 'GET') {
        let rows = this.spineStages.slice()
        if (spineFilter) rows = rows.filter((s) => s.spine_id === spineFilter)
        rows.sort((a, b) => a.position - b.position)
        return this.reply(route, rows, wantsObject)
      }
    }

    // ---- PostgREST: practice_sessions ----
    if (path === '/rest/v1/practice_sessions') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (method === 'POST') {
        const body = req.postDataJSON() as Record<string, any>
        this.seq += 1
        const session = {
          id: `00000000-0000-4000-9000-${String(this.seq).padStart(12, '0')}`,
          user_id: TEST_USER_ID,
          item_id: body.item_id ?? null,
          quiz_id: body.quiz_id ?? null,
          spine_id: body.spine_id ?? null,
          generated_case_id: body.generated_case_id ?? null,
          lane: body.lane ?? 'specific',
          status: 'in_progress',
          started_at: new Date().toISOString(),
          completed_at: null,
        }
        this.sessions.push(session)
        return this.reply(route, [session], wantsObject, 201)
      }
      if (method === 'PATCH') {
        const idFilter = param(url, 'id')
        const body = req.postDataJSON() as Record<string, any>
        const rows = this.sessions.filter((s) => s.id === idFilter)
        for (const s of rows) Object.assign(s, body)
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'GET') {
        return this.reply(route, this.sessions.slice(), wantsObject)
      }
    }

    // ---- PostgREST: attempts (owner-only in real RLS; single-user mock) ----
    if (path === '/rest/v1/attempts') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (method === 'GET') {
        const idFilter = param(url, 'id')
        const subFilter = param(url, 'client_submission_id')
        let rows = this.attempts.slice()
        if (idFilter) rows = rows.filter((a) => a.id === idFilter)
        if (subFilter) rows = rows.filter((a) => a.client_submission_id === subFilter)
        rows = applyOrder(rows, url)
        return this.reply(route, rows, wantsObject)
      }
    }

    // ---- PostgREST: error_log ----
    if (path === '/rest/v1/error_log') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (method === 'GET') {
        const resolved = param(url, 'resolved')
        let rows = this.errors.slice()
        if (resolved !== null) rows = rows.filter((e) => String(e.resolved) === resolved)
        rows = applyOrder(rows, url)
        return this.reply(route, rows, wantsObject)
      }
      if (method === 'PATCH') {
        const idFilter = param(url, 'id')
        const body = req.postDataJSON() as Record<string, any>
        const rows = this.errors.filter((e) => e.id === idFilter)
        for (const e of rows) Object.assign(e, body)
        return this.reply(route, rows, wantsObject)
      }
    }

    // ---- Edge function: case-generate ----
    if (path === '/functions/v1/case-generate' && method === 'POST') {
      if (!(req.headers()['authorization'] || '').includes('mock-access-token')) {
        return json(route, { error: 'Not signed in' }, 401)
      }
      const body = (req.postDataJSON() as any) ?? {}
      const seed = body.seed ?? this.generateSeed
      const generated = generateSoleTraderCase(seed)
      this.seq += 1
      const caseRow = {
        id: `gencase-${this.seq}`,
        user_id: TEST_USER_ID,
        family: 'sole_trader',
        template: generated.template,
        seed,
        title: generated.title,
        stages: generated.stages,
        config: generated.config,
        created_at: new Date().toISOString(),
      }
      this.generatedCases.push(caseRow)
      this.generatedKeys.push({ case_id: caseRow.id, keys: generated.keys })
      return json(route, { case_id: caseRow.id, seed, title: caseRow.title })
    }

    // ---- PostgREST: generated_cases (owner-only; keys are never served) ----
    if (path === '/rest/v1/generated_cases' && method === 'GET') {
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const idFilter = param(url, 'id')
      let rows = this.generatedCases.slice()
      if (idFilter) rows = rows.filter((c) => c.id === idFilter)
      return this.reply(route, rows, wantsObject)
    }

    // ---- Edge function: practice-submit (server-side evaluation) ----
    if (path === '/functions/v1/practice-submit' && method === 'POST') {
      if (!(req.headers()['authorization'] || '').includes('mock-access-token')) {
        return json(route, { error: 'Not signed in' }, 401)
      }
      const body = req.postDataJSON() as any
      const existing = this.attempts.find(
        (a) => a.client_submission_id === body.client_submission_id,
      )
      if (existing) {
        return json(route, {
          attempt_id: existing.id,
          feedback: existing.feedback,
          overall_explanation_md: existing.feedback?.overall_explanation_md ?? null,
          cell_score: existing.cell_score,
          cell_max: existing.cell_max,
          tx_correct: existing.tx_correct,
          tx_total: existing.tx_total,
          duplicate: true,
        })
      }

      let kind: string
      let config: unknown
      let answerKey: unknown
      let item: MockItem | null = null
      if (body.generated_case_id) {
        const caseRow = this.generatedCases.find((c) => c.id === body.generated_case_id)
        if (!caseRow) return json(route, { error: 'Case not found' }, 404)
        const stage = caseRow.stages[body.stage_index]
        if (!stage) return json(route, { error: 'Stage not found' }, 404)
        const keys = this.generatedKeys.find((k) => k.case_id === caseRow.id)
        kind = stage.kind
        config = stage.config
        answerKey = keys?.keys[body.stage_index]
      } else {
        item = this.items.find((i) => i.id === body.item_id && i.status === 'published') ?? null
        if (!item) return json(route, { error: 'Activity not found' }, 404)
        const key = this.answers.find((a) => a.item_id === item!.id && a.version === item!.version)
        if (!key) return json(route, { error: 'This activity has no answer key yet' }, 500)
        kind = (item as any).kind
        config = item.config
        answerKey = key.answer_key
      }
      const feedback =
        kind === 'journal_entry'
          ? scoreJournal(
              config as unknown as JournalConfig,
              answerKey as unknown as JournalAnswerKey,
              body.answers ?? {},
            )
          : kind === 'statement_prep'
            ? scoreStatement(
                config as unknown as StatementConfig,
                answerKey as unknown as StatementAnswerKey,
                body.answers ?? {},
              )
            : scoreMatrix(config as MatrixConfig, answerKey as MatrixAnswerKey, body.answers ?? {})
      const overall = item
        ? (this.answers.find((a) => a.item_id === item!.id && a.version === item!.version)
            ?.overall_explanation_md ?? null)
        : null
      const storedFeedback = {
        ...feedback,
        overall_explanation_md: overall,
      }
      this.seq += 1
      const attempt = {
        id: `attempt-${this.seq}`,
        session_id: body.session_id ?? null,
        user_id: TEST_USER_ID,
        item_id: item ? item.id : null,
        generated_case_id: body.generated_case_id ?? null,
        stage_index: body.stage_index ?? null,
        item_version: item ? item.version : 1,
        client_submission_id: body.client_submission_id,
        answers: body.answers ?? {},
        feedback: storedFeedback,
        cell_score: feedback.cell_score,
        cell_max: feedback.cell_max,
        tx_correct: feedback.tx_correct,
        tx_total: feedback.tx_total,
        confidence: null,
        duration_ms: body.duration_ms ?? null,
        created_at: new Date().toISOString(),
      }
      this.attempts.push(attempt)
      for (const row of feedback.rows) {
        for (const cell of row.cells) {
          if (cell.ok) continue
          this.seq += 1
          this.errors.push({
            id: `err-${this.seq}`,
            user_id: TEST_USER_ID,
            attempt_id: attempt.id,
            item_id: item ? item.id : null,
            generated_case_id: body.generated_case_id ?? null,
            row_id: row.row_id,
            cell: cell.column_id,
            row_label: row.row_label,
            submitted_label: cell.selected
              ? feedback.option_labels[cell.selected] ?? cell.selected
              : '',
            expected_label: feedback.option_labels[cell.correct] ?? cell.correct,
            paper: item ? item.paper : 'FFA',
            topic: item ? item.topic : 'Sole trader accounts preparation',
            resolved: false,
            created_at: new Date().toISOString(),
          })
        }
      }
      const session = this.sessions.find((s) => s.id === body.session_id)
      if (session) {
        session.status = 'completed'
        session.completed_at = new Date().toISOString()
      }
      return json(route, {
        attempt_id: attempt.id,
        feedback: storedFeedback,
        overall_explanation_md: overall,
        cell_score: feedback.cell_score,
        cell_max: feedback.cell_max,
        tx_correct: feedback.tx_correct,
        tx_total: feedback.tx_total,
        duplicate: false,
      })
    }

    // ---- Storage: screenshots bucket ----
    if (path.startsWith('/storage/v1/object/sign/screenshots/')) {
      const objectPath = path.replace('/storage/v1/object/sign/', '')
      if (method === 'POST') {
        return json(route, { signedURL: `/object/sign/${objectPath}?token=mock-token` })
      }
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG_1X1 })
      }
    }
    if (path.startsWith('/storage/v1/object/screenshots/') && method === 'POST') {
      const objectPath = path.replace('/storage/v1/object/', '')
      return json(route, { Key: objectPath, Id: 'mock-upload-id' })
    }

    return json(route, { message: `mock-supabase: unhandled ${method} ${path}` }, 404)
  }

  // PostgREST returns a bare object (or a PGRST116 error) when the client
  // asked for application/vnd.pgrst.object+json, an array otherwise.
  private reply(route: Route, rows: unknown[], wantsObject: boolean, okStatus = 200) {
    if (!wantsObject) return json(route, rows, okStatus)
    if (rows.length === 1) return json(route, rows[0], okStatus)
    if (rows.length === 0) {
      // maybeSingle() expects null-with-406-suppressed; PostgREST sends 406 +
      // PGRST116 only for >1 rows when object requested; for 0 rows with
      // Accept: vnd.pgrst.object it also errors — supabase-js maybeSingle
      // handles a 406 by resolving data:null. Send the PGRST116 shape.
      return json(
        route,
        {
          code: 'PGRST116',
          details: 'The result contains 0 rows',
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned',
        },
        406,
      )
    }
    return json(
      route,
      {
        code: 'PGRST116',
        details: `The result contains ${rows.length} rows`,
        hint: null,
        message: 'JSON object requested, multiple (or no) rows returned',
      },
      406,
    )
  }
}

function param(url: URL, column: string): string | null {
  const v = url.searchParams.get(column)
  return v && v.startsWith('eq.') ? v.slice(3) : null
}

function applyOrder<T extends Record<string, any>>(rows: T[], url: URL): T[] {
  const order = url.searchParams.get('order')
  if (order) {
    const [col, dir] = order.split('.')
    rows = rows
      .slice()
      .sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')))
    if (dir === 'desc') rows.reverse()
  }
  const limit = url.searchParams.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  return rows
}
