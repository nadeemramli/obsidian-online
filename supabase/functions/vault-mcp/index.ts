// vault-mcp — an MCP server (Streamable HTTP, JSON-RPC 2.0) exposing the
// markdown vault to Claude via tools: list/get/search/create/update/delete.
//
// Auth (two layers):
//   Authorization: Bearer <anon key>   — platform JWT check (verify_jwt=true)
//   x-vault-token: <token>             — checked against public.mcp_tokens,
//                                        which is RLS-locked to service role.
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SERVER_INFO = { name: 'vault-mcp', version: '1.1.0' }

const TOOLS = [
  {
    name: 'list_notes',
    description: 'List notes in the vault (most recently updated first). Returns title, slug, folder and updated_at.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max notes to return (default 50)' },
        folder: { type: 'string', description: 'Only notes in this folder path (optional)' },
      },
    },
  },
  {
    name: 'get_note',
    description: 'Get a single note (full markdown content) by its slug.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The note slug, e.g. "neural-networks"' } },
      required: ['slug'],
    },
  },
  {
    name: 'search_notes',
    description: 'Search notes by a keyword across titles, content and folders. Returns matching titles, slugs, folders and a snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword or phrase to search for' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_note',
    description:
      'Create a markdown note. Supports Obsidian syntax: YAML frontmatter, [[wikilinks]], ![[embeds]], ![[image.png]] attachments, ==highlights==, #tags, > [!note] callouts. A unique slug is generated from the title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Markdown body (may start with YAML frontmatter)' },
        folder: {
          type: 'string',
          description: 'Folder path like "Books/Stats 101" (optional; "" = vault root)',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_note',
    description: 'Update the title, content and/or folder of an existing note, addressed by slug.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Slug of the note to update' },
        title: { type: 'string', description: 'New title (optional)' },
        content: { type: 'string', description: 'New markdown content (optional)' },
        folder: { type: 'string', description: 'New folder path (optional)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'delete_note',
    description: 'Delete a note by slug. This cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Slug of the note to delete' } },
      required: ['slug'],
    },
  },
]

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_notes': {
      let q = supabase
        .from('notes')
        .select('title, slug, folder, updated_at')
        .order('updated_at', { ascending: false })
        .limit(Number(args.limit) || 50)
      if (typeof args.folder === 'string' && args.folder !== '') q = q.eq('folder', args.folder)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data
    }
    case 'get_note': {
      const { data, error } = await supabase
        .from('notes')
        .select('title, slug, content, folder, created_at, updated_at')
        .eq('slug', String(args.slug))
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error(`No note with slug "${args.slug}"`)
      return data
    }
    case 'search_notes': {
      const q = String(args.query).replaceAll('%', '\\%').replaceAll('_', '\\_')
      const { data, error } = await supabase
        .from('notes')
        .select('title, slug, content, folder, updated_at')
        .or(`title.ilike.%${q}%,content.ilike.%${q}%,folder.ilike.%${q}%`)
        .order('updated_at', { ascending: false })
        .limit(Number(args.limit) || 20)
      if (error) throw new Error(error.message)
      return data?.map((n) => {
        const i = n.content.toLowerCase().indexOf(String(args.query).toLowerCase())
        const snippet =
          i >= 0 ? n.content.slice(Math.max(0, i - 80), i + 120) : n.content.slice(0, 200)
        return { title: n.title, slug: n.slug, folder: n.folder, updated_at: n.updated_at, snippet }
      })
    }
    case 'create_note': {
      const { data, error } = await supabase.rpc('add_note', {
        p_title: String(args.title),
        p_content: String(args.content),
        p_folder: typeof args.folder === 'string' ? args.folder : '',
      })
      if (error) throw new Error(error.message)
      return { title: data.title, slug: data.slug, folder: data.folder, url: `#/note/${data.slug}` }
    }
    case 'update_note': {
      const patch: Record<string, string> = {}
      if (typeof args.title === 'string') patch.title = args.title
      if (typeof args.content === 'string') patch.content = args.content
      if (typeof args.folder === 'string') patch.folder = args.folder
      if (Object.keys(patch).length === 0)
        throw new Error('Provide title, content and/or folder to update')
      const { data, error } = await supabase
        .from('notes')
        .update(patch)
        .eq('slug', String(args.slug))
        .select('title, slug, folder, updated_at')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error(`No note with slug "${args.slug}"`)
      return data
    }
    case 'delete_note': {
      const { data, error } = await supabase
        .from('notes')
        .delete()
        .eq('slug', String(args.slug))
        .select('slug')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error(`No note with slug "${args.slug}"`)
      return { deleted: String(args.slug) }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-vault-token, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function rpcResult(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function isAuthorized(req: Request): Promise<boolean> {
  const url = new URL(req.url)
  const token = req.headers.get('x-vault-token') ?? url.searchParams.get('token')
  if (!token) return false
  const { data } = await supabase.from('mcp_tokens').select('token').eq('token', token).maybeSingle()
  return !!data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method === 'GET') {
    // No standalone SSE stream; clients using Streamable HTTP POST work fine.
    return new Response('vault-mcp: POST JSON-RPC messages to this endpoint', {
      status: 405,
      headers: CORS_HEADERS,
    })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS_HEADERS })

  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ error: 'missing or invalid x-vault-token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  let msg: any
  try {
    msg = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }

  // Notifications (no id) just get acknowledged.
  if (msg && msg.id === undefined) return new Response(null, { status: 202, headers: CORS_HEADERS })

  try {
    switch (msg.method) {
      case 'initialize':
        return rpcResult(msg.id, {
          protocolVersion: msg.params?.protocolVersion || '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Markdown vault ("online Obsidian"). Notes support YAML frontmatter, [[wikilinks]], ![[embeds]], ![[image.png]] attachments, ==highlights==, #tags, callouts, and folders (path-like, e.g. "Books/Stats 101"). Use create_note to save book notes; search_notes/get_note to read existing ones.',
        })
      case 'ping':
        return rpcResult(msg.id, {})
      case 'tools/list':
        return rpcResult(msg.id, { tools: TOOLS })
      case 'tools/call': {
        try {
          const out = await callTool(msg.params?.name, msg.params?.arguments ?? {})
          return rpcResult(msg.id, {
            content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          })
        } catch (e) {
          return rpcResult(msg.id, {
            content: [{ type: 'text', text: `Error: ${(e as Error).message}` }],
            isError: true,
          })
        }
      }
      default:
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`)
    }
  } catch (e) {
    return rpcError(msg.id ?? null, -32603, `Internal error: ${(e as Error).message}`)
  }
})
