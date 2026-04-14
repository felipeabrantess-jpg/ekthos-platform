// ============================================================
// Edge Function: admin-church-detail
// Retorna detalhes completos de uma igreja específica.
//
// GET /admin-church-detail?id=<church_id>
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN           = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET')    return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // Auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  const churchId = new URL(req.url).searchParams.get('id')
  if (!churchId) return json({ error: 'id é obrigatório' }, 400)

  // Busca em paralelo: church + subscription + health score + usuários + agentes ativos
  const [churchRes, subRes, healthRes, usersRes, agentsRes, impersonateRes] = await Promise.all([
    supabase
      .from('churches')
      .select('*')
      .eq('id', churchId)
      .single(),

    supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('health_scores')
      .select('score, components, calculated_at')
      .eq('church_id', churchId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('church_id', churchId),

    supabase
      .from('subscription_agents')
      .select('agent_slug, source, active')
      .eq('active', true),

    supabase
      .from('impersonate_sessions')
      .select('admin_user_id, started_at, ended_at, notes')
      .eq('church_id', churchId)
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  if (churchRes.error || !churchRes.data) {
    return json({ error: 'Igreja não encontrada' }, 404)
  }

  return json({
    church:            churchRes.data,
    subscription:      subRes.data ?? null,
    health:            healthRes.data ?? null,
    users:             usersRes.data ?? [],
    active_agents:     agentsRes.data ?? [],
    impersonate_log:   impersonateRes.data ?? [],
    generated_at:      new Date().toISOString(),
  })
})
