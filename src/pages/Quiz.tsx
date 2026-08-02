import { useEffect, useMemo, useState } from 'react'
import { useNotes } from '../lib/notesContext'
import { buildQuizCards, shuffleCards } from '../lib/quiz'
import { topFolder } from '../lib/graphLayout'
import { Markdown } from '../lib/markdown'

export default function Quiz() {
  const { notes, loading } = useNotes()
  const [folder, setFolder] = useState('')
  const [seed, setSeed] = useState(1)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  const folders = useMemo(
    () => Array.from(new Set(notes.map((n) => topFolder(n.folder)).filter(Boolean))).sort(),
    [notes],
  )

  const cards = useMemo(() => {
    const pool = folder ? notes.filter((n) => topFolder(n.folder) === folder) : notes
    return shuffleCards(buildQuizCards(pool), seed)
  }, [notes, folder, seed])

  // New deck (filter or reshuffle) hides all answers again.
  useEffect(() => {
    setRevealed(new Set())
  }, [cards])

  function toggle(i: number) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  if (loading) return <div className="page muted">Loading…</div>

  return (
    <div className="quiz-page">
      <div className="quiz-toolbar">
        <h1>Quiz</h1>
        <select
          className="quiz-folder"
          aria-label="Limit to folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setSeed(Date.now() % 100000)}>
          🔀 Shuffle
        </button>
        <span className="muted quiz-count">{cards.length} cards</span>
      </div>
      {cards.length === 0 ? (
        <p className="page muted">
          No cards here yet. Cards are made from the sections of your notes.
        </p>
      ) : (
        <div className="quiz-feed">
          {cards.map((c, i) => (
            <article className="quiz-card" key={`${c.noteSlug}-${i}`}>
              <div className="quiz-progress">
                {i + 1} / {cards.length}
              </div>
              <div className="quiz-body">
                <div className="quiz-kicker">Ask them to explain</div>
                <h2 className="quiz-prompt">{c.prompt}</h2>
                <div className="quiz-source">
                  {c.folder ? `📁 ${c.folder} · ` : ''}
                  {c.noteTitle}
                </div>
                {revealed.has(i) && (
                  <div className="quiz-answer markdown">
                    <Markdown content={c.answer} knownSlugs={knownSlugs} />
                  </div>
                )}
              </div>
              <div className="quiz-actions">
                <button className="btn primary" onClick={() => toggle(i)}>
                  {revealed.has(i) ? 'Hide answer' : 'Show answer'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
