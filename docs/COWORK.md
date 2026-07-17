# Connecting Claude (Cowork / Claude Code) to the vault

The vault exposes an MCP server as a Supabase Edge Function:

```
https://placjyxifdtvlkjyztnx.supabase.co/functions/v1/vault-mcp
```

Tools: `list_notes`, `get_note`, `search_notes`, `create_note`, `update_note`, `delete_note`.

Two headers are required on every request:

| Header | Value |
| ------ | ----- |
| `Authorization` | `Bearer <SUPABASE_ANON_KEY>` (public, in `src/lib/config.ts`) |
| `x-vault-token` | `<VAULT_TOKEN>` (secret — stored in `public.mcp_tokens`, never commit it) |

## Option A — register as an MCP server (Claude Code CLI)

```bash
claude mcp add vault --transport http \
  https://placjyxifdtvlkjyztnx.supabase.co/functions/v1/vault-mcp \
  --header "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  --header "x-vault-token: <VAULT_TOKEN>"
```

## Option B — paste-in prompt for a Cowork session (no MCP config needed)

Paste the prompt below (fill in the two placeholders). Claude will use plain
HTTP calls — every MCP tool is a single POST.

---

You are connected to my personal markdown vault ("online Obsidian") via its HTTP API.

**Endpoint:** `https://placjyxifdtvlkjyztnx.supabase.co/functions/v1/vault-mcp`
**Headers for every request:**
- `Authorization: Bearer <SUPABASE_ANON_KEY>`
- `x-vault-token: <VAULT_TOKEN>`
- `Content-Type: application/json`

The endpoint speaks JSON-RPC 2.0. To call a tool, POST:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_note","arguments":{"title":"...","content":"..."}}}
```

Available tools: `list_notes {limit?}`, `get_note {slug}`, `search_notes {query, limit?}`, `create_note {title, content}`, `update_note {slug, title?, content?}`, `delete_note {slug}`.

First, verify the connection by calling `list_notes` and telling me what's in the vault.

When I give you book excerpts, screenshots, or ask you to take notes, save them with `create_note` using this exact format:

```markdown
---
book: "<book title>"
chapter: <chapter number or name>
tags: [reading, <topic-tags>]
source: VitalSource
created: <today's date, YYYY-MM-DD>
---

# <Note title>

<Summary of the concept in clear markdown.>

> [!note] Key idea
> <The single most important takeaway.>

<Use these Obsidian conventions throughout:>
- `[[Other Note Title]]` to link related notes (check `search_notes` first so links hit existing notes; linking to a not-yet-created note is fine too — it becomes a red link I can click to create)
- `==highlighted text==` for crucial phrases
- `#topic` inline tags
- `> [!warning]` / `> [!tip]` / `> [!example]` callouts for pitfalls, tips, examples
- Tables and code blocks freely (GitHub-flavored markdown)
- `![[Another Note]]` to embed another note's content inline
```

Rules:
- One concept per note, titled by concept (e.g. "Bayes Theorem"), not by chapter number — chapter goes in the frontmatter.
- Before creating, `search_notes` for the concept; if a note already exists, `update_note` to enrich it instead of duplicating.
- After saving, report the note's title and slug.

---

## Notes on security

- The vault token bypasses login (the function uses the service role behind
  RLS-locked token checks). Treat it like a password. Rotate by inserting a new
  row into `public.mcp_tokens` and deleting the old one.
- The anon key alone grants nothing (RLS denies anonymous access); it only
  satisfies the platform JWT gate on the edge function.
