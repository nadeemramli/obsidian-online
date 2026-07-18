import { useEffect, useRef } from 'react'
import { EditorView, keymap, drawSelection, highlightActiveLine, ViewPlugin, ViewUpdate, Decoration, DecorationSet, MatchDecorator } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { uploadImage, imageFiles } from '../lib/images'

// Live syntax styling — the raw markdown stays the document (like Obsidian's
// editor); formatting is applied visually as you type.
const headingStyles = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.55em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.32em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '700' },
  { tag: t.heading4, fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: '0.9em' },
  { tag: t.quote, color: 'var(--muted)' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--link)' },
  { tag: t.meta, color: 'var(--muted)' },
  { tag: t.processingInstruction, color: 'var(--muted)' },
  { tag: t.contentSeparator, color: 'var(--muted)' },
])

// Obsidian-specific inline syntax the markdown parser doesn't know.
const obsidianDecorator = new MatchDecorator({
  regexp: /(!?\[\[[^\]\n]+\]\])|(==[^=\n]+==)|((?:^|\s)#[A-Za-z][\w/-]*)/g,
  decoration: (m) =>
    m[1]
      ? Decoration.mark({ class: 'cm-wikilink' })
      : m[2]
        ? Decoration.mark({ class: 'cm-hl' })
        : Decoration.mark({ class: 'cm-tag' }),
})

const obsidianSyntax = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = obsidianDecorator.createDeco(view)
    }
    update(u: ViewUpdate) {
      this.decorations = obsidianDecorator.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.theme(
  {
    '&': { fontSize: '15.5px', backgroundColor: 'transparent' },
    // CodeMirror defaults .cm-scroller to monospace; notes read in the app sans.
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.65' },
    '.cm-content': {
      padding: '4px 0 40vh',
      caretColor: 'var(--accent)',
    },
    '.cm-line': { padding: '0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(167, 139, 250, 0.25) !important' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  },
  { dark: true },
)

export function MarkdownEditor({
  initialValue,
  onChange,
  autoFocus,
}: {
  initialValue: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const insertAtCursor = (view: EditorView, text: string) => {
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    }
    const handleImages = (view: EditorView, files: File[]) => {
      for (const f of files) {
        void uploadImage(f)
          .then((name) => insertAtCursor(view, `\n\n![[${name}]]\n\n`))
          .catch(() => {})
      }
      return files.length > 0
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(headingStyles),
          obsidianSyntax,
          theme,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            paste: (e, view) =>
              e.clipboardData?.files.length
                ? (e.preventDefault(), handleImages(view, imageFiles(e.clipboardData.files)))
                : false,
            drop: (e, view) =>
              e.dataTransfer?.files.length
                ? (e.preventDefault(), handleImages(view, imageFiles(e.dataTransfer.files)))
                : false,
          }),
        ],
      }),
    })
    if (autoFocus) view.focus()
    return () => view.destroy()
    // The editor is uncontrolled after mount; a new note remounts via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="md-editor" ref={hostRef} />
}
