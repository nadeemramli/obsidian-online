import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { extractWikilinks, slugify, type Note } from '../lib/notes'

const W = 900
const H = 620
const PAD = 60

// Categorical palette validated for this dark surface (#20202e):
// lightness band, chroma, CVD separation, normal-vision floor, 3:1 contrast.
const PALETTE = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767']
const OVERFLOW_COLOR = '#898781'
const ROOT_LABEL = 'Vault root'

type GraphNode = {
  note: Note
  x: number
  y: number
  degree: number
  cluster: number
  color: string
  fixed: boolean
}
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

function topFolder(folder: string): string {
  return (folder || '').split('/')[0].trim()
}

// Fixed alphabetical assignment: '' (vault root) sorts first. Folders beyond
// the validated palette fold into a shared gray rather than invented hues.
export function folderColorMap(notes: Note[]): Map<string, string> {
  const folders = Array.from(new Set(notes.map((n) => topFolder(n.folder)))).sort()
  const map = new Map<string, string>()
  folders.forEach((f, i) => map.set(f, i < PALETTE.length ? PALETTE[i] : OVERFLOW_COLOR))
  return map
}

function buildGraph(notes: Note[]): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colors: Map<string, string>
} {
  const colors = folderColorMap(notes)
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

  const n = notes.length
  const nodes: GraphNode[] = notes.map((note) => ({
    note,
    x: 0,
    y: 0,
    degree: 0,
    cluster: -1,
    color: colors.get(topFolder(note.folder)) ?? OVERFLOW_COLOR,
    fixed: false,
  }))
  if (n === 0) return { nodes, edges, colors }

  // Connected components via union-find.
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const e of edges) {
    parent[find(e.a)] = find(e.b)
    nodes[e.a].degree += 1
    nodes[e.b].degree += 1
  }

  // Clusters: each multi-node component is one cluster; isolated notes are
  // grouped per top-level folder so a book's unlinked notes sit together.
  const clusterOf = new Map<string, number>()
  const clusterSizes: number[] = []
  const clusterLinked: boolean[] = []
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const isSingleton = nodes.filter((_, j) => find(j) === root).length === 1
    const key = isSingleton ? `folder:${topFolder(nodes[i].note.folder)}` : `comp:${root}`
    if (!clusterOf.has(key)) {
      clusterOf.set(key, clusterSizes.length)
      clusterSizes.push(0)
      clusterLinked.push(!isSingleton)
    }
    const c = clusterOf.get(key)!
    nodes[i].cluster = c
    clusterSizes[c] += 1
  }

  // Cluster footprints. Linked components get room for the force layout
  // (~k spacing per node); unlinked folder groups are compact label grids.
  const k = 70
  const clusterNodes: number[][] = clusterSizes.map(() => [])
  nodes.forEach((nd, i) => clusterNodes[nd.cluster].push(i))
  const GRID_X = 118
  const GRID_Y = 54
  const radii = clusterSizes.map((s, c) => {
    if (clusterLinked[c]) return 40 + k * 0.62 * Math.sqrt(s)
    const cols = Math.ceil(Math.sqrt(s))
    const rows = Math.ceil(s / cols)
    return Math.max(cols * GRID_X, rows * GRID_Y) / 2 + 30
  })

  // Shelf-pack cluster homes so clusters occupy separate regions.
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a])
  const totalArea = radii.reduce((acc, r) => acc + (2 * r) ** 2, 0)
  const maxRowWidth = Math.max(2 * radii[order[0]], Math.sqrt(totalArea) * 1.35)
  const homes: Array<{ x: number; y: number }> = new Array(clusterSizes.length)
  let cx = 0
  let cy = 0
  let rowH = 0
  for (const c of order) {
    const d = 2 * radii[c]
    if (cx + d > maxRowWidth && cx > 0) {
      cy += rowH + 40
      cx = 0
      rowH = 0
    }
    homes[c] = { x: cx + radii[c], y: cy + radii[c] }
    cx += d + 40
    rowH = Math.max(rowH, d)
  }

  const rand = mulberry32(n * 2654435761 + edges.length)

  // Unlinked folder groups: a fixed, staggered grid — compact and label-safe.
  clusterSizes.forEach((size, c) => {
    if (clusterLinked[c]) return
    const cols = Math.ceil(Math.sqrt(size))
    const home = homes[c]
    clusterNodes[c].forEach((i, idx) => {
      const row = Math.floor(idx / cols)
      const col = idx % cols
      const rowWidth = Math.min(cols, size - row * cols) * GRID_X
      nodes[i].x = home.x - rowWidth / 2 + col * GRID_X + (row % 2 ? GRID_X / 2 : 0) + GRID_X / 2
      nodes[i].y = home.y - (Math.ceil(size / cols) * GRID_Y) / 2 + row * GRID_Y + GRID_Y / 2
      nodes[i].fixed = true
    })
  })

  // Linked components start near their home and settle by Fruchterman–Reingold.
  nodes.forEach((nd) => {
    if (nd.fixed) return
    const home = homes[nd.cluster]
    const ang = rand() * Math.PI * 2
    const r = rand() * radii[nd.cluster] * 0.6
    nd.x = home.x + Math.cos(ang) * r
    nd.y = home.y + Math.sin(ang) * r
  })

  const CUTOFF2 = (2.5 * k) ** 2 // local repulsion only — keeps clusters cohesive
  const ITER = 300
  for (let iter = 0; iter < ITER; iter++) {
    const t = 1 - iter / ITER
    const dx = new Array(n).fill(0)
    const dy = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (nodes[i].fixed && nodes[j].fixed) continue
        let vx = nodes[i].x - nodes[j].x
        let vy = nodes[i].y - nodes[j].y
        let d2 = vx * vx + vy * vy
        if (d2 > CUTOFF2) continue
        if (d2 < 0.01) {
          vx = rand() - 0.5
          vy = rand() - 0.5
          d2 = 0.25
        }
        const rep = (k * k) / d2
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
      const att = d / k
      dx[e.a] -= vx * att
      dy[e.a] -= vy * att
      dx[e.b] += vx * att
      dy[e.b] += vy * att
    }
    for (let i = 0; i < n; i++) {
      if (nodes[i].fixed) continue
      const home = homes[nodes[i].cluster]
      dx[i] += (home.x - nodes[i].x) * 0.03
      dy[i] += (home.y - nodes[i].y) * 0.03
      const d = Math.max(Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]), 0.1)
      const cap = 26 * t + 1
      nodes[i].x += (dx[i] / d) * Math.min(d, cap)
      nodes[i].y += (dy[i] / d) * Math.min(d, cap)
    }
  }

  // Fit the finished layout to the viewBox with uniform scale, centered.
  const xs = nodes.map((nd) => nd.x)
  const ys = nodes.map((nd) => nd.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY, 1.4)
  const offX = (W - spanX * scale) / 2
  const offY = (H - spanY * scale) / 2
  nodes.forEach((nd) => {
    nd.x = offX + (nd.x - minX) * scale
    nd.y = offY + (nd.y - minY) * scale
  })

  return { nodes, edges, colors }
}

export default function Graph() {
  const { notes, loading } = useNotes()
  const navigate = useNavigate()
  const [hover, setHover] = useState<number | null>(null)

  const { nodes, edges, colors } = useMemo(() => buildGraph(notes), [notes])
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

  const isDim = (i: number) => hover !== null && i !== hover && !neighbors.get(hover)?.has(i)
  const legend = Array.from(colors.entries())

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
        <>
          <div className="graph-legend">
            {legend.map(([folder, color]) => (
              <span key={folder || '(root)'} className="legend-item">
                <span className="legend-swatch" style={{ background: color }} />
                {folder || ROOT_LABEL}
              </span>
            ))}
          </div>
          <svg
            className="graph"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Graph of notes and their wikilink connections, colored by folder"
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
                <title>
                  {nd.note.title}
                  {nd.note.folder ? ` · 📁 ${nd.note.folder}` : ''}
                </title>
                <circle r={5 + Math.min(nd.degree * 1.5, 9)} fill={nd.color} />
                <text y={-(12 + Math.min(nd.degree * 1.5, 9))}>{nd.note.title}</text>
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  )
}
