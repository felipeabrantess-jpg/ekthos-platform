// ============================================================
// Edge Function: stripe-bootstrap
// Cria produtos e preços no Stripe e popula stripe_prices no DB.
// Idempotente: verifica se price já existe antes de criar.
//
// POST /stripe-bootstrap
// Headers: Authorization: Bearer <ekthos-admin-jwt>
// Body: {} (usa planos do DB)
// Returns: { created: number, skipped: number, prices: [...] }
//
// verify_jwt: false — valida manualmente (admin only)
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface Plan {
  id: string
  slug: string
  name: string
  price_cents: number
  extra_user_price_cents: number
  extra_agent_price_cents: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth — apenas ekthos admins
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
  const isAdmin = user.app_metadata?.is_ekthos_admin === true || user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // Busca todos os planos ativos
  const { data: plans, error: planErr } = await supabase
    .from('plans')
    .select('id, slug, name, price_cents, extra_user_price_cents, extra_agent_price_cents')
    .eq('is_active', true)

  if (planErr || !plans) return json({ error: 'Erro ao buscar planos' }, 500)

  const results: Array<{ plan_slug: string; nickname: string; stripe_price_id: string; action: string }> = []

  for (const plan of plans as Plan[]) {
    // Cada plano gera 3 prices: base, extra_user, extra_agent
    const priceItems = [
      {
        nickname:     'plan_base',
        amount_cents: plan.price_cents,
        label:        `${plan.name} — Plano Base`,
      },
      {
        nickname:     'extra_user',
        amount_cents: plan.extra_user_price_cents ?? 0,
        label:        `${plan.name} — Usuário Extra`,
      },
      {
        nickname:     'extra_agent',
        amount_cents: plan.extra_agent_price_cents ?? 0,
        label:        `${plan.name} — Agente Extra`,
      },
    ]

    for (const item of priceItems) {
      // Verifica se já existe no DB
      const { data: existing } = await supabase
        .from('stripe_prices')
        .select('stripe_price_id')
        .eq('plan_slug', plan.slug)
        .eq('nickname', item.nickname)
        .eq('active', true)
        .maybeSingle()

      if (existing) {
        results.push({ plan_slug: plan.slug, nickname: item.nickname, stripe_price_id: existing.stripe_price_id, action: 'skipped' })
        continue
      }

      // Cria produto no Stripe (idempotency via metadata)
      const product = await stripe.products.create({
        name:     item.label,
        metadata: { plan_slug: plan.slug, nickname: item.nickname },
      })

      // Cria price no Stripe
      const price = await stripe.prices.create({
        product:    product.id,
        unit_amount: item.amount_cents,
        currency:   'brl',
        recurring:  { interval: 'month' },
        metadata:   { plan_slug: plan.slug, nickname: item.nickname },
      })

      // Persiste no DB
      await supabase.from('stripe_prices').insert({
        plan_slug:        plan.slug,
        nickname:         item.nickname,
        stripe_price_id:  price.id,
        stripe_product_id: product.id,
        amount_cents:     item.amount_cents,
        currency:         'brl',
        billing_interval: 'month',
        active:           true,
      })

      results.push({ plan_slug: plan.slug, nickname: item.nickname, stripe_price_id: price.id, action: 'created' })
    }
  }

  const created = results.filter(r => r.action === 'created').length
  const skipped = results.filter(r => r.action === 'skipped').length

  return json({ created, skipped, prices: results })
})
