# Online Vault (Obsidian-like)

A private, cloud-synced markdown vault that runs entirely in the browser — no installs.
Write and paste markdown, link notes with `[[wikilinks]]`, see automatic backlinks, search,
and attach screenshots. Built as a client-side SPA on Supabase + Vercel.

## Features
- **Markdown** rendering (GitHub-flavored: tables, code, quotes, etc.)
- **Wikilinks**: `[[Note title]]` and `[[Note title|alias]]`; links to missing notes are flagged and can be created
- **Backlinks**: every note lists what links to it
- **Search** across titles and content
- **Full editor**: create / edit / delete, Write/Preview toggle, screenshot upload
- **Private**: Supabase Auth + Row Level Security; nothing is visible without logging in

## Stack
- Vite + React + TypeScript
- react-router-dom (HashRouter — static hosting, no server rewrites needed)
- react-markdown + remark-gfm + a small remark plugin for wikilinks
- Supabase (Postgres + Auth + Storage), accessed with the anon key + RLS (no backend server)

## Local development
```bash
npm install
npm run dev
```

## E2E tests
The Playwright suite in `e2e/` drives the real app in Chromium against a faithful
in-memory mock of the Supabase HTTP API (GoTrue auth, PostgREST, Storage) installed
at the network layer — deterministic, no secrets, runs in CI (`.github/workflows/e2e.yml`).

```bash
npm run test:e2e        # hermetic suite (mocked backend)
E2E_LIVE_EMAIL=you@example.com E2E_LIVE_PASSWORD=... npm run test:e2e:live   # optional smoke vs real backend
```

Covered: auth (redirects, bad credentials, sign out), note CRUD, GFM rendering,
wikilinks + aliases + missing-note creation flow, backlinks, sidebar search,
unique slugs, screenshot upload and signed-URL image rendering.

## Configuration
Supabase connection lives in `src/lib/config.ts`. The anon key is safe to expose in the
browser — all access is enforced by Row Level Security and login. To point at a different
Supabase project, update `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Database
- Table `public.notes` (id, title, slug, content, timestamps) with an `updated_at` trigger
- RLS: authenticated users have full access; anonymous blocked
- Storage bucket `screenshots` (private; signed URLs at render time)
- Helper `public.add_note(title, content)` inserts a note with an auto-generated unique slug

## Deploy
Framework preset: **Vite**. Build command `npm run build`, output `dist`. Deployed on Vercel.
