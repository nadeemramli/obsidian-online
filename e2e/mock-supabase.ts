import type { Page, Route } from '@playwright/test'
import { SUPABASE_URL } from '../src/lib/config'

export const TEST_EMAIL = 'reader@vault.test'
export const TEST_PASSWORD = 'test-password-123'

export type MockNote = {
  id: string
  title: string
  slug: string
  content: string
  created_at: string
  updated_at: string
}

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
    id: '00000000-0000-4000-8000-000000000001',
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
 * In-memory stand-in for the Supabase backend (GoTrue auth, PostgREST `notes`
 * table incl. the updated_at trigger, and Storage `screenshots` bucket),
 * installed at the network layer with page.route(). The real app code runs
 * unmodified in a real browser; only HTTP responses are simulated.
 */
export class MockSupabase {
  notes: MockNote[] = []
  private seq = 0

  seed(items: Array<{ title: string; slug: string; content: string }>) {
    for (const it of items) {
      this.seq += 1
      const t = new Date(Date.UTC(2026, 0, 1, 0, this.seq)).toISOString()
      this.notes.push({ id: `seed-${this.seq}`, created_at: t, updated_at: t, ...it })
    }
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
  private reply(route: Route, rows: MockNote[], wantsObject: boolean, okStatus = 200) {
    if (!wantsObject) return json(route, rows, okStatus)
    if (rows.length === 1) return json(route, rows[0], okStatus)
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
