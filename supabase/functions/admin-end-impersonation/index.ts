// ============================================================
// admin-end-impersonation
// POST — encerra uma sessão de impersonation, registra audit
// e retorna a duração em segundos.
//
// Fluxo: frontend chama esta EF ao sair da visualização de
// uma igreja, passando o session_id salvo no localStorage.
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
    session_id?:    string
    ended_reason?:  string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { session_id, ended_reason } = body

  // ── 3. Validação: session_id obrigatório ─────────────────────
  if (!session_id) {
    return json({ error: 'session_id é obrigatório' }, 400, origin)
  }

  // ── 4. Buscar sessão ─────────────────────────────────────────
  const { data: session, error: fetchErr } = await supabaseAdmin
    .from('impersonate_sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (fetchErr || !session) {
    return json({ error: 'Sessão não encontrada' }, 404, origin)
  }

  type ImpersonateSession = {
    id:             string
    admin_user_id:  string
    church_id:      string
    started_at:     string
    ended_at:       string | null
    notes:          string | null
    ended_reason:   string | null
    last_action_at: string | null
  }
  const typedSession = session as ImpersonateSession

  // ── 5. Verificar dono da sessão ──────────────────────────────
  if (typedSession.admin_user_id !== user.id) {
    return json({ error: 'Forbidden: sessão pertence a outro admin' }, 403, origin)
  }

  // ── 6. Verificar se já foi encerrada ─────────────────────────
  if (typedSession.ended_at !== null) {
    return json({ error: 'Sessão já foi encerrada' }, 409, origin)
  }

  // ── 7. Encerrar sessão ───────────────────────────────────────
  const endedAt       = new Date()
  const endedReason   = ended_reason ?? 'manual_exit'
  const durationSeconds = Math.round(
    (endedAt.getTime() - new Date(typedSession.started_at).getTime()) / 1000,
  )

  const { error: updateErr } = await supabaseAdmin
    .from('impersonate_sessions')
    .update({
      ended_at:     endedAt.toISOString(),
      ended_reason: endedReason,
    })
    .eq('id', session_id)

  if (updateErr) {
    console.error('[admin-end-impersonation] update failed:', updateErr.message)
    return json({ error: 'db_error: falha ao encerrar sessão' }, 500, origin)
  }

  // ── 8. Audit — fire-and-forget (não bloqueia retorno) ───────
  const requestId = req.headers.get('x-request-id') ?? null

  supabaseAdmin.rpc('record_audit_event', {
    p_church_id:                typedSession.church_id,
    p_admin_user_id:            user.id,
    p_action:                   'impersonation.end',
    p_before:                   null,
    p_after:                    {
      duration_seconds: durationSeconds,
      reason:           endedReason,
    },
    p_reason:                   endedReason,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'impersonate_sessions',
    p_resource_id:              session_id,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: session_id,
    p_impersonated_church_id:   typedSession.church_id,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  }).then(({ error: auditErr }) => {
    if (auditErr) {
      console.error('[admin-end-impersonation] audit failed:', auditErr.message)
    }
  })

  // ── 9. Response 200 ──────────────────────────────────────────
  return json(
    {
      session_id,
      ended_at:         endedAt.toISOString(),
      duration_seconds: durationSeconds,
    },
    200,
    origin,
  )
})
