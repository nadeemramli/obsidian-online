// Earliest-causal-failure diagnosis for spine cases (PRD §7.4 / §12.4).
// Pure and deterministic: runs over the learner's own feedback snapshots.
// A wrong row is classified as a root error, a downstream consequence of a
// failed root skill, or an independent error. Row granularity.
import type { MatrixFeedback } from './scoring.ts'

export type SkillDef = {
  id: string
  label: string
  repair_item_id?: string
  root: Array<{ stage: number; rows: string[] }>
  downstream: Array<{ stage: number; rows: string[] }>
}

export type SpineDiagnosisConfig = {
  skills?: SkillDef[]
  retest_spine_id?: string
  is_retest_variant?: boolean
}

export type Diagnosis = {
  failedSkills: SkillDef[]
  okSkills: SkillDef[]
  rootRows: Set<string>
  downstreamRows: Set<string>
  independent: string[]
}

const cellKey = (stage: number, row: string) => `${stage}:${row}`

export function diagnose(skills: SkillDef[], stageFeedbacks: MatrixFeedback[]): Diagnosis {
  const wrongRows = new Set<string>()
  stageFeedbacks.forEach((fb, stage) => {
    for (const row of fb.rows) {
      if (!row.row_correct) wrongRows.add(cellKey(stage, row.row_id))
    }
  })

  const failedSkills: SkillDef[] = []
  const okSkills: SkillDef[] = []
  const rootRows = new Set<string>()
  const downstreamRows = new Set<string>()

  for (const skill of skills) {
    const failed = skill.root.some((r) => r.rows.some((row) => wrongRows.has(cellKey(r.stage, row))))
    if (failed) {
      failedSkills.push(skill)
      for (const r of skill.root)
        for (const row of r.rows) {
          if (wrongRows.has(cellKey(r.stage, row))) rootRows.add(cellKey(r.stage, row))
        }
      for (const d of skill.downstream)
        for (const row of d.rows) {
          if (wrongRows.has(cellKey(d.stage, row))) downstreamRows.add(cellKey(d.stage, row))
        }
    } else {
      okSkills.push(skill)
    }
  }
  // A row claimed both as someone's root and another's downstream stays a root.
  for (const k of rootRows) downstreamRows.delete(k)
  const independent = Array.from(wrongRows).filter(
    (k) => !rootRows.has(k) && !downstreamRows.has(k),
  )
  return { failedSkills, okSkills, rootRows, downstreamRows, independent }
}
