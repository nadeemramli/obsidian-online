// case-generate — seeded, invariant-gated case generation (PRD §11.5).
//
// The generator module is server-only by design: if it shipped in the client
// bundle a learner could recompute answer keys from the seed. This function
// verifies the caller's JWT, generates deterministically, re-runs the
// invariant gate, and persists the case (configs) and its keys (service-only
// table) under the caller's user id. The seed is stored for exact replay.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateSoleTraderCase, TEMPLATE } from './generator.ts'
import { generateLimitedCompanyCase, LTD_TEMPLATE } from './limited.ts'

const GENERATORS: Record<string, { generate: (seed: number) => any; template: string }> = {
  sole_trader: { generate: generateSoleTraderCase, template: TEMPLATE },
  limited_company: { generate: generateLimitedCompanyCase, template: LTD_TEMPLATE },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'Not signed in' }, 401)

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }

  const family = body?.family ?? 'sole_trader'
  const generatorDef = GENERATORS[family]
  if (!generatorDef) return json({ error: `No generator for family "${family}" yet` }, 400)

  // Accept an explicit seed for exact reproduction; otherwise draw one from
  // the platform CSPRNG (the seed itself need not be deterministic — the case
  // derived FROM it must be, and is stored for replay).
  let seed: number
  if (body?.seed !== undefined) {
    seed = Number(body.seed)
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
      return json({ error: 'seed must be an integer in [0, 2^32)' }, 400)
  } else {
    seed = crypto.getRandomValues(new Uint32Array(1))[0]
  }

  let generated
  try {
    generated = generatorDef.generate(seed) // includes the invariant gate
  } catch (e) {
    // Invariant failure blocks delivery (PRD §18.2). Should not happen —
    // generation is constructive — but if it does, the learner never sees it.
    return json({ error: `Generation failed: ${(e as Error).message}` }, 500)
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: caseRow, error: caseError } = await serviceClient
    .from('generated_cases')
    .insert({
      user_id: user.id,
      family,
      template: generatorDef.template,
      seed,
      title: generated.title,
      stages: generated.stages,
      config: generated.config,
    })
    .select('id, seed, title')
    .single()
  if (caseError) return json({ error: caseError.message }, 500)

  const { error: keysError } = await serviceClient
    .from('generated_case_keys')
    .insert({ case_id: caseRow.id, keys: generated.keys })
  if (keysError) {
    // Never leave a playable case without its key.
    await serviceClient.from('generated_cases').delete().eq('id', caseRow.id)
    return json({ error: keysError.message }, 500)
  }

  return json({ case_id: caseRow.id, seed: caseRow.seed, title: caseRow.title })
})
