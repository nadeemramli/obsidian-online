# Connecting Claude (Cowork / Claude Code) to the vault

The vault exposes an MCP server as a Supabase Edge Function:

```
https://placjyxifdtvlkjyztnx.supabase.co/functions/v1/vault-mcp
```

Tools: `list_notes`, `get_note`, `search_notes`, `create_note`, `update_note`,
`delete_note`, `save_image`, `list_images`.

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
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_note","arguments":{"title":"...","content":"...","folder":"..."}}}
```

Available tools:
- `list_notes {limit?, folder?}` — list notes, optionally within one folder
- `get_note {slug}` — full markdown of one note
- `search_notes {query, limit?}` — search titles, content and folder names
- `create_note {title, content, folder?}` — create a note (unique slug auto-generated)
- `update_note {slug, title?, content?, folder?}` — edit or move a note
- `delete_note {slug}` — delete (irreversible; ask me before using)
- `save_image {name, base64, content_type?}` — upload an image; returns the `![[name]]` link to use in notes
- `list_images {limit?}` — list stored images

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

# <Concept name>

<Clear markdown summary of the concept.>

> [!note] Key idea
> <The single most important takeaway.>
```

Conventions:
- **Folders**: file every note with `folder: "Books/<book title>"` (subfolders per part/section are fine, e.g. `"Books/Stats 101/Part 2"`). Keep one folder per book.
- **Wikilinks**: `[[Other Note Title]]` to related concepts — `search_notes` first so links hit real notes; linking to a not-yet-created note is fine too (it becomes a red link I can click to create).
- **Images**: when I paste a screenshot, upload it with `save_image` (pick a descriptive filename like `clt-simulation.png`), then place the returned `![[clt-simulation.png]]` in the note where it belongs. Use `![[name.png|400]]` to control display width. Reuse existing images via `list_images` instead of re-uploading.
- **Emphasis**: `==highlighted text==` for crucial phrases, `#topic` inline tags, `> [!warning]` / `> [!tip]` / `> [!example]` callouts for pitfalls, tips and worked examples.
- **Structure**: tables and code blocks freely (GitHub-flavored markdown); `![[Another Note]]` to embed a whole note inline.

Rules:
- One concept per note, titled by the concept (e.g. "Bayes Theorem") — book and chapter live in the frontmatter, the folder groups the book.
- Before creating, `search_notes` for the concept; if a note exists, enrich it with `update_note` instead of duplicating.
- Never `delete_note` without asking me first.
- After saving, report the note's title, slug and folder.

---

## Notes on security

- The vault token bypasses login (the function uses the service role behind
  RLS-locked token checks). Treat it like a password. Rotate by inserting a new
  row into `public.mcp_tokens` and deleting the old one.
- The anon key alone grants nothing (RLS denies anonymous access); it only
  satisfies the platform JWT gate on the edge function.
