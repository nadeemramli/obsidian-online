# Product Requirements — Online Vault + ACCA Learning System

> **Provenance.** Before 2026-07, product decisions lived implicitly in `README.md`,
> `CLAUDE.md`, and the vault's `Meta` conventions note — there was no standalone PRD.
> This document consolidates those existing decisions (Part A, unchanged) and adds the
> ACCA learning-system section (Part B). Where the original build-prompt for the
> learning system assumed things the repository contradicted, the repository won;
> deviations are listed in §B.14.

---

## Part A — Existing product (decisions preserved)

### A.1 What it is

A private, cloud-synced markdown vault ("online Obsidian") running entirely in the
browser: Vite + React SPA on Vercel, all data in Supabase (Postgres + Auth + Storage)
accessed with the anon key under Row Level Security. No backend server; the one
privileged surface is the `vault-mcp` Supabase Edge Function (MCP server for Claude).

### A.2 Standing decisions

- **Markdown notes are the source of truth** for knowledge content. Obsidian syntax
  (frontmatter, wikilinks, embeds, callouts, highlights, tags) renders client-side.
- **HashRouter** — static hosting, no server rewrites.
- **Anon key + RLS** is the security model; the service role key never reaches the browser.
- **Formulas are Unicode plain text** — never LaTeX / single-`$` math (currency-heavy notes).
- **E2E = Playwright** against a network-layer mock of the Supabase API
  (`e2e/mock-supabase.ts`); the mock must track every new Supabase call.
- Vault content: ACCA Knowledge Level — FBT, FFA, FMA chapter notes, Worked Examples,
  Visuals, a Formula Library, and the integrated "How a Business Works" course built
  around the fictional **Mare & Co**.

---

## Part B — ACCA practice & quiz system

### B.1 Problem statement

The vault teaches (299 curated notes) but cannot *train*: there is no way to practice,
get feedback, track errors, or know which topics need review before the FBT/FFA/FMA
exams. Reading ≠ retrieval. The product needs a practice layer that reuses the vault's
explanatory content instead of duplicating it.

### B.2 Target learner

The vault owner today (single-user instance), structurally any self-studying ACCA
Knowledge Level candidate tomorrow. Assumes desktop for authoring, desktop + phone
for practice.

### B.3 Scope of this slice / non-goals

**In:** one fully working question type (`matrix_select`, the double-entry table),
practice runner, attempt persistence + history, error log, a quiz/question builder for
editors, roles + RLS, the seeded **Activity 1: Dual effect**.

**Out (roadmap, not built):** payments, teams/orgs, marketplace, AI-generated
questions, live multiplayer, proctoring, certificates, full syllabus ingestion,
adaptive algorithms, other question types (registry slots exist), timed mocks,
`exam_blueprints` (schema reserved in roadmap only), analytics backend (events are
*named* in B.12 but no collector exists yet).

### B.4 User roles

| Role | Grants |
|---|---|
| `learner` | Practice published content; read/write **own** sessions, attempts, error log, review state, profile |
| `content_editor` | Everything a learner has + create/edit/publish learning content; **no** user administration, **no** access to other users' learner data |
| `admin` | Everything an editor has + manage user roles |

Rules: new accounts default to `learner` (trigger on `auth.users`). Roles live in
`public.profiles.role`, which the owning user **cannot** update (column-level grant:
users may update only `display_name` on their own row; only `admin` updates roles).
Authorization checks never read user-editable metadata.

### B.5 Primary journeys

1. **Practice:** dashboard → open activity → answer 16 cells (progress shown, drafts
   survive refresh via localStorage) → submit once (idempotent) → server evaluates →
   row-level feedback + corrected journal + explanations → retry or review source note.
2. **Review history:** history page lists attempts with scores; each opens the stored
   feedback snapshot (interpretable even after the question was edited, via `item_version`).
3. **Fix weaknesses:** error log lists every wrong cell (misconception vs expected), can be
   marked resolved.
4. **Author:** editor opens builder → creates/edits a matrix question (rows, option
   set, correct debit/credit per row, per-row explanations) with live preview →
   validation gate → publish.

### B.6 Information architecture (routes)

| Route | Page | Access |
|---|---|---|
| `#/practice` | Learning dashboard: stats, activities, continue | learner+ |
| `#/practice/run/:itemId` | Practice runner | learner+ |
| `#/practice/attempt/:attemptId` | Stored result view | owner |
| `#/practice/history` | Attempt history | owner |
| `#/practice/errors` | Error log | owner |
| `#/builder` | Content list (drafts + published) | editor/admin |
| `#/builder/item/:itemId` | Question editor + live preview | editor/admin |
| `#/settings` | Profile (display name, role badge) + password | self |
| `#/reset` | Password-reset landing (from email link) | public |

### B.7 Question-type model

A **registry** keyed by `kind` (`src/lib/practice/registry.tsx`) maps each question
type to its runner component, builder component, config validator, and scorer.
Registered kinds: `matrix_select` and `journal_entry` (financial-statement
preparation part 1: debit account + credit account + numeric amount per item, a
markdown scenario such as a trial balance, strict amount parsing with optional
per-row tolerance — 3 scorable cells per item). Both kinds emit the same
self-contained feedback snapshot, so results rendering, history, and the error
log are kind-agnostic. Future kinds (single/multi MCQ, numeric, short text,
matching, ordering, statement-line preparation, scenario) plug in without
touching the runner page.

`matrix_select` config (JSONB, validated at runtime — no executable code allowed):

```
{ columns: [{id, label}...2],            // Debit, Credit
  rows:    [{id, label}...],             // stable ids — reordering can't corrupt keys
  options: [{id, label}...],             // shared option set (per-column sets later)
  note_md?: string }                     // optional callout under the prompt
```

The **answer key is not part of config**: `{ rows: {rowId: {debit, credit,
explanation_md}}, overall_explanation_md? }` lives in `learning_item_answers`,
unreadable by learners (B.9).

**Versioning:** editing a *published* item bumps `learning_items.version` and writes a
new `learning_item_answers` row keyed `(item_id, version)`. Attempts pin
`item_version`, so historical attempts keep their original meaning.

### B.8 Content ↔ learner-state boundary

| Content (editor-owned) | Learner state (user-owned) |
|---|---|
| `learning_items` (+ `learning_item_answers`), `quizzes`, `quiz_items` | `profiles`, `practice_sessions`, `attempts`, `error_log`, `review_states` |

They never share RLS semantics: content is world-readable-when-published /
editor-writable; learner state is strictly `user_id = auth.uid()` for **both**
`USING` and `WITH CHECK`. Markdown notes stay the teaching source: items carry
`source_slug` → vault note; results link "Review source note".

### B.9 Assessment & scoring rules (matrix_select)

- Every debit cell and every credit cell scores independently → Dual effect = 16 points.
- A transaction is fully correct only when both its cells are correct (8 transactions).
- Debit/credit reversal = both cells wrong. No partial credit for reversal.
- Display both scores: `13/16 entries correct` and `5/8 transactions correct`.
- Evaluation is **server-side** in the `practice-submit` Edge Function: the client
  never receives the answer key before a submission is stored. (Post-submit reveal is
  by design — this is formative practice, not secure exam delivery.)
- Idempotency: the client sends a UUID `client_submission_id`; a unique index makes
  retries/double-clicks return the already-stored attempt.
- The attempt stores the learner's answers **and** a feedback snapshot (per-cell
  verdicts, correct options, explanations) — enough to identify the precise
  misconception without re-reading the (possibly edited) key.
- Each wrong cell upserts one `error_log` row (unique per attempt+row+cell — no dupes
  on re-render).
- `review_states` gets a naive schedule after each attempt (perfect → +3 days, else
  +1 day) — honest foundation for spaced review, not a mastery claim.

### B.10 Quiz-builder requirements

- Draft/published/archived lifecycle; publish gate validates: ≥1 row, every row has a
  label, a correct debit + credit chosen from the option set, an explanation, no
  duplicate option ids, non-empty title/prompt.
- Matrix editor: add/edit/delete/reorder rows (stable ids), manage option set, pick
  correct answers per row, per-row + overall explanations, difficulty/paper/topic
  metadata, source-note slug picker.
- Live learner preview (pre-submit and simulated post-submit states).
- Unsaved-change warning; duplication of an item; safe reordering.
- Quizzes (ordered collections of items) exist as schema + minimal list UI; full quiz
  assembly UX is roadmap.

### B.11 Accessibility requirements

Selectors are real `<select>` elements with per-cell `aria-label`
("<transaction> — debit account"); correctness is conveyed by icon + text + border,
never color alone; WCAG AA contrast on the dark theme; visible `:focus-visible`
outline (existing token); result summary is `role="status"` so screen readers hear
it; mobile converts the table to per-transaction cards with identical semantics.

### B.12 Analytics events (named now, no backend yet)

`practice_started`, `question_answer_changed`, `practice_submitted`,
`practice_completed`, `question_answered_correctly`,
`question_answered_incorrectly`, `explanation_viewed`, `source_note_opened`,
`practice_retried`. Free-text answer *content* is never collected. Until an analytics
sink exists these are emitted as no-ops from one module (`src/lib/practice/analytics.ts`).

### B.13 Phased roadmap

1. **Done** — matrix_select end-to-end + builder + roles + RLS; 7 seeded matrix
   activities (Dual effect, period-end adjustments, DEAD CLIC classification,
   books of prime entry, normal balances, error types, cost behaviour).
2. **Done** — `journal_entry` kind + dedicated builder; seeded Mugg FS-preparation
   activity (trial balance scenario, 10 entries, 30 cells).
3. Due-review queue on the dashboard from `review_states`; confidence rating capture.
4. Statement-line numeric kind (FS preparation part 2: build the income statement
   and SOFP from the adjusted figures); MCQ kind; quiz assembly UX; timed quizzes.
5. Interleaving + `exam_blueprints` + readiness reporting; analytics sink.

### B.14 Deviations from the original build-prompt (repository won)

- No pre-existing PRD → this document was created, not amended.
- `tsconfig` has `strict: false` → kept (repo convention; flipping touches all code).
- No unit-test runner / lint config → unit tests are Playwright Node-context specs;
  "lint" = `npx tsc --noEmit`.
- Dark violet design system kept; spec's off-white/teal palette not adopted (its own
  text made it conditional on existing branding). Semantic feedback tokens added.
- No validation library in the tree → small hand-rolled validators (zero new deps).

### B.15 Acceptance criteria

The slice is done when: an authenticated learner opens the seeded Dual effect
activity, completes 16 cells, submits once, gets accurate cell + transaction scores,
row feedback, corrected journal and explanations; the attempt persists under their
user and shows in history; retry creates a new attempt without touching the old one;
an editor can create/edit/preview/publish a matrix question; a learner cannot reach
the builder or read `learning_item_answers`; RLS ownership tests pass; typecheck,
build, and the e2e suite pass.

### B.16 Unresolved decisions

- When multi-user arrives: self-serve signup stays open or invite-only?
- Confidence rating: per-question or per-session? (Schema column reserved on attempts.)
- Whether quiz sessions should snapshot the item *list* at start (currently: yes via
  session → attempts linkage only).
- Analytics sink choice (Supabase table vs external).
