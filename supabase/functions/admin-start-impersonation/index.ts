// ============================================================
// admin-start-impersonation
// POST — inicia uma sessão de impersonation para uma igreja.
//
// ETAPA 2: a sessão é criada pela RPC impersonation_start() com o JWT
// do próprio admin. O banco valida identidade (is_ekthos_admin), igreja,
// fecha sessão anterior (uma por admin), audita e devolve o contexto
// efetivo (get_my_tenant_context). A partir daí RLS/PostgREST/RPCs já
// enxergam a igreja impersonada — nada depende do localStorage.
//
// verify_jwt: false — valida JWT manualmente.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const ALLOWED_ORIGINS = [
  'https://app.ekthoschurch.com',
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:'))
      ? origin
      : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-request-id',
    'Vary':                         'Origin',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

interface TenantContext {
  effective_church_id:      string | null
  church_name:              string | null
  is_impersonating:         boolean
  impersonation_session_id: string | null
  impersonation_started_at: string | null
  role:                     string | null
  is_ekthos_admin:          boolean
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── 1. Auth: admin only ──────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  // Cliente com o JWT do usuário: a RPC roda como auth.uid() do admin
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    (user.app_metadata?.ekthos_roles as string[] | undefined)?.includes('ekthos_admin') === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  // ── 2. Parse body ────────────────────────────────────────────
  let body: { church_id?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }
  const { church_id, notes } = body
  if (!church_id) {
    return json({ error: 'church_id é obrigatório' }, 400, origin)
  }

  // ── 3. RPC transacional: valida igreja, fecha sessão anterior, insere, audita ─
  const { data, error } = await supabaseAuth.rpc('impersonation_start', {
    p_church_id: church_id,
    p_notes:     notes ?? null,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('CHURCH_NOT_FOUND')) return json({ error: 'Igreja não encontrada' }, 404, origin)
    if (msg.includes('FORBIDDEN'))        return json({ error: 'Forbidden' }, 403, origin)
    console.error('[admin-start-impersonation] rpc failed:', msg)
    return json({ error: 'db_error: falha ao iniciar sessão' }, 500, origin)
  }

  const ctx = data as TenantContext | null
  if (!ctx?.is_impersonating || !ctx.impersonation_session_id) {
    console.error('[admin-start-impersonation] contexto sem sessão ativa:', JSON.stringify(ctx))
    return json({ error: 'db_error: sessão não ficou ativa' }, 500, origin)
  }

  // ── 4. Response 200 (formato compatível + contexto efetivo) ─
  return json(
    {
      session_id:  ctx.impersonation_session_id,
      started_at:  ctx.impersonation_started_at,
      church_id:   ctx.effective_church_id,
      church_name: ctx.church_name,
      context:     ctx,
    },
    200,
    origin,
  )
})
