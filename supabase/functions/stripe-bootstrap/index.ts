// ============================================================
// Edge Function: stripe-bootstrap
// Cria produtos e preços no Stripe e popula stripe_prices no DB.
// Idempotente: verifica se price já existe antes de criar.
//
// Fontes de dados:
//   plans       → kind='plan',  nickname='plan_base'  (1 price por plano)
//   addon_prices → kind='addon', nickname=slug         (1 price por addon)
//
// POST /stripe-bootstrap
// Headers: Authorization: Bearer <ekthos-admin-jwt>
// Returns: { created, skipped, prices }
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

interface PriceItem {
  planSlug:    string   // plan slug ou addon slug (ex: 'chamado', 'extra_user')
  nickname:    string   // 'plan_base' | 'extra_user' | 'extra_agent'
  kind:        string   // 'plan' | 'addon'
  amountCents: number
  label:       string
}

type ResultEntry = { plan_slug: string; nickname: string; kind: string; stripe_price_id: string; action: string }

async function upsertPrice(item: PriceItem): Promise<ResultEntry> {
  // Verifica se já existe no DB (idempotência)
  const { data: existing } = await supabase
    .from('stripe_prices')
    .select('stripe_price_id')
    .eq('plan_slug', item.planSlug)
    .eq('nickname', item.nickname)
    .eq('active', true)
    .maybeSingle()

  if (existing) {
    return { plan_slug: item.planSlug, nickname: item.nickname, kind: item.kind, stripe_price_id: existing.stripe_price_id, action: 'skipped' }
  }

  // Cria produto no Stripe
  const product = await stripe.products.create({
    name:     item.label,
    metadata: { plan_slug: item.planSlug, nickname: item.nickname, kind: item.kind },
  })

  // Cria price recorrente mensal no Stripe
  const price = await stripe.prices.create({
    product:     product.id,
    unit_amount: item.amountCents,
    currency:    'brl',
    recurring:   { interval: 'month' },
    metadata:    { plan_slug: item.planSlug, nickname: item.nickname, kind: item.kind },
  })

  // Persiste no DB
  await supabase.from('stripe_prices').insert({
    plan_slug:         item.planSlug,
    nickname:          item.nickname,
    kind:              item.kind,
    stripe_price_id:   price.id,
    stripe_product_id: product.id,
    amount_cents:      item.amountCents,
    currency:          'brl',
    billing_interval:  'month',
    active:            true,
  })

  return { plan_slug: item.planSlug, nickname: item.nickname, kind: item.kind, stripe_price_id: price.id, action: 'created' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // Auth — apenas ekthos admins
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Busca planos com colunas reais ────────────────────────
  const { data: plans, error: planErr } = await supabase
    .from('plans')
    .select('slug, name, price_cents')
    .eq('active', true)

  if (planErr) {
    console.error('[stripe-bootstrap] plans query error:', planErr.message)
    return json({ error: `Erro ao buscar planos: ${planErr.message}` }, 500)
  }
  if (!plans || plans.length === 0) {
    return json({ error: 'Nenhum plano ativo encontrado na tabela plans' }, 500)
  }

  // ── Busca addons ──────────────────────────────────────────
  const { data: addons, error: addonErr } = await supabase
    .from('addon_prices')
    .select('slug, name, price_cents')
    .eq('active', true)

  if (addonErr) {
    console.error('[stripe-bootstrap] addon_prices query error:', addonErr.message)
    return json({ error: `Erro ao buscar addons: ${addonErr.message}` }, 500)
  }

  // ── Monta lista de itens a criar ──────────────────────────
  const items: PriceItem[] = []

  for (const plan of (plans as Array<{ slug: string; name: string; price_cents: number }>)) {
    items.push({
      planSlug:    plan.slug,
      nickname:    'plan_base',
      kind:        'plan',
      amountCents: plan.price_cents,
      label:       `${plan.name} — Plano Base`,
    })
  }

  for (const addon of (addons ?? []) as Array<{ slug: string; name: string; price_cents: number }>) {
    items.push({
      planSlug:    addon.slug,   // ex: 'extra_user'
      nickname:    addon.slug,   // mesmo valor
      kind:        'addon',
      amountCents: addon.price_cents,
      label:       addon.name,
    })
  }

  // ── Processa cada item (sequencial para evitar rate limit) ─
  const results: ResultEntry[] = []
  for (const item of items) {
    try {
      const r = await upsertPrice(item)
      results.push(r)
      console.log(`[stripe-bootstrap] ${r.action}: ${r.plan_slug}/${r.nickname}`)
    } catch (e) {
      console.error(`[stripe-bootstrap] failed ${item.planSlug}/${item.nickname}:`, (e as Error).message)
      results.push({ plan_slug: item.planSlug, nickname: item.nickname, kind: item.kind, stripe_price_id: '', action: `error: ${(e as Error).message}` })
    }
  }

  const created = results.filter(r => r.action === 'created').length
  const skipped = results.filter(r => r.action === 'skipped').length
  const errors  = results.filter(r => r.action.startsWith('error')).length

  return json({ created, skipped, errors, prices: results })
})
