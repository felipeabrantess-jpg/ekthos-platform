// ============================================================
// Edge Function: stripe-checkout
// Cria uma Stripe Checkout Session para um plano.
//
// Lógica de preço (por prioridade):
//   1. subscriptions.custom_plan_price_cents NOT NULL → price_data ad-hoc
//   2. stripe_prices.stripe_price_id (catálogo padrão)
//
// POST /stripe-checkout
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { plan_slug: string, success_url: string, cancel_url: string }
// Returns: { url: string }
//
// verify_jwt: false — JWT validado manualmente
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status: number, details?: unknown): Response {
  console.error(`[stripe-checkout] ${status} — ${msg}`, details ?? '')
  return jsonResponse({ error: msg, details: details ?? null }, status)
}

async function validateJwt(authHeader: string | null): Promise<{ userId: string; churchId: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data.user) return null
  const churchId: string | undefined =
    data.user.app_metadata?.church_id ?? data.user.user_metadata?.church_id
  if (!churchId) return null
  return { userId: data.user.id, churchId }
}

// Resolve line_item: preço customizado (ad-hoc) ou catálogo stripe_prices
async function resolvePriceLineItem(
  planSlug: string,
  planName: string,
  customPriceCents: number | null,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  if (customPriceCents !== null && customPriceCents > 0) {
    return {
      quantity: 1,
      price_data: {
        currency:    'brl',
        unit_amount: customPriceCents,
        recurring:   { interval: 'month' },
        product_data: {
          name:     `${planName} (preço negociado)`,
          metadata: { plan_slug: planSlug, custom: 'true' },
        },
      },
    }
  }

  const { data: sp } = await supabase
    .from('stripe_prices')
    .select('stripe_price_id')
    .eq('plan_slug', planSlug)
    .eq('nickname', 'plan_base')
    .eq('active', true)
    .maybeSingle()

  if (!sp?.stripe_price_id) {
    throw new Error(`Nenhum stripe_price para '${planSlug}'. Execute stripe-bootstrap primeiro.`)
  }

  return { quantity: 1, price: sp.stripe_price_id }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST')    return err('Method not allowed', 405)

  const auth = await validateJwt(req.headers.get('Authorization'))
  if (!auth) return err('Unauthorized', 401)
  const { userId, churchId } = auth

  let body: { plan_slug?: string; success_url?: string; cancel_url?: string }
  try { body = await req.json() } catch { return err('Body inválido', 400) }

  const { plan_slug, success_url, cancel_url } = body
  if (!plan_slug)                    return err('plan_slug é obrigatório', 422)
  if (!success_url || !cancel_url)   return err('success_url e cancel_url são obrigatórios', 422)
  try { new URL(success_url); new URL(cancel_url) } catch { return err('URLs inválidas', 422) }

  console.log(`[stripe-checkout] user=${userId} church=${churchId} plan=${plan_slug}`)

  const { data: plan } = await supabase
    .from('plans')
    .select('id, slug, name')
    .eq('slug', plan_slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!plan) return err(`Plano '${plan_slug}' não encontrado ou inativo`, 404)

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, stripe_customer_id, status, custom_plan_price_cents')
    .eq('church_id', churchId)
    .maybeSingle()

  const customPriceCents: number | null = sub?.custom_plan_price_cents ?? null

  // Stripe customer — cria se não existir
  let stripeCustomerId: string
  if (sub?.stripe_customer_id) {
    stripeCustomerId = sub.stripe_customer_id
  } else {
    const { data: church } = await supabase
      .from('churches').select('name').eq('id', churchId).maybeSingle()

    const customer = await stripe.customers.create({
      metadata: { church_id: churchId, created_by_user: userId },
      ...(church?.name ? { name: church.name } : {}),
    })
    stripeCustomerId = customer.id

    await supabase.from('subscriptions').upsert(
      { church_id: churchId, stripe_customer_id: stripeCustomerId, status: sub?.status ?? 'incomplete', updated_at: new Date().toISOString() },
      { onConflict: 'church_id' },
    )
  }

  // Line item
  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem
  try {
    lineItem = await resolvePriceLineItem(plan_slug, plan.name, customPriceCents)
  } catch (e) {
    return err((e as Error).message, 500)
  }

  // Checkout Session
  const sep = success_url.includes('?') ? '&' : '?'
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   stripeCustomerId,
      line_items: [lineItem],
      success_url: `${success_url}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
      metadata: { church_id: churchId, plan_slug, plan_id: plan.id, initiated_by: userId },
      allow_promotion_codes:      true,
      billing_address_collection: 'auto',
    })
  } catch (e) {
    return err('Erro ao criar sessão Stripe', 502, (e as Error).message)
  }

  if (!session.url) return err('Stripe retornou sessão sem URL', 502)

  // Persiste session_id para reconciliação no webhook
  await supabase
    .from('subscriptions')
    .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
    .eq('church_id', churchId)

  console.log(`[stripe-checkout] session=${session.id}`)
  return jsonResponse({ url: session.url })
})
