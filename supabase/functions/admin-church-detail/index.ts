// ============================================================
// Edge Function: admin-church-detail (v2)
// Retorna detalhes completos de uma igreja no formato flat
// esperado pelo ChurchDetail interface do frontend.
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
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  const churchId = new URL(req.url).searchParams.get('id')
  if (!churchId) return json({ error: 'id é obrigatório' }, 400)

  // ── Consultas em paralelo ──────────────────────────────────
  const [
    churchRes,
    subRes,
    healthRes,
    usersRes,
    agentsRes,
    adminEventsRes,
    notesRes,
    membersRes,
    cellsRes,
    ministriesRes,
    pipelineRes,
  ] = await Promise.all([
    // Igreja
    supabase.from('churches').select('*').eq('id', churchId).single(),

    // Assinatura mais recente
    supabase
      .from('subscriptions')
      .select('id, plan_slug, status, current_period_end, custom_plan_price_cents, custom_user_price_cents, custom_agent_price_cents, price_notes, extra_users, extra_agents')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Health score mais recente
    supabase
      .from('health_scores')
      .select('score, components, calculated_at')
      .eq('church_id', churchId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Usuários da igreja
    supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('church_id', churchId),

    // Agentes ativos
    supabase
      .from('subscription_agents')
      .select('agent_slug, source, active')
      .eq('church_id', churchId)
      .eq('active', true),

    // Eventos admin (para o tab Logs)
    supabase
      .from('admin_events')
      .select('id, action, created_at, after, reason')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(20),

    // Notas internas
    supabase
      .from('church_notes')
      .select('id, body, pinned, admin_user_id, created_at, updated_at')
      .eq('church_id', churchId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),

    // Contagem de membros
    supabase
      .from('people')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId),

    // Contagem de células
    supabase
      .from('cells')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId),

    // Contagem de ministérios
    supabase
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId),

    // Contagem de etapas do pipeline
    supabase
      .from('pipeline_stages')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', churchId),
  ])

  if (churchRes.error || !churchRes.data) {
    return json({ error: 'Igreja não encontrada' }, 404)
  }

  const church = churchRes.data
  const sub    = subRes.data ?? null
  const health = healthRes.data ?? null

  // MRR calculado com preço customizado ou preço padrão do plano
  let mrrCents = 0
  if (sub) {
    // Busca preço base do plano
    const { data: plan } = await supabase
      .from('plans')
      .select('price_cents, user_price_cents, agent_price_cents')
      .eq('slug', sub.plan_slug ?? '')
      .maybeSingle()

    const basePlan  = sub.custom_plan_price_cents  ?? plan?.price_cents       ?? 0
    const baseUser  = sub.custom_user_price_cents  ?? plan?.user_price_cents  ?? 2990
    const baseAgent = sub.custom_agent_price_cents ?? plan?.agent_price_cents ?? 4990
    mrrCents = basePlan
             + (sub.extra_users  ?? 0) * baseUser
             + (sub.extra_agents ?? 0) * baseAgent
  }

  // Formata logs (admin_events + impersonate_sessions combinados)
  const logs = (adminEventsRes.data ?? []).map(e => ({
    id:         e.id,
    action:     e.action + (e.reason ? ` — ${e.reason}` : ''),
    created_at: e.created_at,
    metadata:   e.after ?? {},
  }))

  return json({
    // Identificação
    id:           church.id,
    name:         church.name,
    logo_url:     church.logo_url   ?? null,
    city:         church.city       ?? null,
    state:        church.state      ?? null,
    status:       church.status,
    created_at:   church.created_at,
    timezone:     church.timezone,
    is_matrix:    church.is_matrix  ?? false,
    parent_church_id: church.parent_church_id ?? null,

    // Assinatura
    subscription_id:          sub?.id                       ?? null,
    plan_slug:                 sub?.plan_slug               ?? null,
    subscription_status:       sub?.status                  ?? null,
    current_period_end:        sub?.current_period_end      ?? null,
    mrr:                       Math.round(mrrCents) / 100,

    // Precificação customizada
    custom_plan_price_cents:   sub?.custom_plan_price_cents  ?? null,
    custom_user_price_cents:   sub?.custom_user_price_cents  ?? null,
    custom_agent_price_cents:  sub?.custom_agent_price_cents ?? null,
    price_notes:               sub?.price_notes              ?? null,

    // Operação
    members_count:    membersRes.count     ?? 0,
    cells_count:      cellsRes.count       ?? 0,
    ministries_count: ministriesRes.count  ?? 0,
    pipeline_stages:  pipelineRes.count    ?? 0,

    // Saúde
    health_score:      health?.score      ?? null,
    health_components: health?.components ?? {},

    // Usuários
    users: (usersRes.data ?? []).map(u => ({
      id:   u.user_id,
      role: u.role,
    })),

    // Agentes
    agents: (agentsRes.data ?? []).map(a => ({
      id:       a.agent_slug,
      name:     a.agent_slug,
      status:   a.active ? 'active' : 'inactive',
      calls_30d: 0,
    })),

    // Notas internas
    notes: notesRes.data ?? [],

    // Logs (admin_events)
    logs,

    generated_at: new Date().toISOString(),
  })
})
