import { useEffect, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { slugify } from './notes'
import { supabase } from './supabase'

// remark plugin: turn [[Title]] and [[Title|alias]] into internal link nodes.
function remarkWikilinks() {
  return (tree: any) => {
    visit(tree, 'text', (node: any, index: any, parent: any) => {
      if (!parent || index === null || index === undefined) return
      const value: string = node.value
      const regex = /\[\[([^\]]+)\]\]/g
      const children: any[] = []
      let last = 0
      let hasMatch = false
      let m: RegExpExecArray | null
      while ((m = regex.exec(value)) !== null) {
        hasMatch = true
        if (m.index > last) {
          children.push({ type: 'text', value: value.slice(last, m.index) })
        }
        const [rawTarget, alias] = m[1].split('|')
        const target = rawTarget.trim()
        const label = (alias ?? rawTarget).trim()
        const slug = slugify(target)
        children.push({
          type: 'link',
          url: `#/note/${slug}`,
          children: [{ type: 'text', value: label }],
        })
        last = m.index + m[0].length
      }
      if (!hasMatch) return
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...children)
      return index + children.length
    })
  }
}

function StorageImage({ src, alt }: { src: string; alt?: string }) {
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
  return <img src={url} alt={alt || ''} />
}

export function Markdown({
  content,
  knownSlugs,
}: {
  content: string
  knownSlugs: Set<string>
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkWikilinks]}
      // react-markdown sanitizes non-http(s) URLs; keep our storage: scheme
      // so StorageImage can resolve it to a signed URL.
      urlTransform={(url) => (url.startsWith('storage:') ? url : defaultUrlTransform(url))}
      components={{
        a({ node, href, children, ...rest }: any) {
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
        img({ node, src, alt, ...rest }: any) {
          if (typeof src === 'string' && src.startsWith('storage:')) {
            return <StorageImage src={src} alt={alt} />
          }
          return <img src={src} alt={alt || ''} {...rest} />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
