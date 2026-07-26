import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import type { LearningItem, Quiz } from '../../lib/practice/api'
import { ExamSession } from '../../components/practice/ExamSession'

// Exam delivery mode for an authored quiz — a thin wrapper over ExamSession.
export function ExamQuizRunner({
  quiz,
  items,
  sessionId,
}: {
  quiz: Quiz
  items: LearningItem[]
  sessionId: string | null
}) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? 'anon'
  return (
    <ExamSession
      title={quiz.title}
      crumb={
        <>
          <Link to="/practice">Practice</Link> · <Link to="/practice/specific">Specific</Link> ·{' '}
          {quiz.title} · Exam mode
        </>
      }
      entries={items.map((item) => ({ item }))}
      sessionId={sessionId}
      storageKey={`exam:${userId}:${quiz.id}`}
      totalSecondsDefault={quiz.est_minutes ? quiz.est_minutes * 60 : items.length * 120}
      backHref="/practice/specific"
      backLabel="Back to Specific Practice"
    />
  )
}
