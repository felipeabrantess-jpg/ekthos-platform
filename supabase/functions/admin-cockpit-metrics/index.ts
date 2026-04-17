// ============================================================
// Edge Function: admin-cockpit-metrics (v2)
// Retorna métricas consolidadas no formato exato do CockpitData
// esperado pelo frontend Cockpit.tsx.
//
// GET /admin-cockpit-metrics
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

function centsToReais(cents: number): number {
  return Math.round(cents) / 100
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

  // ── Datas de referência ───────────────────────────────────
  const now          = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  // ── Consultas em paralelo ──────────────────────────────────
  const [
    churchesRes,
    subscriptionsRes,
    plansRes,
    prevSubsRes,
    churnRes,
    newThisMonthRes,
    lowHealthRes,
    stuckOnboardingRes,
    tasksRes,
  ] = await Promise.all([
    // Contagem por status
    supabase.from('churches').select('status, created_at'),

    // Assinaturas ativas com campos custom de preço
    supabase
      .from('subscriptions')
      .select('plan_slug, status, extra_agents, extra_users, custom_plan_price_cents, custom_user_price_cents, custom_agent_price_cents, current_period_start')
      .in('status', ['active', 'trialing']),

    // Tabela de planos com preços
    supabase.from('plans').select('slug, price_cents, user_price_cents, agent_price_cents'),

    // Assinaturas ativas no mês passado (para mrr_prev)
    supabase
      .from('subscriptions')
      .select('plan_slug, extra_agents, extra_users, custom_plan_price_cents, custom_user_price_cents, custom_agent_price_cents')
      .in('status', ['active', 'trialing'])
      .lt('created_at', lastMonthEnd),

    // Cancelamentos nos últimos 30 dias (churn)
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('updated_at', thirtyDaysAgo),

    // Novas igrejas este mês
    supabase
      .from('churches')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thisMonthStart),

    // Saúde baixa (score < 40 ou null mas com status configured)
    supabase
      .from('health_scores')
      .select('church_id', { count: 'exact', head: true })
      .lt('score', 40)
      .gte('calculated_at', thirtyDaysAgo),

    // Onboarding travado (status=onboarding e criado há +14 dias)
    supabase
      .from('churches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'onboarding')
      .lt('created_at', fourteenDaysAgo),

    // Tarefas abertas (tasks_pending)
    supabase
      .from('admin_tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
  ])

  // ── Planos: mapa slug → preços ─────────────────────────────
  const planMap: Record<string, { plan: number; user: number; agent: number }> = {}
  for (const p of (plansRes.data ?? [])) {
    planMap[p.slug] = {
      plan:  p.price_cents        ?? 0,
      user:  p.user_price_cents   ?? 2990,
      agent: p.agent_price_cents  ?? 4990,
    }
  }

  function calcMrrCents(subs: typeof subscriptionsRes.data): number {
    let mrr = 0
    for (const sub of (subs ?? [])) {
      const prices = planMap[sub.plan_slug ?? ''] ?? { plan: 0, user: 2990, agent: 4990 }
      const planPrice  = sub.custom_plan_price_cents  ?? prices.plan
      const userPrice  = sub.custom_user_price_cents  ?? prices.user
      const agentPrice = sub.custom_agent_price_cents ?? prices.agent
      mrr += planPrice
           + (sub.extra_users  ?? 0) * userPrice
           + (sub.extra_agents ?? 0) * agentPrice
    }
    return mrr
  }

  const mrrCents     = calcMrrCents(subscriptionsRes.data)
  const mrrPrevCents = calcMrrCents(prevSubsRes.data)

  // ── Contagens por status ───────────────────────────────────
  const churchesByStatus: Record<string, number> = {}
  for (const row of (churchesRes.data ?? [])) {
    const s = row.status as string
    churchesByStatus[s] = (churchesByStatus[s] ?? 0) + 1
  }

  const activeSubs   = subscriptionsRes.data ?? []
  const ticketCents  = activeSubs.length > 0 ? Math.round(mrrCents / activeSubs.length) : 0
  const churnCount   = churnRes.count ?? 0
  const totalActive  = activeSubs.length
  const churnRate    = totalActive + churnCount > 0
    ? +((churnCount / (totalActive + churnCount)) * 100).toFixed(1)
    : 0

  // ── MRR série — últimos 12 meses ──────────────────────────
  // Agrupa assinaturas por mês de início
  const mrrByMonth: Record<string, number> = {}
  const monthLabels: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    monthLabels.push(key)
    mrrByMonth[key] = 0
  }
  for (const sub of activeSubs) {
    if (!sub.current_period_start) continue
    const d = new Date(sub.current_period_start)
    const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    if (key in mrrByMonth) {
      const prices = planMap[sub.plan_slug ?? ''] ?? { plan: 0, user: 2990, agent: 4990 }
      mrrByMonth[key] += sub.custom_plan_price_cents ?? prices.plan
    }
  }
  // Se não há dados suficientes, usa MRR total no mês atual
  const currentMonthKey = monthLabels[11]
  if (mrrByMonth[currentMonthKey] === 0 && mrrCents > 0) {
    mrrByMonth[currentMonthKey] = mrrCents
  }

  const mrrSeries = monthLabels.map(mes => ({
    mes,
    mrr: centsToReais(mrrByMonth[mes]),
  }))

  // ── Late payments: subscriptions com status=past_due ──────
  const { count: latePayments } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'past_due')

  return json({
    // Métricas principais (em reais)
    mrr_total:           centsToReais(mrrCents),
    mrr_prev:            centsToReais(mrrPrevCents),
    ticket_medio:        centsToReais(ticketCents),
    churn_rate:          churnRate,
    new_this_month:      newThisMonthRes.count ?? 0,

    // Igrejas por status
    churches_total:      (churchesRes.data ?? []).length,
    churches_configured: churchesByStatus['configured']  ?? 0,
    churches_onboarding: churchesByStatus['onboarding']  ?? 0,
    churches_suspended:  churchesByStatus['suspended']   ?? 0,

    // Gráfico
    mrr_series: mrrSeries,

    // Alertas operacionais
    alerts: {
      late_payments:    latePayments   ?? 0,
      low_health:       lowHealthRes.count ?? 0,
      onboarding_stuck: stuckOnboardingRes.count ?? 0,
      agent_errors:     0, // TODO: implementar quando logs de agentes estiverem disponíveis
      tasks_pending:    tasksRes.count ?? 0,
    },

    generated_at: new Date().toISOString(),
  })
})
