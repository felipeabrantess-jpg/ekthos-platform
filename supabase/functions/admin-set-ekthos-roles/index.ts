// ============================================================
// admin-set-ekthos-roles
// POST — atribui/revoga roles Ekthos (ekthos_admin, ekthos_support,
//         ekthos_commercial) de um usuário auth via cockpit.
//
// Body: { target_user_id, roles, reason }
// Regras:
//   - Caller deve ser ekthos_admin (is_ekthos_admin ou ekthos_roles[])
//   - Auto-elevação para ekthos_admin bloqueada se caller não for admin
//   - Não permite remover o último ekthos_admin ativo
//   - Grava record_audit_event ao final (fire-and-continue: não bloqueia)
//
// verify_jwt: false — valida JWT manualmente.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const VALID_ROLES = ['ekthos_admin', 'ekthos_support', 'ekthos_commercial'] as const
type EkthosRole = typeof VALID_ROLES[number]

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
  const origin    = req.headers.get('origin')
  const requestId = req.headers.get('x-request-id') ?? null

  // ── CORS preflight ───────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── 1. Auth: admin only ──────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  // supabaseAuth: anon key + Bearer token → getUser() server-side
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  // Compatibilidade: aceita is_ekthos_admin (bool legado) ou ekthos_roles[] contendo ekthos_admin
  const callerRoles = (user.app_metadata?.ekthos_roles as EkthosRole[] | undefined) ?? []
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    callerRoles.includes('ekthos_admin')

  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  // supabaseAdmin: service_role → operações de dados
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ────────────────────────────────────────────
  let body: {
    target_user_id?: unknown
    roles?: unknown
    reason?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { target_user_id, roles, reason } = body

  // ── 3. Validações de input ───────────────────────────────────

  // 3.1 target_user_id obrigatório
  if (!target_user_id || typeof target_user_id !== 'string') {
    return json({ error: 'target_user_id é obrigatório' }, 400, origin)
  }

  // 3.2 roles deve ser array
  if (!Array.isArray(roles)) {
    return json({ error: 'roles deve ser um array' }, 400, origin)
  }

  // 3.3 reason obrigatório e não vazio
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return json({ error: 'reason é obrigatório e não pode ser vazio' }, 400, origin)
  }

  const newRoles = roles as string[]
  const reasonStr = (reason as string).trim()

  // 3.4 roles deve ser subset de roles válidas
  const invalidRoles = newRoles.filter(r => !(VALID_ROLES as readonly string[]).includes(r))
  if (invalidRoles.length > 0) {
    return json(
      { error: `roles inválidas: ${invalidRoles.join(', ')}. Válidas: ${VALID_ROLES.join(', ')}` },
      422,
      origin,
    )
  }

  // 3.5 target_user_id deve existir em auth.users
  const { data: targetUserData, error: targetErr } =
    await supabaseAdmin.auth.admin.getUserById(target_user_id)

  if (targetErr || !targetUserData?.user) {
    return json({ error: 'Usuário não encontrado' }, 404, origin)
  }

  const targetUser = targetUserData.user

  // Estado anterior para audit
  const prevRoles   = (targetUser.app_metadata?.ekthos_roles as string[] | undefined) ?? []
  const prevIsAdmin = targetUser.app_metadata?.is_ekthos_admin === true

  // 3.6 Auto-elevação bloqueada: caller tenta dar ekthos_admin a si mesmo sem ser admin
  //     Obs.: já verificamos isAdmin acima, então se chegou até aqui o caller É admin.
  //     Esta checagem cobre o caso de caller com is_ekthos_admin=false tentando elevar a si.
  //     Porém pela regra da spec: bloqueado SE caller === target E roles inclui ekthos_admin
  //     E caller NÃO tem ekthos_admin atualmente.
  if (
    user.id === target_user_id &&
    newRoles.includes('ekthos_admin') &&
    !callerRoles.includes('ekthos_admin') &&
    user.app_metadata?.is_ekthos_admin !== true
  ) {
    return json(
      { error: 'Forbidden', reason: 'Auto-elevação para ekthos_admin não permitida' },
      403,
      origin,
    )
  }

  // 3.7 Não remover o último ekthos_admin ativo
  if (!newRoles.includes('ekthos_admin')) {
    const { data: remaining, error: countErr } = await supabaseAdmin.rpc(
      'count_remaining_admins',
      { p_exclude_id: target_user_id },
    )

    if (countErr) {
      console.error('[admin-set-ekthos-roles] count_remaining_admins error:', countErr.message)
      // Segurança conservadora: se não conseguir contar, bloquear
      return json(
        { error: 'Não é possível verificar admins restantes. Tente novamente.' },
        500,
        origin,
      )
    }

    if ((remaining as number) === 0) {
      return json(
        { error: 'Não é possível remover o último ekthos_admin ativo' },
        409,
        origin,
      )
    }
  }

  // ── 4. Aplicar update via Admin API ─────────────────────────
  const newIsAdmin = newRoles.includes('ekthos_admin')

  const { data: updatedData, error: updateErr } =
    await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      app_metadata: {
        ...targetUser.app_metadata,
        ekthos_roles:    newRoles,
        is_ekthos_admin: newIsAdmin,
      },
    })

  if (updateErr || !updatedData?.user) {
    console.error('[admin-set-ekthos-roles] updateUserById error:', updateErr?.message)
    return json({ error: 'Erro ao atualizar roles do usuário' }, 500, origin)
  }

  // ── 5. Audit (fire-and-continue) ────────────────────────────
  let auditId: string | null = null

  const { data: auditData, error: auditErr } = await supabaseAdmin.rpc('record_audit_event', {
    p_church_id:                null,
    p_admin_user_id:            user.id,
    p_action:                   'role.update',
    p_before:                   { roles: prevRoles, is_ekthos_admin: prevIsAdmin },
    p_after:                    { roles: newRoles, is_ekthos_admin: newIsAdmin },
    p_reason:                   reasonStr,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              callerRoles.length > 0 ? callerRoles : null,
    p_resource:                 'auth.users',
    p_resource_id:              target_user_id,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: null,
    p_impersonated_church_id:   null,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  })

  if (auditErr) {
    console.error('[admin-set-ekthos-roles] record_audit_event error:', auditErr.message)
  } else if (auditData) {
    auditId = auditData as string
  }

  // ── 6. Response 200 ──────────────────────────────────────────
  return json(
    {
      user_id:   target_user_id,
      new_roles: newRoles,
      audit_id:  auditId,
    },
    200,
    origin,
  )
})
