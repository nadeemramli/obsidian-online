import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { extractWikilinks, slugify, type Note } from '../lib/notes'

const W = 900
const H = 620

type GraphNode = { note: Note; x: number; y: number; degree: number }
type GraphEdge = { a: number; b: number }

// Deterministic PRNG so the layout is stable for the same vault.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Small Fruchterman–Reingold style force layout, computed once per render.
function buildGraph(notes: Note[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const bySlug = new Map(notes.map((n, i) => [n.slug, i]))
  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  notes.forEach((n, a) => {
    for (const link of extractWikilinks(n.content)) {
      const b = bySlug.get(slugify(link))
      if (b === undefined || b === a) continue
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      edges.push({ a, b })
    }
  })

  const rand = mulberry32(notes.length * 2654435761 + edges.length)
  const nodes: GraphNode[] = notes.map((note) => ({
    note,
    x: W / 2 + (rand() - 0.5) * W * 0.8,
    y: H / 2 + (rand() - 0.5) * H * 0.8,
    degree: 0,
  }))
  for (const e of edges) {
    nodes[e.a].degree += 1
    nodes[e.b].degree += 1
  }

  const n = nodes.length
  if (n === 0) return { nodes, edges }
  const k = Math.sqrt((W * H) / n) * 0.7

  for (let iter = 0; iter < 260; iter++) {
    const t = 1 - iter / 260
    const dx = new Array(n).fill(0)
    const dy = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = nodes[i].x - nodes[j].x
        let vy = nodes[i].y - nodes[j].y
        let d2 = vx * vx + vy * vy
        if (d2 < 0.01) {
          vx = rand() - 0.5
          vy = rand() - 0.5
          d2 = 0.25
        }
        const d = Math.sqrt(d2)
        const rep = (k * k) / d / d
        dx[i] += vx * rep
        dy[i] += vy * rep
        dx[j] -= vx * rep
        dy[j] -= vy * rep
      }
    }
    for (const e of edges) {
      const vx = nodes[e.a].x - nodes[e.b].x
      const vy = nodes[e.a].y - nodes[e.b].y
      const d = Math.max(Math.sqrt(vx * vx + vy * vy), 0.1)
      const att = (d * d) / k / d
      dx[e.a] -= vx * att
      dy[e.a] -= vy * att
      dx[e.b] += vx * att
      dy[e.b] += vy * att
    }
    for (let i = 0; i < n; i++) {
      // Mild gravity towards the center keeps disconnected notes on screen.
      dx[i] += (W / 2 - nodes[i].x) * 0.03
      dy[i] += (H / 2 - nodes[i].y) * 0.03
      const d = Math.max(Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]), 0.1)
      const cap = 18 * t + 1
      nodes[i].x += (dx[i] / d) * Math.min(d, cap)
      nodes[i].y += (dy[i] / d) * Math.min(d, cap)
      nodes[i].x = Math.min(W - 40, Math.max(40, nodes[i].x))
      nodes[i].y = Math.min(H - 30, Math.max(30, nodes[i].y))
    }
  }
  return { nodes, edges }
}

export default function Graph() {
  const { notes, loading } = useNotes()
  const navigate = useNavigate()
  const [hover, setHover] = useState<number | null>(null)

  const { nodes, edges } = useMemo(() => buildGraph(notes), [notes])
  const neighbors = useMemo(() => {
    const map = new Map<number, Set<number>>()
    edges.forEach((e) => {
      if (!map.has(e.a)) map.set(e.a, new Set())
      if (!map.has(e.b)) map.set(e.b, new Set())
      map.get(e.a)!.add(e.b)
      map.get(e.b)!.add(e.a)
    })
    return map
  }, [edges])

  if (loading) return <div className="page muted">Loading…</div>

  const isDim = (i: number) =>
    hover !== null && i !== hover && !neighbors.get(hover)?.has(i)

  return (
    <div className="page graph-page">
      <div className="page-head">
        <h1>Graph</h1>
        <span className="muted">
          {nodes.length} notes · {edges.length} links
        </span>
      </div>
      {nodes.length === 0 ? (
        <p className="muted">No notes yet. Create some and link them with [[wikilinks]].</p>
      ) : (
        <svg
          className="graph"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Graph of notes and their wikilink connections"
        >
          {edges.map((e, i) => (
            <line
              key={i}
              className={
                'graph-edge' +
                (hover !== null && (e.a === hover || e.b === hover) ? ' active' : '') +
                (hover !== null && e.a !== hover && e.b !== hover ? ' dim' : '')
              }
              x1={nodes[e.a].x}
              y1={nodes[e.a].y}
              x2={nodes[e.b].x}
              y2={nodes[e.b].y}
            />
          ))}
          {nodes.map((nd, i) => (
            <g
              key={nd.note.id}
              className={'graph-node' + (isDim(i) ? ' dim' : '') + (hover === i ? ' active' : '')}
              transform={`translate(${nd.x}, ${nd.y})`}
              onClick={() => navigate(`/note/${nd.note.slug}`)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              data-slug={nd.note.slug}
            >
              <circle r={5 + Math.min(nd.degree * 1.5, 9)} />
              <text y={-(12 + Math.min(nd.degree * 1.5, 9))}>{nd.note.title}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}
