// ============================================================
// Edge Function: church-invite-user
// Convida um usuário para a igreja via Supabase inviteUserByEmail.
//
// POST /church-invite-user
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { email: string, role: 'admin' | 'cell_leader' | 'volunteer', name?: string }
// Returns: 201 { user_id, email, role }
//          400/403/409/500 com { error }
//
// verify_jwt: false — validação manual (padrão ES256)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ALLOWED_ROLES = ['admin', 'cell_leader', 'volunteer']

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonErr('Method not allowed', 405)

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonErr('Unauthorized', 401)
  const token = authHeader.slice(7)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  const churchId   = user.app_metadata?.church_id as string | undefined
  const callerRole = user.app_metadata?.role       as string | undefined

  if (!churchId)             return jsonErr('Church not found in token', 400)
  if (callerRole !== 'admin') return jsonErr('Apenas administradores podem convidar usuários', 403)

  // ── Body ──────────────────────────────────────────────────
  let body: { email?: string; role?: string; name?: string }
  try { body = await req.json() } catch { return jsonErr('Invalid JSON body', 400) }

  const { email, role, name } = body
  if (!email || typeof email !== 'string') return jsonErr('email é obrigatório', 400)
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return jsonErr(`role deve ser: ${ALLOWED_ROLES.join(', ')}`, 400)
  }

  // ── Checar limite de assentos ─────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('extra_users, plan:plans(max_users)')
    .eq('church_id', churchId)
    .maybeSingle()

  const maxUsers = ((sub?.plan as { max_users?: number } | null)?.max_users ?? 2)
                 + (sub?.extra_users ?? 0)

  const { count: currentUsers } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('church_id', churchId)

  if ((currentUsers ?? 0) >= maxUsers) {
    return jsonErr(`Limite de ${maxUsers} usuários atingido. Faça upgrade do plano.`, 403)
  }

  // ── Convidar via Admin API ─────────────────────────────────
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { data: { name: name ?? '', church_id: churchId } },
  )

  if (inviteErr) {
    console.error('[church-invite-user] inviteUserByEmail error:', inviteErr.message)
    // Se o usuário já existe no sistema Supabase, inviteUserByEmail pode falhar.
    // Retornamos a mensagem original para o frontend tratar.
    return jsonErr(inviteErr.message, 500)
  }

  const newUserId = inviteData.user.id

  // ── Setar app_metadata (crítico para RLS funcionar) ────────
  const { error: updateErr } = await supabase.auth.admin.updateUserById(newUserId, {
    app_metadata: { church_id: churchId, role },
  })
  if (updateErr) {
    console.error('[church-invite-user] updateUserById error:', updateErr.message)
    // Não abortamos — convite já enviado. Logar e continuar.
  }

  // ── Inserir user_role ──────────────────────────────────────
  await supabase.from('user_roles').upsert(
    { user_id: newUserId, church_id: churchId, role },
    { onConflict: 'user_id,church_id' },
  )

  // ── Upsert perfil ─────────────────────────────────────────
  await supabase.from('profiles').upsert(
    {
      user_id:      newUserId,
      church_id:    churchId,
      name:         name ?? null,
      display_name: name ?? null,
    },
    { onConflict: 'user_id' },
  )

  console.log(`[church-invite-user] invited ${email} as ${role} for church ${churchId}`)
  return jsonOk({ user_id: newUserId, email, role }, 201)
})
