/**
 * topup-checkout — Edge Function
 *
 * Cria Checkout Session do Stripe para compra de pacote de recarga (topup).
 *
 * Body esperado:
 *   { recharge_slug: 'topup-emergencial' | 'topup-ponte' }
 *
 * Pré-requisito: credit_packages.stripe_price_id deve estar preenchido.
 * Se não estiver, retorna { error: 'stripe_price_id_not_configured' }.
 *
 * Webhook recebe checkout.session.completed com metadata.source='topup_purchase'
 * e credita church_agent_credits via handleRechargePurchase no stripe-webhook.
 *
 * TTL: 90 dias (canon).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
})

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const churchId: string | undefined = user.app_metadata?.church_id
  if (!churchId) return json({ error: 'church_id_not_found' }, 400)

  // ── Parse body ──────────────────────────────────────────────────────────────
  let rechargeSlug: string
  try {
    const body = await req.json() as { recharge_slug?: string }
    if (!body.recharge_slug) throw new Error('missing recharge_slug')
    rechargeSlug = body.recharge_slug
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const validSlugs = ['topup-emergencial', 'topup-ponte']
  if (!validSlugs.includes(rechargeSlug)) {
    return json({ error: 'invalid_recharge_slug', recharge_slug: rechargeSlug }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Buscar pacote de recarga ─────────────────────────────────────────────────
  const { data: pkg, error: pkgErr } = await supabaseAdmin
    .from('credit_packages')
    .select('slug, credits, price_cents, stripe_price_id, ttl_days')
    .eq('slug', rechargeSlug)
    .single()

  if (pkgErr || !pkg) {
    return json({ error: 'package_not_found', recharge_slug: rechargeSlug }, 404)
  }

  if (!pkg.stripe_price_id) {
    return json({
      error: 'stripe_price_id_not_configured',
      recharge_slug: rechargeSlug,
      message: `Crie o produto/preço para '${rechargeSlug}' no Stripe Dashboard e preencha credit_packages.stripe_price_id antes de ativar o fluxo de recarga.`,
    }, 422)
  }

  // ── Guard: pastor já tem 300 créditos de topup? (bloquear se excede) ────────
  // Só aplica se quiser comprar topup-emergencial (100cr) mas já tem 300cr (topup-ponte)
  const { data: creditsRows } = await supabaseAdmin
    .from('church_agent_credits')
    .select('topup_credits, expires_at')
    .eq('church_id', churchId)

  const totalTopup = (creditsRows ?? []).reduce((sum, r) => sum + (r.topup_credits ?? 0), 0)
  if (rechargeSlug === 'topup-emergencial' && totalTopup >= 300) {
    return json({
      error: 'topup_limit_reached',
      message: `Você já tem ${totalTopup} créditos de recarga disponíveis. Aguarde o uso antes de recarregar novamente.`,
    }, 409)
  }

  // ── Buscar customer Stripe da church ─────────────────────────────────────────
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const customerId = sub?.stripe_customer_id ?? undefined

  // ── Buscar email do pastor para pre-fill ─────────────────────────────────────
  const successUrl = `${req.headers.get('origin') ?? 'https://app.ekthosapp.com.br'}/recargas?topup=success`
  const cancelUrl  = `${req.headers.get('origin') ?? 'https://app.ekthosapp.com.br'}/recargas`

  // ── Criar Checkout Session (mode: payment — compra única) ────────────────────
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
      metadata: {
        source:         'topup_purchase',
        church_id:      churchId,
        recharge_slug:  rechargeSlug,
        credits:        String(pkg.credits),
        ttl_days:       String(pkg.ttl_days ?? 90),
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    })
  } catch (err) {
    console.error('Stripe session create error:', err)
    return json({ error: 'stripe_error', detail: String(err) }, 502)
  }

  return json({ url: session.url, session_id: session.id })
})
