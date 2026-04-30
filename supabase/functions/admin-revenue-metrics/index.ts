// ============================================================
// Edge Function: admin-revenue-metrics
// Retorna DRE simplificado, série de MRR (últimos 12 meses),
// breakdown por plano e churn mensal.
//
// GET /admin-revenue-metrics?months=12
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

  // Auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  const monthsParam = parseInt(new URL(req.url).searchParams.get('months') ?? '12')
  const months      = Math.min(24, Math.max(1, monthsParam))

  // Datas de início do período
  const periodStart = new Date()
  periodStart.setMonth(periodStart.getMonth() - months)
  periodStart.setDate(1)
  periodStart.setHours(0, 0, 0, 0)

  const [subsRes, plansRes, cancelledRes] = await Promise.all([
    // Todas as assinaturas criadas no período
    supabase
      .from('subscriptions')
      .select('id, plan_slug, status, extra_users, extra_agents, created_at, updated_at, current_period_start, current_period_end')
      .gte('created_at', periodStart.toISOString()),

    supabase
      .from('plans')
      .select('slug, price_cents, name'),

    // Canceladas no período para série de churn
    supabase
      .from('subscriptions')
      .select('id, updated_at')
      .eq('status', 'canceled')
      .gte('updated_at', periodStart.toISOString()),
  ])

  const plans    = plansRes.data ?? []
  const priceMap: Record<string, number> = {}
  const nameMap:  Record<string, string> = {}
  for (const p of plans) {
    priceMap[p.slug] = p.price_cents
    nameMap[p.slug]  = p.name
  }

  const subs      = subsRes.data ?? []
  const cancelled = cancelledRes.data ?? []

  // ── MRR série por mês ──────────────────────────────────
  // Para cada mês, conta assinaturas ativas (created_at <= fim do mês, status ativo ou cancelada após o fim do mês)
  const series: Array<{ month: string; mrr_cents: number; new_subs: number; churned: number }> = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const monthStart = new Date(d)
    const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    const label      = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    // Assinaturas ativas neste mês
    let mrrCents = 0
    let newCount = 0
    for (const sub of subs) {
      const created = new Date(sub.created_at)
      if (created > monthEnd) continue
      // Aproximação: considera ativa se criada antes do fim do mês
      const base = priceMap[sub.plan_slug ?? ''] ?? 0
      const extras = (sub.extra_users ?? 0) * 5990 + (sub.extra_agents ?? 0) * 4990
      mrrCents += base + extras

      if (created >= monthStart && created <= monthEnd) newCount++
    }

    // Churn neste mês
    const churnedCount = cancelled.filter(c => {
      const d2 = new Date(c.updated_at)
      return d2 >= monthStart && d2 <= monthEnd
    }).length

    series.push({ month: label, mrr_cents: mrrCents, new_subs: newCount, churned: churnedCount })
  }

  // ── MRR atual por plano ────────────────────────────────
  const activeSubs = subs.filter(s => s.status === 'active' || s.status === 'trialing')
  const byPlan: Record<string, { name: string; count: number; mrr_cents: number }> = {}
  for (const sub of activeSubs) {
    const slug = sub.plan_slug ?? 'unknown'
    if (!byPlan[slug]) byPlan[slug] = { name: nameMap[slug] ?? slug, count: 0, mrr_cents: 0 }
    byPlan[slug].count++
    byPlan[slug].mrr_cents += (priceMap[slug] ?? 0) + (sub.extra_users ?? 0) * 5990 + (sub.extra_agents ?? 0) * 4990
  }

  // ── MRR / ARR atuais ──────────────────────────────────
  const currentMrr = series.at(-1)?.mrr_cents ?? 0
  const currentArr = currentMrr * 12

  return json({
    mrr_cents:    currentMrr,
    arr_cents:    currentArr,
    by_plan:      Object.values(byPlan),
    monthly_series: series,
    period_months:  months,
    generated_at: new Date().toISOString(),
  })
})
