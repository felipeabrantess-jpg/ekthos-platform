// ============================================================
// admin-start-impersonation
// POST — inicia uma sessão de impersonation para uma igreja.
//
// Substitui o INSERT direto feito por Church.tsx (~lines 1574-1596).
// Se esta EF falhar, o frontend NÃO deve entrar em impersonation.
//
// verify_jwt: false — valida JWT manualmente.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-request-id',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
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

  // supabaseAuth: usa anon key para validar o JWT do usuário server-side
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

  // supabaseAdmin: service_role para operações de dados
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ────────────────────────────────────────────
  let body: {
    church_id?: string
    notes?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { church_id, notes } = body

  // ── 3. Validação: church_id obrigatório ──────────────────────
  if (!church_id) {
    return json({ error: 'church_id é obrigatório' }, 400, origin)
  }

  // ── 4. Validação: church deve existir ───────────────────────
  const { data: church, error: churchErr } = await supabaseAdmin
    .from('churches')
    .select('id, name')
    .eq('id', church_id)
    .single()

  if (churchErr || !church) {
    return json({ error: 'Igreja não encontrada' }, 404, origin)
  }

  // ── 5. INSERT em impersonate_sessions ────────────────────────
  const { data: session, error: insertErr } = await supabaseAdmin
    .from('impersonate_sessions')
    .insert({
      admin_user_id: user.id,
      church_id:     church_id,
      started_at:    new Date().toISOString(),
      notes:         notes ?? null,
    })
    .select('id, started_at')
    .single()

  if (insertErr || !session) {
    console.error('[admin-start-impersonation] insert failed:', insertErr?.message)
    return json({ error: 'db_error: falha ao iniciar sessão' }, 500, origin)
  }

  const sessionId = (session as { id: string; started_at: string }).id

  // ── 6. Audit — fire-and-forget (não bloqueia retorno) ───────
  const requestId = req.headers.get('x-request-id') ?? null

  supabaseAdmin.rpc('record_audit_event', {
    p_church_id:                church_id,
    p_admin_user_id:            user.id,
    p_action:                   'impersonation.start',
    p_before:                   null,
    p_after:                    null,
    p_reason:                   null,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'impersonate_sessions',
    p_resource_id:              sessionId,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: sessionId,
    p_impersonated_church_id:   church_id,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  }).then(({ error: auditErr }) => {
    if (auditErr) {
      console.error('[admin-start-impersonation] audit failed:', auditErr.message)
    }
  })

  // ── 7. Response 200 ──────────────────────────────────────────
  return json(
    {
      session_id:  sessionId,
      started_at:  (session as { id: string; started_at: string }).started_at,
      church_id:   church_id,
      church_name: (church as { id: string; name: string }).name,
    },
    200,
    origin,
  )
})
