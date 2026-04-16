// ============================================================
// Edge Function: admin-church-create
// Cria uma nova igreja. Status inicial: 'pending_payment'.
// Aceita custom_*_price_cents para preços negociados.
// Gera Stripe Checkout URL e retorna ao cockpit.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method Not Allowed' }, 405)

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: {
    name?: string
    admin_email?: string
    city?: string
    state?: string
    timezone?: string
    plan_slug?: string
    custom_plan_price_cents?:  number | null
    custom_user_price_cents?:  number | null
    custom_agent_price_cents?: number | null
    price_notes?:              string | null
  }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  const {
    name, admin_email, city, state, timezone,
    plan_slug,
    custom_plan_price_cents  = null,
    custom_user_price_cents  = null,
    custom_agent_price_cents = null,
    price_notes              = null,
  } = body

  if (!name?.trim())        return json({ error: 'name é obrigatório' }, 400)
  if (!admin_email?.trim()) return json({ error: 'admin_email é obrigatório' }, 400)

  const tz       = timezone ?? 'America/Sao_Paulo'
  const planSlug = plan_slug ?? 'chamado'

  // ── 1. Busca o plano (colunas reais: slug, name — sem id) ─
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('slug, name')
    .eq('slug', planSlug)
    .maybeSingle()

  if (planErr || !plan) return json({ error: `Plano "${planSlug}" não encontrado` }, 400)

  // ── 2. Cria a church com status pending_payment ───────────
  const { data: church, error: churchErr } = await supabase
    .from('churches')
    .insert({
      name:     name.trim(),
      city:     city?.trim()  ?? null,
      state:    state?.trim() ?? null,
      timezone: tz,
      status:   'pending_payment',
    })
    .select('id, name, status, created_at')
    .single()

  if (churchErr || !church) {
    console.error('[admin-church-create] church insert:', churchErr)
    return json({ error: 'Erro ao criar igreja' }, 500)
  }

  // ── 3. Cria subscription (stripe NULL por ora) ────────────
  const { error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      church_id:               church.id,
      plan_slug:               plan.slug,
      status:                  'incomplete',
      stripe_subscription_id:  null,
      stripe_customer_id:      null,
      cancel_at_period_end:    false,
      custom_plan_price_cents,
      custom_user_price_cents,
      custom_agent_price_cents,
      price_notes,
    })

  if (subErr) {
    console.error('[admin-church-create] subscription insert:', subErr)
    await supabase.from('churches').delete().eq('id', church.id)
    return json({ error: 'Erro ao criar assinatura' }, 500)
  }

  // ── 4. Stripe customer + Checkout URL ─────────────────────
  let stripeCheckoutUrl: string | null = null
  try {
    const customer = await stripe.customers.create({
      name:     church.name,
      metadata: { church_id: church.id },
    })

    await supabase
      .from('subscriptions')
      .update({ stripe_customer_id: customer.id })
      .eq('church_id', church.id)

    // Resolve price: custom ad-hoc ou catálogo stripe_prices
    let lineItem: Stripe.Checkout.SessionCreateParams.LineItem

    if (custom_plan_price_cents !== null && custom_plan_price_cents > 0) {
      lineItem = {
        quantity: 1,
        price_data: {
          currency:    'brl',
          unit_amount: custom_plan_price_cents,
          recurring:   { interval: 'month' },
          product_data: {
            name:     `${plan.name} (preço negociado)`,
            metadata: { plan_slug: planSlug, custom: 'true' },
          },
        },
      }
    } else {
      const { data: sp } = await supabase
        .from('stripe_prices')
        .select('stripe_price_id')
        .eq('plan_slug', planSlug)
        .eq('nickname', 'plan_base')
        .eq('active', true)
        .maybeSingle()

      lineItem = sp?.stripe_price_id
        ? { quantity: 1, price: sp.stripe_price_id }
        : null as unknown as Stripe.Checkout.SessionCreateParams.LineItem
    }

    if (lineItem) {
      const session = await stripe.checkout.sessions.create({
        mode:       'subscription',
        customer:   customer.id,
        line_items: [lineItem],
        success_url: `${ALLOWED_ORIGIN}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${ALLOWED_ORIGIN}/payment-pending`,
        metadata: {
          church_id:    church.id,
          plan_slug:    planSlug,
          initiated_by: user.id,
        },
        allow_promotion_codes:      true,
        billing_address_collection: 'auto',
      })

      await supabase
        .from('subscriptions')
        .update({ stripe_checkout_session_id: session.id })
        .eq('church_id', church.id)

      stripeCheckoutUrl = session.url
    }
  } catch (stripeError) {
    console.warn('[admin-church-create] stripe setup failed:', (stripeError as Error).message)
  }

  // ── 5. Convida o pastor ───────────────────────────────────
  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    admin_email.trim(),
    {
      data: { church_id: church.id, invited_as: 'admin', church_name: church.name },
      redirectTo: `${ALLOWED_ORIGIN}/payment-pending`,
    },
  )
  if (inviteErr) console.warn('[admin-church-create] invite failed:', inviteErr.message)

  // ── 6. Registra evento ────────────────────────────────────
  await supabase.from('admin_events').insert({
    church_id:     church.id,
    admin_user_id: user.id,
    action:        'church_created',
    after: {
      name:                    church.name,
      plan_slug:               planSlug,
      admin_email:             admin_email.trim(),
      invite_sent:             !inviteErr,
      has_checkout_url:        !!stripeCheckoutUrl,
      custom_plan_price_cents,
    },
    reason: 'Criação manual via cockpit admin',
  })

  return json({
    church_id:           church.id,
    name:                church.name,
    status:              church.status,
    created_at:          church.created_at,
    invite_sent:         !inviteErr,
    stripe_checkout_url: stripeCheckoutUrl,
  }, 201)
})
