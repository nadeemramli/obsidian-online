import { parseFrontmatter } from './frontmatter'
import { mulberry32 } from './graphLayout'
import type { Note } from './notes'

export type QuizCard = {
  prompt: string
  noteTitle: string
  noteSlug: string
  folder: string
  answer: string
}

// Every note section becomes a recall card: the heading is the prompt the
// quizzer reads aloud, the section body is the answer they check against.
export function buildQuizCards(notes: Note[]): QuizCard[] {
  const cards: QuizCard[] = []
  for (const n of notes) {
    const { body } = parseFrontmatter(n.content)
    const lines = body.split('\n')
    let fence = false
    let heading: string | null = null
    let buf: string[] = []

    const flush = () => {
      const answer = buf.join('\n').trim()
      // Skip stubs — a card needs enough substance to verify an answer.
      if (answer.length >= 40) {
        cards.push({
          prompt: heading ?? n.title,
          noteTitle: n.title,
          noteSlug: n.slug,
          folder: n.folder,
          answer,
        })
      }
      buf = []
    }

    for (const line of lines) {
      if (/^(```|~~~)/.test(line.trim())) fence = !fence
      const m = !fence && line.match(/^#{1,6}\s+(.+)$/)
      if (m) {
        flush()
        heading = m[1].replace(/[#*_`=[\]]/g, '').trim()
      } else {
        buf.push(line)
      }
    }
    flush()
  }
  return cards
}

export function shuffleCards(cards: QuizCard[], seed: number): QuizCard[] {
  const rand = mulberry32(seed)
  const out = cards.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
