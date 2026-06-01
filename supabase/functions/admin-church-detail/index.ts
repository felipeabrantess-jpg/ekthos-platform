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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// SA-B7 MEGA-ONDA SEGURANÇA: CORS origin validation (fix RISK-002)
// Reflete apenas origens conhecidas; rejeita todas as demais.
const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
  'https://app.ekthosai.com',
]

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'GET')    return new Response('Method Not Allowed', { status: 405, headers: cors(req) })

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, req)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, req)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, req)

  const churchId = new URL(req.url).searchParams.get('id')
  if (!churchId) return json({ error: 'id é obrigatório' }, 400, req)

  // ── Registra leitura sensível via record_audit_event ────────
  const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
  const requestId = req.headers.get('x-request-id') ?? null
  const { error: auditErr } = await supabase.rpc('record_audit_event', {
    p_church_id:                churchId,
    p_admin_user_id:            user.id,
    p_action:                   'church.read.sensitive',
    p_before:                   null,
    p_after:                    null,
    p_reason:                   null,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'churches',
    p_resource_id:              churchId,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: impersonationSessionId,
    p_impersonated_church_id:   churchId,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  })
  if (auditErr) console.error('[admin-church-detail] audit failed:', auditErr.message)

  // ── Consultas em paralelo ──────────────────────────────────
  const [
    churchRes,
    subRes,
    healthRes,
    usersRes,
    agentsRes,
    agentGrantsRes,
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

    // Agent grants (cockpit-granted — sem subscription_id)
    supabase
      .from('agent_grants')
      .select('agent_slug, grant_type, ends_at, starts_at, active')
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
    return json({ error: 'Igreja não encontrada' }, 404, req)
  }

  const church = churchRes.data
  const sub    = subRes.data ?? null
  const health = healthRes.data ?? null

  // Busca emails dos usuários da igreja via auth.admin API
  const roleRows = usersRes.data ?? []
  const authEmailMap: Record<string, { email: string; last_sign_in_at: string | null }> = {}
  for (const row of roleRows) {
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(row.user_id)
    if (authUser) {
      authEmailMap[row.user_id] = {
        email:            authUser.email ?? '',
        last_sign_in_at:  authUser.last_sign_in_at ?? null,
      }
    }
  }

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
    const baseUser  = sub.custom_user_price_cents  ?? plan?.user_price_cents  ?? 5990
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

  // Build merged agents list: subscription_agents + agent_grants (sem duplicar por slug)
  const subAgentsList = (agentsRes.data ?? []) as Array<{ agent_slug: string; active: boolean }>
  const agentGrantsList = (agentGrantsRes.data ?? []) as Array<{
    agent_slug: string; grant_type: string; ends_at: string | null; starts_at: string; active: boolean
  }>
  const subSlugs = new Set(subAgentsList.map(a => a.agent_slug))
  const mergedAgents = [
    ...subAgentsList.map(a => ({
      id:            a.agent_slug,
      name:          a.agent_slug,
      status:        'active',
      calls_30d:     0,
      source:        'subscription',
      grant_ends_at: null as null,
    })),
    ...agentGrantsList
      .filter(g => !subSlugs.has(g.agent_slug))
      .map(g => ({
        id:            g.agent_slug,
        name:          g.agent_slug,
        status:        'active',
        calls_30d:     0,
        source:        g.grant_type,
        grant_ends_at: g.ends_at,
      })),
  ]

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

    // Identidade (campos editáveis na aba Cadastro)
    pastor_titular_name:   church.pastor_titular_name   ?? null,
    pastor_titular_phone:  church.pastor_titular_phone  ?? null,
    denomination:          church.denomination          ?? null,
    vision_statement:      church.vision_statement      ?? null,
    address_full:          church.address_full          ?? null,
    main_phone:            church.main_phone            ?? null,
    main_email:            church.main_email            ?? null,
    website_url:           church.website_url           ?? null,
    social_media_handles:  church.social_media_handles  ?? {},
    region:                church.region                ?? null,

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
    users: roleRows.map(u => ({
      id:           u.user_id,
      role:         u.role,
      email:        authEmailMap[u.user_id]?.email        ?? null,
      last_sign_in: authEmailMap[u.user_id]?.last_sign_in_at ?? null,
    })),

    // Agentes (subscription_agents + agent_grants mesclados)
    agents: mergedAgents,

    // Notas internas
    notes: notesRes.data ?? [],

    // Logs (admin_events)
    logs,

    // Módulos habilitados (feature flags por igreja)
    enabled_modules: (church.enabled_modules as Record<string, boolean> | null) ?? null,

    generated_at: new Date().toISOString(),
  }, 200, req)
})
