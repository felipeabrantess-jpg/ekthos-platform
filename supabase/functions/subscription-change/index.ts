/**
 * subscription-change — Edge Function
 *
 * Realiza upgrade/downgrade de plano SEM double billing.
 * Usa stripe.subscriptions.update() com proration_behavior='create_prorations'
 * em vez de criar uma nova Checkout Session.
 *
 * Body esperado:
 *   { plan_slug: 'missao' | 'avivamento' }
 *
 * Pré-requisito: plans.stripe_price_id deve estar preenchido para o plano alvo.
 * Se não estiver, retorna { error: 'stripe_price_id_not_configured', plan_slug }.
 *
 * Registra em admin_events para auditoria.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
})

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!

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

  // ── Auth: validar JWT do pastor ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !user) return json({ error: 'unauthorized' }, 401)

  // ── Obter church_id do app_metadata ────────────────────────────────────
  const churchId: string | undefined = user.app_metadata?.church_id
  if (!churchId) return json({ error: 'church_id_not_found' }, 400)

  // ── Parse body ──────────────────────────────────────────────────────────
  let planSlug: string
  try {
    const body = await req.json() as { plan_slug?: string }
    if (!body.plan_slug) throw new Error('missing plan_slug')
    planSlug = body.plan_slug
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const validPlans = ['chamado', 'missao', 'avivamento']
  if (!validPlans.includes(planSlug)) {
    return json({ error: 'invalid_plan_slug', plan_slug: planSlug }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Buscar subscription atual ────────────────────────────────────────────
  const { data: sub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_slug, stripe_subscription_id, status')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (subError || !sub) {
    return json({ error: 'subscription_not_found' }, 404)
  }

  if (!sub.stripe_subscription_id) {
    return json({ error: 'no_stripe_subscription', message: 'Use stripe-checkout para criar a assinatura' }, 400)
  }

  if (sub.plan_slug === planSlug) {
    return json({ error: 'same_plan', message: 'Já está neste plano' }, 400)
  }

  // ── Buscar stripe_price_id do plano alvo ─────────────────────────────────
  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .select('slug, name, price_cents, stripe_price_id')
    .eq('slug', planSlug)
    .single()

  if (planError || !plan) {
    return json({ error: 'plan_not_found', plan_slug: planSlug }, 404)
  }

  if (!plan.stripe_price_id) {
    // Não bloqueia — apenas informa. Felipe deve preencher via Stripe Dashboard.
    return json({
      error: 'stripe_price_id_not_configured',
      plan_slug: planSlug,
      message: `Preencha plans.stripe_price_id para o plano '${planSlug}' no banco de dados com o Price ID do Stripe antes de usar o upgrade nativo. Por enquanto, use o link de checkout manual.`,
    }, 422)
  }

  // ── Buscar subscription no Stripe ────────────────────────────────────────
  let stripeSubscription: Stripe.Subscription
  try {
    stripeSubscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
  } catch (err) {
    console.error('Stripe retrieve error:', err)
    return json({ error: 'stripe_subscription_not_found', detail: String(err) }, 502)
  }

  if (!stripeSubscription.items?.data?.length) {
    return json({ error: 'stripe_no_items' }, 502)
  }

  const itemId = stripeSubscription.items.data[0].id

  // ── Update Stripe subscription (sem double billing) ──────────────────────
  let updatedSub: Stripe.Subscription
  try {
    updatedSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, price: plan.stripe_price_id }],
      proration_behavior: 'create_prorations',
    })
  } catch (err) {
    console.error('Stripe update error:', err)
    return json({ error: 'stripe_update_failed', detail: String(err) }, 502)
  }

  // ── Atualizar subscriptions no Supabase ──────────────────────────────────
  const { error: updateError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      plan_slug: planSlug,
      status: updatedSub.status,
      current_period_end: new Date((updatedSub.current_period_end as number) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sub.id)

  if (updateError) {
    console.error('Supabase update error:', updateError)
    // Stripe já mudou — registrar mas não reverter (divergência tolerável, webhook vai corrigir)
    console.warn('Stripe updated but Supabase failed to update. Webhook will reconcile.')
  }

  // ── Atualizar plan_slug na tabela churches ────────────────────────────────
  await supabaseAdmin
    .from('churches')
    .update({ plan_slug: planSlug, updated_at: new Date().toISOString() })
    .eq('id', churchId)

  // ── Auditoria em admin_events ─────────────────────────────────────────────
  await supabaseAdmin.from('admin_events').insert({
    action: 'plan_upgrade',
    church_id: churchId,
    admin_user_id: null,
    before: JSON.stringify({ plan_slug: sub.plan_slug, status: sub.status }),
    after: JSON.stringify({ plan_slug: planSlug, status: updatedSub.status }),
    reason: 'subscription-change EF — pastor solicitou upgrade',
  })

  return json({
    ok: true,
    previous_plan: sub.plan_slug,
    new_plan: planSlug,
    stripe_subscription_id: sub.stripe_subscription_id,
    status: updatedSub.status,
  })
})
