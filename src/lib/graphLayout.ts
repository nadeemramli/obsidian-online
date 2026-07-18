import { extractWikilinks, slugify, type Note } from './notes'

// Categorical palette validated for this dark surface (#20202e):
// lightness band, chroma, CVD separation, normal-vision floor, 3:1 contrast.
export const PALETTE = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767']
export const OVERFLOW_COLOR = '#898781'

export type GraphNode = {
  note: Note
  x: number
  y: number
  vx: number
  vy: number
  // While dragging, the pointer pins the node here and the sim flows around it.
  fx: number | null
  fy: number | null
  degree: number
  color: string
  r: number
  home: { x: number; y: number; strength: number }
}
export type GraphEdge = { a: number; b: number }

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colors: Map<string, string>
}

// Deterministic PRNG so the layout is stable for the same vault.
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function topFolder(folder: string): string {
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

const LINK_DIST = 70

/**
 * Build the graph: nodes, resolved wikilink edges, and a "home" position per
 * node. Linked components get a shared home region (weak pull); unlinked
 * notes get a per-node grid cell home grouped by folder (firm pull), so a
 * book's unlinked notes stay together while remaining draggable.
 */
export function buildGraphData(notes: Note[]): GraphData {
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
    vx: 0,
    vy: 0,
    fx: null,
    fy: null,
    degree: 0,
    color: colors.get(topFolder(note.folder)) ?? OVERFLOW_COLOR,
    r: 5,
    home: { x: 0, y: 0, strength: 0 },
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
  nodes.forEach((nd) => (nd.r = 5 + Math.min(nd.degree * 1.5, 9)))

  // Clusters: each multi-node component, plus one cluster per top-level
  // folder collecting that folder's unlinked notes.
  const clusterOf = new Map<string, number>()
  const clusterMembers: number[][] = []
  const clusterLinked: boolean[] = []
  const compSize = new Map<number, number>()
  for (let i = 0; i < n; i++) compSize.set(find(i), (compSize.get(find(i)) ?? 0) + 1)
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const isSingleton = compSize.get(root) === 1
    const key = isSingleton ? `folder:${topFolder(nodes[i].note.folder)}` : `comp:${root}`
    if (!clusterOf.has(key)) {
      clusterOf.set(key, clusterMembers.length)
      clusterMembers.push([])
      clusterLinked.push(!isSingleton)
    }
    clusterMembers[clusterOf.get(key)!].push(i)
  }

  // Cluster footprints: sim room for linked components, label-safe grids for
  // folder groups.
  const GRID_X = 118
  const GRID_Y = 54
  const radii = clusterMembers.map((members, c) => {
    if (clusterLinked[c]) return 40 + LINK_DIST * 0.62 * Math.sqrt(members.length)
    const cols = Math.ceil(Math.sqrt(members.length))
    const rows = Math.ceil(members.length / cols)
    return Math.max(cols * GRID_X, rows * GRID_Y) / 2 + 30
  })

  // Shelf-pack cluster homes so clusters occupy separate regions.
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a])
  const totalArea = radii.reduce((acc, r) => acc + (2 * r) ** 2, 0)
  const maxRowWidth = Math.max(2 * radii[order[0]], Math.sqrt(totalArea) * 1.35)
  let cx = 0
  let cy = 0
  let rowH = 0
  const homes: Array<{ x: number; y: number }> = new Array(clusterMembers.length)
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
  clusterMembers.forEach((members, c) => {
    const home = homes[c]
    if (!clusterLinked[c]) {
      // Per-node grid-cell homes: firm pull keeps the block tidy.
      const size = members.length
      const cols = Math.ceil(Math.sqrt(size))
      members.forEach((i, idx) => {
        const row = Math.floor(idx / cols)
        const col = idx % cols
        const rowWidth = Math.min(cols, size - row * cols) * GRID_X
        const hx = home.x - rowWidth / 2 + col * GRID_X + (row % 2 ? GRID_X / 2 : 0) + GRID_X / 2
        const hy = home.y - (Math.ceil(size / cols) * GRID_Y) / 2 + row * GRID_Y + GRID_Y / 2
        nodes[i].home = { x: hx, y: hy, strength: 0.2 }
        nodes[i].x = hx
        nodes[i].y = hy
      })
    } else {
      members.forEach((i) => {
        const ang = rand() * Math.PI * 2
        const r = rand() * radii[c] * 0.6
        nodes[i].home = { x: home.x, y: home.y, strength: 0.035 }
        nodes[i].x = home.x + Math.cos(ang) * r
        nodes[i].y = home.y + Math.sin(ang) * r
      })
    }
  })

  return { nodes, edges, colors }
}

/**
 * A d3-force-style simulation: link springs, local many-body repulsion,
 * collision, and per-node home gravity. `alpha` is the temperature — it
 * decays until the layout settles, and interactions call reheat() to wake
 * it back up (this is what makes Obsidian's graph feel alive).
 */
export class Simulation {
  alpha = 1
  alphaTarget = 0
  alphaMin = 0.003
  alphaDecay = 0.025
  velocityKeep = 0.5
  private rand: () => number

  constructor(
    public nodes: GraphNode[],
    public edges: GraphEdge[],
  ) {
    this.rand = mulberry32(nodes.length * 7919 + edges.length)
  }

  get settled(): boolean {
    return this.alpha < this.alphaMin && this.alphaTarget === 0
  }

  reheat(target = 0.3) {
    this.alphaTarget = target
    if (this.alpha < target) this.alpha = target
  }

  cool() {
    this.alphaTarget = 0
  }

  tick() {
    const { nodes, edges, alpha } = this
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay
    const n = nodes.length
    const CUTOFF2 = (2.6 * LINK_DIST) ** 2

    // Local many-body repulsion.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = nodes[i].x - nodes[j].x
        let vy = nodes[i].y - nodes[j].y
        let d2 = vx * vx + vy * vy
        if (d2 > CUTOFF2) continue
        if (d2 < 1) {
          vx = this.rand() - 0.5
          vy = this.rand() - 0.5
          d2 = 1
        }
        const f = (1600 * alpha) / d2
        const d = Math.sqrt(d2)
        vx /= d
        vy /= d
        nodes[i].vx += vx * f
        nodes[i].vy += vy * f
        nodes[j].vx -= vx * f
        nodes[j].vy -= vy * f
      }
    }

    // Link springs toward the ideal edge length.
    for (const e of edges) {
      const a = nodes[e.a]
      const b = nodes[e.b]
      const vx = b.x - a.x
      const vy = b.y - a.y
      const d = Math.max(Math.sqrt(vx * vx + vy * vy), 1)
      const f = ((d - LINK_DIST) / d) * 0.35 * alpha
      a.vx += vx * f
      a.vy += vy * f
      b.vx -= vx * f
      b.vy -= vy * f
    }

    // Home gravity + integration.
    for (const nd of nodes) {
      if (nd.fx !== null && nd.fy !== null) {
        nd.x = nd.fx
        nd.y = nd.fy
        nd.vx = 0
        nd.vy = 0
        continue
      }
      nd.vx += (nd.home.x - nd.x) * nd.home.strength * alpha
      nd.vy += (nd.home.y - nd.y) * nd.home.strength * alpha
      nd.vx *= this.velocityKeep
      nd.vy *= this.velocityKeep
      nd.x += nd.vx
      nd.y += nd.vy
    }

    // One collision pass so circles and their labels never fuse.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const min = nodes[i].r + nodes[j].r + 6
        let vx = nodes[i].x - nodes[j].x
        let vy = nodes[i].y - nodes[j].y
        const d2 = vx * vx + vy * vy
        if (d2 >= min * min || d2 === 0) continue
        const d = Math.sqrt(d2)
        const push = (min - d) / d / 2
        vx *= push
        vy *= push
        if (nodes[i].fx === null) {
          nodes[i].x += vx
          nodes[i].y += vy
        }
        if (nodes[j].fx === null) {
          nodes[j].x -= vx
          nodes[j].y -= vy
        }
      }
    }
  }
}
