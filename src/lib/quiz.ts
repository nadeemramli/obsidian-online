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

// Structural headings that make bad recall prompts on their own.
const SKIP_HEADINGS =
  /^(overview|introduction|intro|summary|conclusion|recap|references?|resources?|links?|see also|contents?|visual model|diagrams?|flow ?charts?|mind ?maps?|course summary|further reading|appendix|notes?|misc(ellaneous)?)$/i

function cleanHeading(text: string): string {
  return text.replace(/[#*_`=[\]]/g, '').trim()
}

// Length of the *speakable* content — code fences and images can't be
// recalled aloud, so a section that is only a diagram makes no card.
function proseLength(text: string): number {
  return text
    .replace(/```[\s\S]*?(```|$)/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .trim().length
}

function makeAsk(subject: string): string {
  return /\bformulas?\b/i.test(subject) ? `Give the formula: ${subject}` : `Explain: ${subject}`
}

type Section = { heading: string | null; chain: string[]; body: string }

function splitSections(body: string): Section[] {
  const sections: Section[] = []
  const stack: Array<{ level: number; text: string }> = []
  let heading: string | null = null
  let chain: string[] = []
  let buf: string[] = []
  let fence = false

  const flush = () => {
    sections.push({ heading, chain, body: buf.join('\n').trim() })
    buf = []
  }

  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line.trim())) fence = !fence
    const m = !fence && line.match(/^(#{1,6})\s+(.+)$/)
    if (m) {
      flush()
      const level = m[1].length
      const text = cleanHeading(m[2])
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
      // Context comes from sub-heading parents; a lone H1 is the note's own
      // title restated, not useful context.
      const parents = stack.filter((h) => h.level >= 2).map((h) => h.text)
      stack.push({ level, text })
      heading = text
      chain = level >= 2 ? [...parents.slice(-1), text] : [text]
    } else {
      buf.push(line)
    }
  }
  flush()
  return sections
}

// Titled callouts are the most exam-shaped content in a note:
// > [!formula] Cost of sales  →  "Give the formula: Cost of sales"
function calloutCards(n: Note, body: string): QuizCard[] {
  const out: QuizCard[] = []
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*>\s*\[!(\w+)\][+-]?\s+(.+)$/)
    if (!m) continue
    const kind = m[1].toLowerCase()
    const title = cleanHeading(m[2])
    if (kind === 'example' || kind === 'quote' || !title) continue
    const bodyLines: string[] = []
    for (let j = i + 1; j < lines.length && /^\s*>/.test(lines[j]); j++) {
      bodyLines.push(lines[j].replace(/^\s*>\s?/, ''))
    }
    const answer = bodyLines.join('\n').trim()
    if (proseLength(answer) < 15) continue
    out.push({
      prompt: kind === 'formula' ? `Give the formula: ${title}` : makeAsk(title),
      noteTitle: n.title,
      noteSlug: n.slug,
      folder: n.folder,
      answer,
    })
  }
  return out
}

export function buildQuizCards(notes: Note[]): QuizCard[] {
  const cards: QuizCard[] = []
  const seen = new Set<string>()
  const push = (c: QuizCard) => {
    const key = `${c.noteSlug}|${c.prompt}`
    if (!seen.has(key)) {
      seen.add(key)
      cards.push(c)
    }
  }

  for (const n of notes) {
    const { body } = parseFrontmatter(n.content)
    const sections = splitSections(body)

    const headed = sections.filter(
      (s) =>
        s.heading &&
        !SKIP_HEADINGS.test(s.heading) &&
        proseLength(s.body) >= 40 &&
        // A heading that just restates the title adds nothing when the note
        // has more specific sections to ask about.
        !(s.heading.toLowerCase() === n.title.toLowerCase() && sections.length > 2),
    )
    for (const s of headed) {
      push({
        prompt: makeAsk(s.chain.join(' — ')),
        noteTitle: n.title,
        noteSlug: n.slug,
        folder: n.folder,
        answer: s.body,
      })
    }

    // Notes without usable sections fall back to one whole-note card.
    if (headed.length === 0) {
      const whole = body.trim()
      if (proseLength(whole) >= 40) {
        push({
          prompt: makeAsk(n.title),
          noteTitle: n.title,
          noteSlug: n.slug,
          folder: n.folder,
          answer: whole,
        })
      }
    }

    for (const c of calloutCards(n, body)) push(c)
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
