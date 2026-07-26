// Mastery evidence (PRD §12.5), computed deterministically from the learner's
// own attempts — the attempt store IS the evidence store; no separate mutable
// score to drift out of sync. Promotion rules:
//   unseen               — no evidence for the skill's root rows
//   needs_repair         — the most recent evidence failed
//   transfer_success     — clean root rows on an altered/generated case (ever,
//                          with no later failure)
//   independent_success  — clean root rows on the base case only
// A single repeated question can never yield transfer_success: transfer
// evidence only comes from retest/generated sources (PRD §12.5).
import type { MatrixFeedback } from './scoring.ts'
import type { SkillDef } from './diagnose.ts'

export type MasteryStateName =
  | 'unseen'
  | 'needs_repair'
  | 'independent_success'
  | 'transfer_success'

export type AttemptEvidence = {
  item_id: string | null
  generated_case_id: string | null
  stage_index: number | null
  created_at: string
  feedback: MatrixFeedback
}

export type StageSource = { stage: number; source: 'base' | 'transfer' }

export type MasteryResult = {
  state: MasteryStateName
  lastEvidenceAt: string | null
}

// stageMap: authored stage item id -> its stage index + whether that spine is
// the base case or the altered retest. Generated-case attempts carry their own
// stage_index and always count as transfer sources.
export function computeMastery(
  skills: SkillDef[],
  attempts: AttemptEvidence[],
  stageMap: Record<string, StageSource>,
): Record<string, MasteryResult> {
  const sorted = attempts
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const out: Record<string, MasteryResult> = {}
  for (const skill of skills) {
    type Ev = { ok: boolean; source: 'base' | 'transfer'; at: string }
    const evidences: Ev[] = []
    for (const a of sorted) {
      let stage: number | null = null
      let source: 'base' | 'transfer' | null = null
      if (a.generated_case_id != null && a.stage_index != null) {
        stage = a.stage_index
        source = 'transfer'
      } else if (a.item_id && stageMap[a.item_id]) {
        stage = stageMap[a.item_id].stage
        source = stageMap[a.item_id].source
      }
      if (stage === null || source === null) continue
      const rootRows = skill.root.filter((r) => r.stage === stage).flatMap((r) => r.rows)
      if (rootRows.length === 0) continue
      const rows = a.feedback?.rows ?? []
      const relevant = rows.filter((row) => rootRows.includes(row.row_id))
      if (relevant.length === 0) continue
      evidences.push({
        ok: relevant.every((row) => row.row_correct),
        source,
        at: a.created_at,
      })
    }
    if (evidences.length === 0) {
      out[skill.id] = { state: 'unseen', lastEvidenceAt: null }
      continue
    }
    const latest = evidences[0]
    let state: MasteryStateName
    if (!latest.ok) state = 'needs_repair'
    else if (evidences.some((e) => e.ok && e.source === 'transfer')) state = 'transfer_success'
    else state = 'independent_success'
    out[skill.id] = { state, lastEvidenceAt: latest.at }
  }
  return out
}

export const MASTERY_LABELS: Record<MasteryStateName, string> = {
  unseen: 'Not attempted',
  needs_repair: 'Needs repair',
  independent_success: 'Independent',
  transfer_success: 'Transferred',
}
