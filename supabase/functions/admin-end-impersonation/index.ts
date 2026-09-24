// ============================================================
// admin-end-impersonation
// POST — encerra uma sessão de impersonation.
//
// ETAPA 2: a RPC impersonation_end() roda com o JWT do próprio admin:
// valida auth.uid() = dono da sessão, fecha server-side, audita e
// devolve o contexto efetivo já revertido ao tenant original.
// Sessão de outro admin ou inexistente → 404 (não revela existência).
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

interface EndContext {
  effective_church_id: string | null
  is_impersonating:    boolean
  ended_session_id?:   string
  duration_seconds?:   number
  already_ended?:      boolean
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
  let body: { session_id?: string; ended_reason?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }
  const { session_id, ended_reason } = body
  if (!session_id) {
    return json({ error: 'session_id é obrigatório' }, 400, origin)
  }

  // ── 3. RPC: valida dono, fecha, audita, devolve contexto revertido ─
  const { data, error } = await supabaseAuth.rpc('impersonation_end', {
    p_session_id: session_id,
    p_reason:     ended_reason ?? 'manual_exit',
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('SESSION_NOT_FOUND')) return json({ error: 'Sessão não encontrada' }, 404, origin)
    if (msg.includes('FORBIDDEN'))         return json({ error: 'Forbidden' }, 403, origin)
    console.error('[admin-end-impersonation] rpc failed:', msg)
    return json({ error: 'db_error: falha ao encerrar sessão' }, 500, origin)
  }

  const ctx = data as EndContext | null
  if (!ctx || ctx.is_impersonating) {
    console.error('[admin-end-impersonation] contexto ainda impersonando:', JSON.stringify(ctx))
    return json({ error: 'db_error: sessão continua ativa' }, 500, origin)
  }

  // ── 4. Response 200 ──────────────────────────────────────────
  return json(
    {
      session_id,
      ended_at:         new Date().toISOString(),
      duration_seconds: ctx.duration_seconds ?? 0,
      already_ended:    ctx.already_ended === true,
      context:          ctx,
    },
    200,
    origin,
  )
})
