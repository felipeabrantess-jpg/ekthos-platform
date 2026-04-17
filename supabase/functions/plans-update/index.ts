// ============================================================
// Edge Function: plans-update
// POST /plans-update — atualiza um plano do catálogo.
// Se price_cents mudar: cria novo Stripe Price, desativa o antigo.
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
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method Not Allowed' }, 405)

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: {
    slug:              string
    name?:             string
    description?:      string | null
    price_cents?:      number
    included_agents?:  number
    max_users?:        number
    max_agents?:       number | null
    sort_order?:       number
    active?:           boolean
  }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  const { slug, ...fields } = body
  if (!slug) return json({ error: 'slug é obrigatório' }, 400)

  // ── Busca plano atual ─────────────────────────────────────
  const { data: current, error: fetchErr } = await supabase
    .from('plans')
    .select('slug, name, price_cents, active')
    .eq('slug', slug)
    .maybeSingle()

  if (fetchErr || !current) return json({ error: `Plano "${slug}" não encontrado` }, 404)

  // ── Se price_cents mudou: rotaciona Stripe Price ──────────
  let newStripePriceId: string | null = null
  let stripePriceRotated = false

  if (fields.price_cents !== undefined && fields.price_cents !== current.price_cents) {
    try {
      // Busca price ativo atual no stripe_prices
      const { data: oldSp } = await supabase
        .from('stripe_prices')
        .select('id, stripe_price_id, stripe_product_id')
        .eq('plan_slug', slug)
        .eq('nickname', 'plan_base')
        .eq('active', true)
        .maybeSingle()

      // Produto: reusa ou cria
      let productId: string
      if (oldSp?.stripe_product_id) {
        productId = oldSp.stripe_product_id
      } else {
        const product = await stripe.products.create({
          name:     `${fields.name ?? current.name} — Plano Base`,
          metadata: { plan_slug: slug, nickname: 'plan_base', kind: 'plan' },
        })
        productId = product.id
      }

      // Cria novo Stripe Price
      const newPrice = await stripe.prices.create({
        product:     productId,
        unit_amount: fields.price_cents,
        currency:    'brl',
        recurring:   { interval: 'month' },
        metadata:    { plan_slug: slug, nickname: 'plan_base', kind: 'plan' },
      })
      newStripePriceId = newPrice.id

      // Desativa o antigo em stripe_prices
      if (oldSp) {
        await supabase
          .from('stripe_prices')
          .update({ active: false })
          .eq('id', oldSp.id)
      }

      // Insere novo
      await supabase.from('stripe_prices').insert({
        plan_slug:         slug,
        nickname:          'plan_base',
        kind:              'plan',
        stripe_price_id:   newPrice.id,
        stripe_product_id: productId,
        amount_cents:      fields.price_cents,
        currency:          'brl',
        billing_interval:  'month',
        active:            true,
      })

      stripePriceRotated = true
    } catch (stripeErr) {
      console.error('[plans-update] stripe price rotation failed:', (stripeErr as Error).message)
      return json({ error: 'Falha ao criar novo Stripe Price' }, 500)
    }
  }

  // ── Atualiza o plano ──────────────────────────────────────
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.name             !== undefined) updatePayload.name             = fields.name
  if (fields.description      !== undefined) updatePayload.description      = fields.description
  if (fields.price_cents      !== undefined) updatePayload.price_cents      = fields.price_cents
  if (fields.included_agents  !== undefined) updatePayload.included_agents  = fields.included_agents
  if (fields.max_users        !== undefined) updatePayload.max_users        = fields.max_users
  if (fields.max_agents       !== undefined) updatePayload.max_agents       = fields.max_agents
  if (fields.sort_order       !== undefined) updatePayload.sort_order       = fields.sort_order
  if (fields.active           !== undefined) updatePayload.active           = fields.active

  const { data: updated, error: updateErr } = await supabase
    .from('plans')
    .update(updatePayload)
    .eq('slug', slug)
    .select()
    .single()

  if (updateErr) {
    console.error('[plans-update] update error:', updateErr)
    return json({ error: 'Erro ao atualizar plano' }, 500)
  }

  // ── Registra evento admin ─────────────────────────────────
  await supabase.from('admin_events').insert({
    admin_user_id: user.id,
    action:        'plan_updated',
    after: {
      slug,
      ...updatePayload,
      stripe_price_rotated: stripePriceRotated,
      new_stripe_price_id:  newStripePriceId,
    },
    reason: 'Edição manual via cockpit admin — pricing',
  })

  return json({
    plan:                 updated,
    stripe_price_rotated: stripePriceRotated,
    new_stripe_price_id:  newStripePriceId,
  })
})
