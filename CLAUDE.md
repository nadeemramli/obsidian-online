# Project conventions

## Git workflow
- Commit and push directly to `main`. Do not create feature branches unless
  explicitly asked.

## Commands
- `npm run dev` — dev server
- `npx tsc --noEmit && npm run build` — typecheck + production build
- `npm run test:e2e` — hermetic Playwright E2E suite (mocked Supabase, no secrets)
- `npm run test:e2e:live` — optional smoke vs real backend (needs E2E_LIVE_EMAIL/E2E_LIVE_PASSWORD and egress to *.supabase.co)

## Architecture notes
- Client-only SPA (Vite + React, HashRouter); no backend server. All data access
  goes through Supabase (Postgres + Auth + Storage) with the anon key + RLS.
- Supabase project: `obsidian-online` (`placjyxifdtvlkjyztnx`), config in `src/lib/config.ts`.
- E2E tests mock the Supabase HTTP API at the network layer in `e2e/mock-supabase.ts`;
  keep it in sync when adding new Supabase calls.
