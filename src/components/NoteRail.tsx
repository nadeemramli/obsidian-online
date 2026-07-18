import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractWikilinks, findBacklinks, slugify, type Note } from '../lib/notes'
import { folderColorMap, topFolder, OVERFLOW_COLOR } from '../lib/graphLayout'
import { parseFrontmatter } from '../lib/frontmatter'

type Heading = { text: string; level: number; id: string }

// Mirrors the renderer: headings in document order (h-0, h-1, …), fenced
// code blocks skipped, inline markdown stripped down to plain text.
export function parseHeadings(content: string): Heading[] {
  const { body } = parseFrontmatter(content)
  const out: Heading[] = []
  let fence = false
  let i = 0
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line.trim())) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = line.match(/^(#{1,6})\s+(.+)$/)
    if (!m) continue
    const text = m[2]
      .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_s, target, alias) => alias || target)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`=~]/g, '')
      .trim()
    out.push({ text, level: m[1].length, id: `h-${i}` })
    i += 1
  }
  return out
}

function Outline({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(null)

  // Scroll-spy: the active section is the last heading at or above the top
  // of the scroll container (with a small reading offset).
  useEffect(() => {
    if (headings.length === 0) return
    const container = document.querySelector('main.content')
    if (!container) return
    let raf = 0
    const measure = () => {
      raf = 0
      // Fully scrolled: the last section is being read even though its
      // heading can never reach the container top.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
        setActive(headings[headings.length - 1].id)
        return
      }
      const containerTop = container.getBoundingClientRect().top
      let current = headings[0].id
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (!el) continue
        if (el.getBoundingClientRect().top - containerTop <= 90) current = h.id
        else break
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [headings])

  if (headings.length === 0) return null
  const minLevel = Math.min(...headings.map((h) => h.level))
  return (
    <section className="rail-section outline">
      <h4>Outline</h4>
      <ul>
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: (h.level - minLevel) * 12 }}>
            <button
              className={'outline-item' + (active === h.id ? ' active' : '')}
              onClick={() =>
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const LG_W = 250
const LG_H = 230

function LocalGraph({ note, notes }: { note: Note; notes: Note[] }) {
  const navigate = useNavigate()
  const colors = useMemo(() => folderColorMap(notes), [notes])

  const { neighbors, missing } = useMemo(() => {
    const bySlug = new Map(notes.map((n) => [n.slug, n]))
    const out = new Map<string, Note>()
    const miss = new Set<string>()
    for (const link of extractWikilinks(note.content)) {
      const slug = slugify(link)
      if (slug === note.slug) continue
      const target = bySlug.get(slug)
      if (target) out.set(slug, target)
      else miss.add(slug)
    }
    for (const b of findBacklinks(note, notes)) out.set(b.slug, b)
    return { neighbors: Array.from(out.values()).sort((a, b) => a.title.localeCompare(b.title)), missing: Array.from(miss).sort() }
  }, [note, notes])

  const spokes = neighbors.length + missing.length
  if (spokes === 0) {
    return (
      <section className="rail-section">
        <h4>Local graph</h4>
        <p className="muted rail-empty">No connections yet. Add [[wikilinks]].</p>
      </section>
    )
  }

  const cx = LG_W / 2
  const cy = LG_H / 2 + 6
  const R = Math.min(LG_W, LG_H) / 2 - 34
  const pos = (idx: number) => {
    const ang = (idx / spokes) * Math.PI * 2 - Math.PI / 2
    return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R }
  }

  // Edges among neighbors, so triangles in the vault show up here too.
  const neighborLinks: Array<[number, number]> = []
  neighbors.forEach((a, i) => {
    const targets = new Set(extractWikilinks(a.content).map(slugify))
    neighbors.forEach((b, j) => {
      if (i < j && (targets.has(b.slug) || extractWikilinks(b.content).map(slugify).includes(a.slug))) {
        neighborLinks.push([i, j])
      }
    })
  })

  return (
    <section className="rail-section">
      <h4>Local graph</h4>
      <svg className="local-graph" viewBox={`0 0 ${LG_W} ${LG_H}`} role="img" aria-label="Notes connected to this note">
        {neighbors.map((_, i) => {
          const p = pos(i)
          return <line key={`s-${i}`} className="graph-edge" x1={cx} y1={cy} x2={p.x} y2={p.y} />
        })}
        {missing.map((_, i) => {
          const p = pos(neighbors.length + i)
          return (
            <line key={`m-${i}`} className="graph-edge missing" x1={cx} y1={cy} x2={p.x} y2={p.y} />
          )
        })}
        {neighborLinks.map(([i, j], idx) => {
          const a = pos(i)
          const b = pos(j)
          return <line key={`n-${idx}`} className="graph-edge faint" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        <g className="graph-node center" data-slug={note.slug}>
          <title>{note.title}</title>
          <circle cx={cx} cy={cy} r={9} fill={colors.get(topFolder(note.folder)) ?? OVERFLOW_COLOR} />
        </g>
        {neighbors.map((n, i) => {
          const p = pos(i)
          return (
            <g
              key={n.slug}
              className="graph-node"
              data-slug={n.slug}
              onClick={() => navigate(`/note/${n.slug}`)}
            >
              <title>{n.title}{n.folder ? ` · 📁 ${n.folder}` : ''}</title>
              <circle cx={p.x} cy={p.y} r={6} fill={colors.get(topFolder(n.folder)) ?? OVERFLOW_COLOR} />
              <text x={p.x} y={p.y - 11}>{n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title}</text>
            </g>
          )
        })}
        {missing.map((slug, i) => {
          const p = pos(neighbors.length + i)
          return (
            <g
              key={slug}
              className="graph-node missing"
              data-slug={slug}
              onClick={() => navigate(`/note/${slug}`)}
            >
              <title>{slug} (not created yet)</title>
              <circle cx={p.x} cy={p.y} r={5} />
              <text x={p.x} y={p.y - 10}>{slug.length > 18 ? slug.slice(0, 17) + '…' : slug}</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

export function NoteRail({ note, notes }: { note: Note; notes: Note[] }) {
  const headings = useMemo(() => parseHeadings(note.content), [note.content])
  return (
    <aside className="note-rail">
      <Outline headings={headings} />
      <LocalGraph note={note} notes={notes} />
    </aside>
  )
}
