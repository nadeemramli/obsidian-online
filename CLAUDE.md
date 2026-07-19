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
- Obsidian formatting (frontmatter, callouts, highlights, tags, embeds) is implemented
  client-side in `src/lib/markdown.tsx` + `src/lib/frontmatter.ts`.
- `supabase/functions/vault-mcp/` is an MCP server (Edge Function) for Claude access;
  auth = anon-key JWT + `x-vault-token` checked against RLS-locked `public.mcp_tokens`.
  Redeploy via the Supabase MCP `deploy_edge_function` tool after editing.
- Math: formulas stay Unicode plain text. If typeset math is ever added, use
  remark-math + rehype-katex with `$$…$$` / `\(…\)` ONLY — never enable
  single-`$` inline math: the vault's finance notes are dense with currency `$`
  and a single-dollar parser would mangle them.
