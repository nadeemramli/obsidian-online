# FFA Integrated Practice Engine — implementation notes

Reconciliation record required by the PRD (v1.1, §20 Phase 0 / §26). The PRD is the
product spec; `docs/PRD.md` documents the platform baseline it extends. This note
maps PRD concepts to the as-built system and records scope decisions per ticket.

## Concept → as-built mapping

| PRD concept | As-built |
|---|---|
| Question-kind registry | `src/lib/practice/registry.tsx` (client) + kind dispatch in `practice-submit` edge function (server) |
| `AnswerSpec` | `learning_item_answers` (editor-only RLS, versioned `(item_id, version)`) |
| Attempt + feedback snapshot | `attempts` (immutable, version-pinned, self-contained snapshot) |
| `practice_spines` / `spine_stages` | Added as specified (additive migration) |
| `practiceLane` | `practice_sessions.lane` (`specific` \| `statements`) |
| Case snapshot (`GeneratedCase`) | MVP golden cases are fixed, hand-verified content: the versioned `learning_items` configs *are* the immutable snapshot (attempts pin `item_version`). Seeded generation is Phase 2+ and will add a real snapshot store. |
| Diagnostic graph | `practice_spines.config.skills[]` — per skill: root cells (stage/rows), downstream cells, repair item, label |
| `DiagnosticEvent` (root / downstream_carried / independent) | Computed deterministically client-side from the learner's own stored feedback snapshots at case-results time (no new server surface; snapshots already belong to the learner) |
| Repair session | Bridge from a diagnosed root skill to an existing registered Specific Practice item (`repair_item_id`) |
| Altered retest | A sibling published spine (`config.retest_spine_id`) authored as variant B with changed numbers, hand-verified |
| Official marking | Existing server-side per-stage evaluation (independent cells, no own-figure rule) — unchanged |

## Ticket 1 delivered

- Practice hub split into two lane cards (Specific Practice / Financial Statement Practice).
- `lane` recorded on sessions; quiz/spine ids link sessions to compositions.
- Quiz authoring: create, add/reorder/remove published items, publish/unpublish, in the builder.
- Quiz running: sequential stage-per-item run in one session, per-item server marking, end summary.
- All existing kinds, attempts, feedback snapshots, error log and review states untouched.

## Ticket 2 delivered

- `statement_prep` kind: numeric statement/extract construction; one amount cell per line;
  strict amount parsing (shared with journal amounts), optional per-row tolerance; rows carry
  display metadata (`indent`, `style: line|subtotal|total`). Scorer emits the standard
  self-contained feedback snapshot, so results/history/error log needed no changes.
- Golden case (Family 1, sole trader): **Fernleaf Traders** — original fictional entity.
  3 stages: (1) six reporting-date adjustment journals (`journal_entry`), (2) statement of
  profit or loss (`statement_prep`), (3) statement of financial position (`statement_prep`).
  Altered variant B (Fernleaf, 20X9) retests the same six skills with changed numbers.
  Truth models hand-computed and locked by unit tests asserting the PRD §11.4 invariants
  (TB balances, SOFP balances, profit and closing capital reconcile, COS arithmetic).
- Case workspace: stage tabs, per-stage submit through the existing engine, case results
  aggregating stage attempts with root / downstream-carried / independent classification
  (earliest-failure precedence per PRD §7.4), repair launch, altered-retest launch.

## Seeded generation delivered (PRD §11)

- `sole-trader-v1` generator: server-only module inside the `case-generate` edge
  function (never in the client bundle — a learner must not be able to recompute
  keys from the seed). Deterministic mulberry32 PRNG; constructive sampling so the
  accounting identities hold by design, then a full §11.4 invariant assertion pass;
  deterministic resampling on constraint misses; original fictional entities only.
- Persistence: `generated_cases` (owner-read RLS; written by the function via the
  service role after JWT verification) + `generated_case_keys` (RLS enabled with
  **no policies** — deny-all except service role, stricter than authored keys).
  Seed stored on the case for exact replay (same seed → identical case, verified
  live through the deployed function).
- `practice-submit` v4 accepts either `item_id` or `generated_case_id + stage_index`;
  attempts/error-log rows carry the generated target (`item_id` now nullable with a
  target check constraint). Review-state updates apply to authored items only.
- UI: "Generate a fresh case" in the sole-trader family; the case runner handles
  both sources; results offer "generate an altered case" — an infinite altered-
  retest supply. Property tests sweep 300 consecutive seeds through the full
  invariant gate; perfect-run scoring is verified against generated keys.

## Deliberate deferrals (per PRD phases 2–5)

- Learn/Practice/Exam delivery modes, timers, flagging, auto-submit (Learn behavior only).
- Confidence capture, mastery state machine, recommendations, analytics dashboards.
- Skill taxonomy tables (skills live in spine config for the two authored cases).
- Full mock assembly; families 2–6 content.
- Left-pane case workspace layout: MVP keeps each stage self-contained (scenario above the
  inputs) so stages remain individually reusable; dedicated split workspace comes with
  Phase 3 exam mechanics.

## Assumptions

- Repair items map to the closest existing published drill (Activity 2 extended with a
  closing-inventory row, published as its version 2).
- Diagnosis over the learner's own snapshots is acceptable client-side; official marks
  remain server-computed and unchanged.
- IFRS 18 / syllabus-version metadata: items carry paper/syllabus fields already;
  `syllabusVersion` as configuration arrives with the generation phase.
