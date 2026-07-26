// Next-best-action (PRD §17.2): one recommendation, priority-ordered.
// Pure and deterministic so it can be unit tested.
import type { SkillDef } from './diagnose.ts'
import type { MasteryResult } from './mastery.ts'

export type Recommendation = {
  label: string
  description: string
  href: string
}

export function recommendNext(input: {
  skills: SkillDef[]
  mastery: Record<string, MasteryResult>
  openErrorItemIds: Array<{ item_id: string; count: number; title: string }>
  dueReviews: Array<{ item_id: string; title: string }>
  caseAttempted: boolean
  baseCaseHref: string | null
}): Recommendation {
  // 1. Complete an open repair loop: a diagnosed skill in needs_repair.
  const broken = input.skills.find((s) => input.mastery[s.id]?.state === 'needs_repair')
  if (broken && broken.repair_item_id) {
    return {
      label: `Repair: ${broken.label}`,
      description:
        'Your last case run failed at this step. Repair it with a focused drill, then prove it on an altered case.',
      href: `/practice/run/${broken.repair_item_id}`,
    }
  }
  // 2. Retest a repaired skill in an altered context.
  const untransferred = input.skills.find(
    (s) => input.mastery[s.id]?.state === 'independent_success',
  )
  if (untransferred) {
    return {
      label: 'Prove it: altered case',
      description: `${untransferred.label} succeeded on the base case — transfer it to changed numbers with a generated variant.`,
      href: '/practice/statements',
    }
  }
  // 3. Clear recurring drill errors.
  if (input.openErrorItemIds.length > 0) {
    const top = input.openErrorItemIds[0]
    return {
      label: `Clear ${top.count} open error${top.count === 1 ? '' : 's'}: ${top.title}`,
      description: 'Unresolved misconceptions compound — rerun the drill they came from.',
      href: `/practice/run/${top.item_id}`,
    }
  }
  // 4. Due spaced reviews.
  if (input.dueReviews.length > 0) {
    return {
      label: `Review due: ${input.dueReviews[0].title}`,
      description: 'This skill is scheduled for review today — a quick pass keeps it warm.',
      href: `/practice/run/${input.dueReviews[0].item_id}`,
    }
  }
  // 5. The integration spine, if never attempted.
  if (!input.caseAttempted && input.baseCaseHref) {
    return {
      label: 'Start the sole-trader case',
      description:
        'The integrated case is the spine of the method: trial balance to finished statements.',
      href: input.baseCaseHref,
    }
  }
  // 6. Otherwise: assessment.
  return {
    label: 'Take a timed mock',
    description: 'Everything is green — check exam readiness under the clock.',
    href: '/practice/mock',
  }
}
