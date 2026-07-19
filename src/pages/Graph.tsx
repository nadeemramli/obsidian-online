import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useNotes } from '../lib/notesContext'
import { buildGraphData, Simulation } from '../lib/graphLayout'
import { extractWikilinks, slugify } from '../lib/notes'

const W = 900
const H = 620
const ROOT_LABEL = 'Vault root'
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const LABEL_ZOOM = 0.55
const CLICK_SLOP = 5 // screen px of movement below which pointerup = click

type Transform = { x: number; y: number; k: number }

export default function Graph() {
  const { notes, loading } = useNotes()
  const navigate = useNavigate()
  const [hover, setHover] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  const graph = useMemo(() => buildGraphData(notes), [notes])

  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<SVGGElement>(null)
  const nodeRefs = useRef<Array<SVGGElement | null>>([])
  const edgeRefs = useRef<Array<SVGLineElement | null>>([])
  const simRef = useRef<Simulation | null>(null)
  const rafRef = useRef<number>(0)
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const gestureRef = useRef<{
    mode: 'pan' | 'node'
    id: number
    startX: number
    startY: number
    moved: boolean
    node?: number
    t0?: Transform
  } | null>(null)

  function applyTransform() {
    const { x, y, k } = transformRef.current
    viewportRef.current?.setAttribute('transform', `translate(${x}, ${y}) scale(${k})`)
    svgRef.current?.classList.toggle('zoomed-out', k < LABEL_ZOOM)
  }

  function applyPositions() {
    const nodes = simRef.current?.nodes ?? []
    nodes.forEach((nd, i) => {
      nodeRefs.current[i]?.setAttribute('transform', `translate(${nd.x}, ${nd.y})`)
    })
    graph.edges.forEach((e, i) => {
      const el = edgeRefs.current[i]
      if (!el) return
      el.setAttribute('x1', String(nodes[e.a].x))
      el.setAttribute('y1', String(nodes[e.a].y))
      el.setAttribute('x2', String(nodes[e.b].x))
      el.setAttribute('y2', String(nodes[e.b].y))
    })
  }

  function fitToView() {
    const nodes = simRef.current?.nodes ?? []
    if (nodes.length === 0) return
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs) - 60
    const maxX = Math.max(...xs) + 60
    const minY = Math.min(...ys) - 60
    const maxY = Math.max(...ys) + 60
    const k = Math.min(W / (maxX - minX), H / (maxY - minY), 1.3)
    transformRef.current = {
      k,
      x: (W - (minX + maxX) * k) / 2,
      y: (H - (minY + maxY) * k) / 2,
    }
    applyTransform()
  }

  function startLoop() {
    cancelAnimationFrame(rafRef.current)
    const loop = () => {
      const sim = simRef.current
      if (!sim) return
      sim.tick()
      applyPositions()
      if (!sim.settled) rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // Boot the simulation: pre-warm off-screen so the first paint is already a
  // sensible layout, fit the viewport to it, then keep simulating live.
  useLayoutEffect(() => {
    const sim = new Simulation(graph.nodes, graph.edges)
    simRef.current = sim
    for (let i = 0; i < 160; i++) sim.tick()
    applyPositions()
    fitToView()
    startLoop()
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  // Wheel zoom toward the cursor. Registered manually: React's wheel
  // listeners are passive, so preventDefault (to stop page scroll) needs this.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const scale = W / rect.width
      const px = (e.clientX - rect.left) * scale
      const py = (e.clientY - rect.top) * scale
      const t = transformRef.current
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * Math.exp(-e.deltaY * 0.002)))
      // Keep the world point under the cursor stationary while zooming.
      const wx = (px - t.x) / t.k
      const wy = (py - t.y) / t.k
      transformRef.current = { k, x: px - wx * k, y: py - wy * k }
      applyTransform()
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  function screenPoint(e: React.PointerEvent): { px: number; py: number } {
    const rect = svgRef.current!.getBoundingClientRect()
    const scale = W / rect.width
    return { px: (e.clientX - rect.left) * scale, py: (e.clientY - rect.top) * scale }
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.target !== svgRef.current) return
    const { px, py } = screenPoint(e)
    gestureRef.current = {
      mode: 'pan',
      id: e.pointerId,
      startX: px,
      startY: py,
      moved: false,
      t0: { ...transformRef.current },
    }
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  function onNodePointerDown(i: number, e: React.PointerEvent) {
    e.stopPropagation()
    const { px, py } = screenPoint(e)
    gestureRef.current = { mode: 'node', id: e.pointerId, startX: px, startY: py, moved: false, node: i }
    svgRef.current!.setPointerCapture(e.pointerId)
    const t = transformRef.current
    const nd = simRef.current!.nodes[i]
    nd.fx = (px - t.x) / t.k
    nd.fy = (py - t.y) / t.k
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.id) return
    const { px, py } = screenPoint(e)
    if (Math.hypot(px - g.startX, py - g.startY) > CLICK_SLOP) g.moved = true

    if (g.mode === 'pan' && g.t0) {
      transformRef.current = { k: g.t0.k, x: g.t0.x + (px - g.startX), y: g.t0.y + (py - g.startY) }
      applyTransform()
    } else if (g.mode === 'node' && g.node !== undefined) {
      const t = transformRef.current
      const nd = simRef.current!.nodes[g.node]
      nd.fx = (px - t.x) / t.k
      nd.fy = (py - t.y) / t.k
      if (g.moved) {
        simRef.current!.reheat()
        startLoop()
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.id) return
    gestureRef.current = null
    if (g.mode === 'node' && g.node !== undefined) {
      const nd = simRef.current!.nodes[g.node]
      nd.fx = null
      nd.fy = null
      simRef.current!.cool()
      if (!g.moved) {
        navigate(`/note/${nd.note.slug}`)
      } else {
        startLoop()
      }
    }
  }

  function zoomBy(factor: number) {
    const t = transformRef.current
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor))
    // Zoom around the viewport center.
    const wx = (W / 2 - t.x) / t.k
    const wy = (H / 2 - t.y) / t.k
    transformRef.current = { k, x: W / 2 - wx * k, y: H / 2 - wy * k }
    applyTransform()
  }

  const neighbors = useMemo(() => {
    const map = new Map<number, Set<number>>()
    graph.edges.forEach((e) => {
      if (!map.has(e.a)) map.set(e.a, new Set())
      if (!map.has(e.b)) map.set(e.b, new Set())
      map.get(e.a)!.add(e.b)
      map.get(e.b)!.add(e.a)
    })
    return map
  }, [graph])

  // Vault health: red links (targets that don't exist) and orphans (notes
  // with no resolved links in either direction).
  const { unresolved, orphans } = useMemo(() => {
    const bySlug = new Set(notes.map((n) => n.slug))
    const missing = new Map<string, { text: string; sources: Set<string> }>()
    for (const n of notes) {
      for (const link of extractWikilinks(n.content)) {
        const slug = slugify(link)
        if (bySlug.has(slug)) continue
        if (!missing.has(slug)) missing.set(slug, { text: link, sources: new Set() })
        missing.get(slug)!.sources.add(n.title)
      }
    }
    return {
      unresolved: Array.from(missing.entries()).sort((a, b) => a[1].text.localeCompare(b[1].text)),
      orphans: graph.nodes.filter((nd) => nd.degree === 0).map((nd) => nd.note),
    }
  }, [notes, graph])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    const set = new Set<number>()
    graph.nodes.forEach((nd, i) => {
      if (nd.note.title.toLowerCase().includes(q) || nd.note.folder.toLowerCase().includes(q)) {
        set.add(i)
      }
    })
    return set
  }, [graph, q])

  if (loading) return <div className="page muted">Loading…</div>

  const isDim = (i: number) =>
    (hover !== null && i !== hover && !neighbors.get(hover)?.has(i)) ||
    (matches !== null && !matches.has(i))
  const legend = Array.from(graph.colors.entries())

  return (
    <div className="page graph-page">
      <div className="page-head">
        <h1>Graph</h1>
        <span className="muted">
          {graph.nodes.length} notes · {graph.edges.length} links
        </span>
      </div>
      {graph.nodes.length === 0 ? (
        <p className="muted">No notes yet. Create some and link them with [[wikilinks]].</p>
      ) : (
        <>
          <div className="graph-toolbar">
            <input
              className="graph-filter"
              placeholder="Filter notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="graph-zoom">
              <button className="btn" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
                +
              </button>
              <button className="btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
                −
              </button>
              <button className="btn" aria-label="Reset view" onClick={fitToView}>
                ⌖
              </button>
            </div>
            <div className="graph-legend">
              {legend.map(([folder, color]) => (
                <span key={folder || '(root)'} className="legend-item">
                  <span className="legend-swatch" style={{ background: color }} />
                  {folder || ROOT_LABEL}
                </span>
              ))}
            </div>
          </div>
          <svg
            ref={svgRef}
            className="graph"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Interactive graph of notes and their wikilink connections, colored by folder"
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <g ref={viewportRef}>
              {graph.edges.map((e, i) => (
                <line
                  key={i}
                  ref={(el) => (edgeRefs.current[i] = el)}
                  className={
                    'graph-edge' +
                    (hover !== null && (e.a === hover || e.b === hover) ? ' active' : '') +
                    (isDim(e.a) || isDim(e.b) ? ' dim' : '')
                  }
                />
              ))}
              {graph.nodes.map((nd, i) => (
                <g
                  key={nd.note.id}
                  ref={(el) => (nodeRefs.current[i] = el)}
                  className={'graph-node' + (isDim(i) ? ' dim' : '') + (hover === i ? ' active' : '')}
                  onPointerDown={(e) => onNodePointerDown(i, e)}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  data-slug={nd.note.slug}
                >
                  <title>
                    {nd.note.title}
                    {nd.note.folder ? ` · 📁 ${nd.note.folder}` : ''}
                  </title>
                  <circle r={nd.r} fill={nd.color} />
                  <text y={-(7 + nd.r)}>{nd.note.title}</text>
                </g>
              ))}
            </g>
          </svg>
          <p className="hint">
            Drag the background to pan · scroll to zoom · drag nodes to rearrange · click a node to
            open the note
          </p>
          <div className="graph-reports">
            <section className="rail-section">
              <h4>Unresolved links ({unresolved.length})</h4>
              {unresolved.length === 0 ? (
                <p className="muted rail-empty">Every wikilink points at a real note.</p>
              ) : (
                <ul>
                  {unresolved.map(([slug, u]) => (
                    <li key={slug}>
                      <a className="wikilink missing" href={`#/note/${slug}`}>
                        {u.text}
                      </a>{' '}
                      <span className="muted">from {Array.from(u.sources).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rail-section">
              <h4>Orphans ({orphans.length})</h4>
              {orphans.length === 0 ? (
                <p className="muted rail-empty">Every note is connected.</p>
              ) : (
                <ul>
                  {orphans.map((n) => (
                    <li key={n.id}>
                      <Link to={`/note/${n.slug}`}>{n.title}</Link>
                      {n.folder && <span className="muted"> · 📁 {n.folder}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
