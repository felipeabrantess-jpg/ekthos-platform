// ============================================================
// Edge Function: admin-cockpit-metrics
// Retorna métricas consolidadas do cockpit Ekthos:
// MRR, ARR, churches por status, churn rate, ticket médio, crescimento.
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
  if (req.method !== 'GET')  return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // Auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Consultas em paralelo ──────────────────────────────

  const [
    churchesRes,
    subscriptionsRes,
    plansRes,
    churnRes,
  ] = await Promise.all([
    // Contagem por status
    supabase
      .from('churches')
      .select('status', { count: 'exact', head: false }),

    // Assinaturas ativas com valor
    supabase
      .from('subscriptions')
      .select('plan_slug, status, extra_agents, extra_users, current_period_start, current_period_end')
      .in('status', ['active', 'trialing']),

    // Tabela de planos com preços
    supabase
      .from('plans')
      .select('slug, price_cents'),

    // Assinaturas canceladas nos últimos 30 dias (churn)
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: false })
      .eq('status', 'canceled')
      .gte('updated_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  // Contagem por status de igreja
  const churchesByStatus: Record<string, number> = {}
  for (const row of (churchesRes.data ?? [])) {
    const s = row.status as string
    churchesByStatus[s] = (churchesByStatus[s] ?? 0) + 1
  }

  // MRR
  const priceMap: Record<string, number> = {}
  for (const p of (plansRes.data ?? [])) {
    priceMap[p.slug] = p.price_cents
  }

  let mrrCents = 0
  const activeSubs = subscriptionsRes.data ?? []
  for (const sub of activeSubs) {
    const base = priceMap[sub.plan_slug ?? ''] ?? 0
    // Extra users/agents: R$ 29,90/usuário + R$ 49,90/agente (valores exemplo)
    const extraUsersCents  = (sub.extra_users  ?? 0) * 2990
    const extraAgentsCents = (sub.extra_agents ?? 0) * 4990
    mrrCents += base + extraUsersCents + extraAgentsCents
  }

  const arrCents     = mrrCents * 12
  const ticketMedio  = activeSubs.length > 0 ? Math.round(mrrCents / activeSubs.length) : 0
  const churnCount   = churnRes.count ?? 0
  const totalActive  = activeSubs.length
  const churnRate    = totalActive + churnCount > 0
    ? +((churnCount / (totalActive + churnCount)) * 100).toFixed(1)
    : 0

  return json({
    mrr_cents:         mrrCents,
    arr_cents:         arrCents,
    ticket_medio_cents: ticketMedio,
    active_churches:   totalActive,
    churn_last30d:     churnCount,
    churn_rate:        churnRate,
    churches_by_status: churchesByStatus,
    generated_at:      new Date().toISOString(),
  })
})
