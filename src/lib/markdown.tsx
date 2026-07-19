import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { slugify } from './notes'
import { useNotes } from './notesContext'
import { parseFrontmatter, stripFrontmatter, type Frontmatter } from './frontmatter'
import { useSearch } from './searchContext'
import { supabase } from './supabase'

// ---- Mermaid diagrams (```mermaid fences), lazy-loaded so the heavy
// library is only fetched when a note actually contains a diagram.
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        // Explicit font: mermaid measures node text with this exact face, so
        // rendering must not inherit the (wider) reading serif or labels clip.
        themeVariables: {
          fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        },
      })
      return m.default
    })
  }
  return mermaidPromise
}

let mermaidSeq = 0

// Fullscreen diagram viewer: wheel-zoom toward the cursor, drag to pan,
// buttons for the rest. Esc or ✕ closes.
function DiagramLightbox({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const viewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setT((prev) => {
        const k = Math.min(8, Math.max(0.3, prev.k * Math.exp(-e.deltaY * 0.0015)))
        const rect = el.getBoundingClientRect()
        const px = e.clientX - rect.left - rect.width / 2
        const py = e.clientY - rect.top - rect.height / 2
        const cx = (px - prev.x) / prev.k
        const cy = (py - prev.y) / prev.k
        return { k, x: px - cx * k, y: py - cy * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) =>
    setT((prev) => ({ ...prev, k: Math.min(8, Math.max(0.3, prev.k * f)) }))

  return (
    <div
      ref={viewRef}
      className="mermaid-lightbox"
      role="dialog"
      aria-label="Diagram viewer"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.lightbox-controls')) return
        dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }
        viewRef.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = dragRef.current
        if (!d || d.id !== e.pointerId) return
        setT((prev) => ({ ...prev, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }))
      }}
      onPointerUp={() => (dragRef.current = null)}
      onPointerCancel={() => (dragRef.current = null)}
    >
      <div
        className="lightbox-canvas"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="lightbox-controls">
        <button className="btn" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
          +
        </button>
        <button className="btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          −
        </button>
        <button className="btn" aria-label="Reset zoom" onClick={() => setT({ x: 0, y: 0, k: 1 })}>
          ⌖
        </button>
        <button className="btn" aria-label="Close viewer" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  )
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    setSvg(null)
    setError(null)
    const id = `mmd-${++mermaidSeq}`
    loadMermaid()
      .then((m) => m.render(id, code))
      .then(({ svg }) => {
        if (active) setSvg(svg)
      })
      .catch((e: any) => {
        // Mermaid can leave a dangling error element behind on parse failure.
        document.getElementById(`d${id}`)?.remove()
        if (active) setError(e?.message || 'Invalid diagram')
      })
    return () => {
      active = false
    }
  }, [code])

  if (error) {
    return (
      <div className="mermaid-block error">
        <div className="mermaid-error-title">Mermaid syntax error</div>
        <pre>{code}</pre>
      </div>
    )
  }
  if (!svg) return <div className="mermaid-block muted">Rendering diagram…</div>
  return (
    <>
      <div
        className="mermaid-block clickable"
        title="Click to zoom"
        onClick={() => setOpen(true)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {open && <DiagramLightbox svg={svg} onClose={() => setOpen(false)} />}
    </>
  )
}

// A #tag chip: clicking filters the sidebar to that tag.
function TagChip({ name }: { name: string }) {
  const { setQ } = useSearch()
  return (
    <button className="tag" onClick={() => setQ(`#${name.replace(/^#/, '')}`)}>
      #{name.replace(/^#/, '')}
    </button>
  )
}

// remark plugin: Obsidian inline syntax inside text nodes —
//   ![[Note]]        note embed
//   [[Note|alias]]   wikilink
//   ==text==         highlight
//   #tag             tag chip
const INLINE_RE = /!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|==([^=\n]+)==|(^|\s)#([A-Za-z][\w/-]*)/g

function remarkObsidianInline() {
  return (tree: any) => {
    visit(tree, 'text', (node: any, index: any, parent: any) => {
      if (!parent || index === null || index === undefined) return
      // Don't rewrite text inside links (e.g. a URL's visible text).
      if (parent.type === 'link') return
      const value: string = node.value
      INLINE_RE.lastIndex = 0
      const children: any[] = []
      let last = 0
      let m: RegExpExecArray | null
      while ((m = INLINE_RE.exec(value)) !== null) {
        const [embed, wiki, highlight, tagSpace, tag] = [m[1], m[2], m[3], m[4], m[5]]
        if (m.index > last) children.push({ type: 'text', value: value.slice(last, m.index) })

        if (embed !== undefined) {
          const [rawTarget, alias] = embed.split('|')
          const target = rawTarget.trim()
          if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target)) {
            // ![[image.png]] or ![[image.png|300]] — an attachment embed.
            const width = alias && /^\d+$/.test(alias.trim()) ? Number(alias.trim()) : undefined
            children.push({
              type: 'image',
              url: `storage:${target}`,
              alt: alias && !width ? alias.trim() : target,
              ...(width ? { data: { hProperties: { width } } } : {}),
            })
          } else {
            children.push({
              type: 'link',
              url: `#/embed/${slugify(target.split('#')[0].trim())}`,
              children: [{ type: 'text', value: target }],
            })
          }
        } else if (wiki !== undefined) {
          const [rawTarget, alias] = wiki.split('|')
          const target = rawTarget.trim()
          // [[Note#Heading]] resolves to Note; the label keeps what was typed.
          const noteTarget = target.split('#')[0].trim()
          if (!noteTarget) {
            children.push({ type: 'text', value: m[0] })
          } else {
            children.push({
              type: 'link',
              url: `#/note/${slugify(noteTarget)}`,
              children: [{ type: 'text', value: (alias ?? rawTarget).trim() }],
            })
          }
        } else if (highlight !== undefined) {
          children.push({
            type: 'strong',
            data: { hName: 'mark' },
            children: [{ type: 'text', value: highlight }],
          })
        } else if (tag !== undefined) {
          if (tagSpace) children.push({ type: 'text', value: tagSpace })
          children.push({
            type: 'link',
            url: `#tag:${tag}`,
            children: [{ type: 'text', value: `#${tag}` }],
          })
        }
        last = m.index + m[0].length
      }
      if (children.length === 0) return
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...children)
      return index + children.length
    })
  }
}

// remark plugin: Obsidian callouts — blockquotes starting with [!type] Title.
function remarkCallouts() {
  return (tree: any) => {
    visit(tree, 'blockquote', (node: any) => {
      const firstPara = node.children?.[0]
      if (!firstPara || firstPara.type !== 'paragraph') return
      const firstText = firstPara.children?.[0]
      if (!firstText || firstText.type !== 'text') return
      const m = firstText.value.match(/^\[!([A-Za-z]+)\][+-]?[ \t]*([^\n]*)\n?/)
      if (!m) return

      const type = m[1].toLowerCase()
      const title = m[2].trim() || type.charAt(0).toUpperCase() + type.slice(1)
      firstText.value = firstText.value.slice(m[0].length)
      if (!firstText.value && firstPara.children.length === 1) {
        node.children.shift()
      }
      node.data = {
        ...node.data,
        hProperties: { className: ['callout', `callout-${type}`] },
      }
      node.children.unshift({
        type: 'paragraph',
        data: { hName: 'div', hProperties: { className: ['callout-title'] } },
        children: [{ type: 'text', value: title }],
      })
    })
  }
}

function StorageImage({ src, alt, ...rest }: { src: string; alt?: string; [k: string]: any }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const path = src.replace(/^storage:/, '')
    supabase.storage
      .from('screenshots')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active && data) setUrl(data.signedUrl)
      })
    return () => {
      active = false
    }
  }, [src])
  if (!url) return <span className="img-loading">[loading image…]</span>
  return <img src={url} alt={alt || ''} {...rest} />
}

// Renders another note inline for ![[Note]]; one level deep to avoid cycles.
function NoteEmbed({ slug, depth }: { slug: string; depth: number }) {
  const { notes } = useNotes()
  const note = notes.find((n) => n.slug === slug)
  const knownSlugs = useMemo(() => new Set(notes.map((n) => n.slug)), [notes])

  if (!note) {
    return (
      <a href={`#/note/${slug}`} className="wikilink missing">
        {slug}
      </a>
    )
  }
  if (depth >= 1) {
    return (
      <a href={`#/note/${slug}`} className="wikilink">
        {note.title}
      </a>
    )
  }
  return (
    <span className="embed">
      <a className="embed-title" href={`#/note/${slug}`}>
        {note.title}
      </a>
      <span className="embed-body markdown">
        <Markdown content={stripFrontmatter(note.content)} knownSlugs={knownSlugs} depth={depth + 1} />
      </span>
    </span>
  )
}

export function Markdown({
  content,
  knownSlugs,
  depth = 0,
}: {
  content: string
  knownSlugs: Set<string>
  depth?: number
}) {
  // Sequential heading anchors (h-0, h-1, …) for the outline rail. Only the
  // top-level note gets them — embedded notes would duplicate ids.
  const headingCounter = { n: 0 }
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    function Heading({ node, children, ...rest }: any) {
      const id = depth === 0 ? `h-${headingCounter.n++}` : undefined
      return (
        <Tag id={id} {...rest}>
          {children}
        </Tag>
      )
    }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkObsidianInline, remarkCallouts]}
      // react-markdown sanitizes non-http(s) URLs; keep our storage: scheme
      // so StorageImage can resolve it to a signed URL.
      urlTransform={(url) => (url.startsWith('storage:') ? url : defaultUrlTransform(url))}
      components={{
        h1: heading('h1'),
        h2: heading('h2'),
        h3: heading('h3'),
        h4: heading('h4'),
        h5: heading('h5'),
        h6: heading('h6'),
        a({ node, href, children, ...rest }: any) {
          if (typeof href === 'string' && href.startsWith('#tag:')) {
            return <TagChip name={href.slice(5)} />
          }
          if (typeof href === 'string' && href.startsWith('#/embed/')) {
            return <NoteEmbed slug={href.replace('#/embed/', '')} depth={depth} />
          }
          if (typeof href === 'string' && href.startsWith('#/note/')) {
            const s = href.replace('#/note/', '')
            const missing = !knownSlugs.has(s)
            return (
              <a href={href} className={'wikilink' + (missing ? ' missing' : '')}>
                {children}
              </a>
            )
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" {...rest}>
              {children}
            </a>
          )
        },
        pre({ node, children, ...rest }: any) {
          // ```mermaid fences render as diagrams instead of code blocks.
          const codeEl = node?.children?.[0]
          const classes: string[] = codeEl?.properties?.className ?? []
          if (codeEl?.tagName === 'code' && classes.includes('language-mermaid')) {
            const text = (codeEl.children ?? [])
              .map((c: any) => c.value ?? '')
              .join('')
              .trim()
            return <MermaidDiagram code={text} />
          }
          return <pre {...rest}>{children}</pre>
        },
        img({ node, src, alt, ...rest }: any) {
          if (typeof src === 'string' && src.startsWith('storage:')) {
            return <StorageImage src={src} alt={alt} {...rest} />
          }
          return <img src={src} alt={alt || ''} {...rest} />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function PropertyValue({ name, value }: { name: string; value: string | string[] }) {
  const values = Array.isArray(value) ? value : [value]
  if (name.toLowerCase() === 'tags') {
    return (
      <>
        {values.map((v) => (
          <TagChip key={v} name={v} />
        ))}
      </>
    )
  }
  return <>{values.join(', ')}</>
}

// Frontmatter properties panel + rendered body, like Obsidian's reading view.
export function NoteContent({ content, knownSlugs }: { content: string; knownSlugs: Set<string> }) {
  const { data, body } = useMemo(() => parseFrontmatter(content), [content])
  const entries = Object.entries(data) as Array<[string, Frontmatter[string]]>
  return (
    <>
      {entries.length > 0 && (
        <section className="props" aria-label="Properties">
          {entries.map(([k, v]) => (
            <div className="prop-row" key={k}>
              <span className="prop-key">{k}</span>
              <span className="prop-value">
                <PropertyValue name={k} value={v} />
              </span>
            </div>
          ))}
        </section>
      )}
      <article className="markdown">
        <Markdown content={body} knownSlugs={knownSlugs} />
      </article>
    </>
  )
}
