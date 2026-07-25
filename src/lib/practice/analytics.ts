// Analytics events (PRD §B.12). No sink exists yet — events are named and typed
// now so call sites are already correct when a collector is chosen. Free-text
// answer content must never be passed as a property.
export type AnalyticsEvent =
  | 'practice_started'
  | 'question_answer_changed'
  | 'practice_submitted'
  | 'practice_completed'
  | 'question_answered_correctly'
  | 'question_answered_incorrectly'
  | 'explanation_viewed'
  | 'source_note_opened'
  | 'practice_retried'

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props ?? {})
  }
}
