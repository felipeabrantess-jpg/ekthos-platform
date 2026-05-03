// ============================================================
// Edge Function: stripe-webhook v11 — B1: pending_activation para agentes premium
//
// MUDANÇAS v10 → v11:
//   - handleAgentPurchase: checkout.session.completed com
//     metadata.source='agent_purchase' cria subscription_agents com
//     activation_status='pending_activation' e notifica time Ekthos
//     via internal_notifications.
//   - Valida Customer tem email antes de processar (alerta crítico se não).
//   - tryNotifyPastorWhatsApp: complemento opcional (try/catch, non-fatal).
//   - STRIPE_WEBHOOK_SKIP_SIG: bypass de assinatura para smoke tests internos.
//
// FLUXO AGENTE PREMIUM:
//   checkout.session.completed (metadata.source='agent_purchase')
//     → validateCustomerEmail  (alerta crítico se sem email)
//     → resolveChurchId
//     → buscar subscriptions.id
//     → INSERT subscription_agents { pending_activation, active=false }
//     → INSERT internal_notifications { agent_purchase_pending }
//     → tryNotifyPastorWhatsApp (non-fatal)
//
// INALTERADO v10 → v11:
//   - handleLandingPageCheckout (RPC atômica F6)
//   - handleCockpitCheckout
//   - handleInvoicePaid / handleInvoicePaymentFailed
//   - handleSubscriptionUpdated / handleSubscriptionDeleted
//   - handleChargeRefunded + affiliate helpers
//
// verify_jwt: false — endpoint público, seguro por assinatura Stripe
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET     = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://ekthos-platform.vercel.app'
const SKIP_SIG = Deno.env.get('STRIPE_WEBHOOK_SKIP_SIG') === 'true'

if (!STRIPE_SECRET_KEY)         throw new Error('[stripe-webhook] STRIPE_SECRET_KEY not set')
if (!STRIPE_WEBHOOK_SECRET)     throw new Error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
if (!SUPABASE_URL)              throw new Error('[stripe-webhook] SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY not set')

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'paused'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function errorResponse(message: string, status: number, details?: unknown): Response {
  console.error(`[stripe-webhook] ${status} — ${message}`, details ?? '')
  return jsonResponse({ error: message, details: details ?? null }, status)
}

function unixToIso(ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toISOString()
}

function mapStripeStatus(s: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    canceled: 'canceled', incomplete: 'incomplete',
    incomplete_expired: 'canceled', paused: 'paused', unpaid: 'past_due',
  }
  return map[s] ?? 'incomplete'
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

// ── Helpers ──────────────────────────────────────────────────

async function resolveChurchId(
  eventMetadata: Record<string, string> | null,
  customerId: string | null,
  sessionId?: string | null,
): Promise<string | null> {
  if (eventMetadata?.church_id) return eventMetadata.church_id

  if (sessionId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('church_id')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()
    if (data?.church_id) return data.church_id
  }

  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted && customer.metadata?.church_id) {
        return customer.metadata.church_id
      }
    } catch (e) {
      console.warn('[stripe-webhook] customer retrieve failed:', (e as Error).message)
    }
  }

  return null
}

async function updateSubscription(churchId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('subscriptions').update(patch).eq('church_id', churchId)
  if (error) throw new Error(`DB update failed for church ${churchId}: ${error.message}`)
}

// ── Coupon lookup ─────────────────────────────────────────────

interface CouponInfo {
  couponId:      string
  redemptionId:  string | null
  billingOrigin: 'affiliate_coupon' | 'promo_coupon'
  discountCents: number
  originalCents: number
}

async function resolveCouponFromSession(
  session:  Stripe.Checkout.Session,
  email:    string,
  planSlug: string,
): Promise<CouponInfo | null> {
  if (!session.discounts?.length) return null

  for (const discount of session.discounts) {
    const promoCodeId = typeof discount.promotion_code === 'string'
      ? discount.promotion_code
      : (discount.promotion_code as Stripe.PromotionCode | null)?.id ?? null
    if (!promoCodeId) continue

    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, coupon_type, discount_type, discount_value')
      .eq('stripe_promotion_code_id', promoCodeId)
      .eq('active', true)
      .maybeSingle()
    if (!coupon) continue

    const billingOrigin: 'affiliate_coupon' | 'promo_coupon' =
      coupon.coupon_type === 'affiliate' ? 'affiliate_coupon' : 'promo_coupon'

    const { data: redemption } = await supabase
      .from('coupon_redemptions')
      .select('id, discount_applied_cents, original_price_cents')
      .eq('coupon_id', coupon.id)
      .eq('email', email.toLowerCase())
      .eq('status', 'attempted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (redemption) {
      return {
        couponId:      coupon.id,
        redemptionId:  redemption.id,
        billingOrigin,
        discountCents: redemption.discount_applied_cents,
        originalCents: redemption.original_price_cents,
      }
    }

    const { data: plan } = await supabase.from('plans').select('price_cents').eq('slug', planSlug).single()
    const originalCents  = plan?.price_cents ?? 0
    const discountCents  = Math.max(0, originalCents - (session.amount_total ?? originalCents))
    return { couponId: coupon.id, redemptionId: null, billingOrigin, discountCents, originalCents }
  }

  return null
}

// ── Affiliate helpers (legacy) ────────────────────────────────

async function recordAffiliateConversion(session: Stripe.Checkout.Session, churchId: string): Promise<void> {
  try {
    if (!session.discounts?.length) return
    for (const discount of session.discounts) {
      const promoCodeId = typeof discount.promotion_code === 'string'
        ? discount.promotion_code
        : (discount.promotion_code as Stripe.PromotionCode | null)?.id ?? null
      if (!promoCodeId) continue
      const { data: coupon } = await supabase
        .from('affiliate_coupons')
        .select('id, affiliate_id, discount_kind, discount_value')
        .eq('stripe_promotion_code_id', promoCodeId)
        .eq('active', true)
        .maybeSingle()
      if (!coupon) continue
      const { data: existing } = await supabase
        .from('affiliate_conversions').select('id')
        .eq('church_id', churchId).eq('coupon_id', coupon.id).maybeSingle()
      if (existing?.id) continue
      await supabase.from('affiliate_conversions').insert({
        affiliate_id: coupon.affiliate_id, coupon_id: coupon.id,
        church_id: churchId, status: 'active', converted_at: new Date().toISOString(),
      })
      await supabase.rpc('increment_coupon_redemptions', { coupon_id: coupon.id })
        .then(({ error }) => { if (error) console.warn('[stripe-webhook] increment_coupon_redemptions:', error.message) })
    }
  } catch (e) { console.warn('[stripe-webhook] recordAffiliateConversion (non-fatal):', (e as Error).message) }
}

async function recordAffiliateCommission(invoice: Stripe.Invoice, churchId: string): Promise<void> {
  try {
    const { data: conversion } = await supabase
      .from('affiliate_conversions')
      .select('id, affiliate_id, coupon_id, converted_at, status, affiliate_coupons(commission_kind,commission_value,commission_duration_months)')
      .eq('church_id', churchId).eq('status', 'active').maybeSingle()
    if (!conversion) return
    const coupon = conversion.affiliate_coupons as { commission_kind: string; commission_value: number; commission_duration_months: number | null } | null
    if (!coupon) return
    const { commission_kind, commission_value, commission_duration_months } = coupon
    if (commission_duration_months && commission_duration_months > 0) {
      const monthsElapsed = (Date.now() - new Date(conversion.converted_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsElapsed >= commission_duration_months) {
        await supabase.from('affiliate_conversions').update({ status: 'matured' }).eq('id', conversion.id)
        return
      }
    }
    if (commission_kind === 'percent_first' || commission_kind === 'fixed_per_sale') {
      const { count } = await supabase.from('affiliate_commissions').select('id', { count: 'exact', head: true })
        .eq('conversion_id', conversion.id).not('status', 'eq', 'cancelled')
      if ((count ?? 0) > 0) return
    }
    let amountCents = 0
    const invoiceAmountCents = invoice.amount_paid ?? 0
    if (commission_kind === 'percent_first' || commission_kind === 'percent_recurring') {
      amountCents = Math.round((invoiceAmountCents * commission_value) / 100)
    } else { amountCents = commission_value }
    if (amountCents <= 0) return
    const now = new Date()
    const referenceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const approvesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('affiliate_commissions').insert({
      affiliate_id: conversion.affiliate_id, conversion_id: conversion.id,
      coupon_id: conversion.coupon_id, church_id: churchId,
      stripe_invoice_id: invoice.id, amount_cents: amountCents,
      commission_kind, reference_month: referenceMonth,
      status: 'pending', approves_at: approvesAt,
    })
  } catch (e) { console.warn('[stripe-webhook] recordAffiliateCommission (non-fatal):', (e as Error).message) }
}

async function markConversionsChurned(churchId: string): Promise<void> {
  try {
    await supabase.from('affiliate_conversions').update({ status: 'churned' }).eq('church_id', churchId).eq('status', 'active')
    await supabase.from('affiliate_commissions').update({ status: 'cancelled' }).eq('church_id', churchId).in('status', ['pending', 'approved'])
  } catch (e) { console.warn('[stripe-webhook] markConversionsChurned (non-fatal):', (e as Error).message) }
}

async function markConversionsRefunded(churchId: string, invoiceId: string): Promise<void> {
  try {
    await supabase.from('affiliate_commissions').update({ status: 'cancelled' })
      .eq('church_id', churchId).eq('stripe_invoice_id', invoiceId).eq('status', 'pending')
  } catch (e) { console.warn('[stripe-webhook] markConversionsRefunded (non-fatal):', (e as Error).message) }
}

// ── B1: Agent Purchase ────────────────────────────────────────

/**
 * Tenta notificar o pastor via WhatsApp.
 * Complemento opcional — falha NÃO bloqueia o fluxo principal.
 * Email Stripe receipt já foi enviado nativamente pelo Stripe.
 */
async function tryNotifyPastorWhatsApp(
  churchId:  string,
  agentName: string,
): Promise<void> {
  try {
    // Canal ativo da igreja
    const { data: channel } = await supabase
      .from('church_whatsapp_channels')
      .select('id')
      .eq('church_id', churchId)
      .eq('active', true)
      .maybeSingle()
    if (!channel) {
      console.log(`[whatsapp-notify] Igreja ${churchId} sem canal ativo. Pulando.`)
      return
    }
    // Admin da igreja
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('church_id', churchId)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    if (!adminRole?.user_id) return

    const { data: authUser } = await supabase.auth.admin.getUserById(adminRole.user_id)
    const adminEmail = authUser?.user?.email ?? null
    if (!adminEmail) return

    const { data: person } = await supabase
      .from('people')
      .select('phone, first_name')
      .eq('church_id', churchId)
      .eq('email', adminEmail)
      .maybeSingle()
    if (!person?.phone) return

    const msg = `Olá, ${person.first_name ?? 'Pastor'}! 🎉\n\nSeu pagamento do *${agentName}* foi confirmado!\n\nNossa equipe entrará em contato em até 1 dia útil para ativar seu agente. Um recibo foi enviado para o seu email. 🙏`

    const { error } = await supabase.functions.invoke('dispatch-message', {
      body: { church_id: churchId, to_phone: person.phone, message: msg },
    })
    if (error) console.warn('[whatsapp-notify] dispatch-message erro:', error.message)
    else console.log(`[whatsapp-notify] Mensagem enviada para ${person.phone}`)
  } catch (err) {
    // Complemento — falha nunca bloqueia o fluxo principal
    console.error('[whatsapp-notify] Falha não-crítica:', (err as Error).message)
  }
}

/**
 * Cria subscription_agents com pending_activation e notifica time Ekthos.
 * Disparado quando checkout.session.completed tem metadata.source='agent_purchase'.
 */
async function handleAgentPurchase(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  const agentSlug = session.metadata?.agent_slug ?? null
  if (!agentSlug) {
    console.error('[stripe-webhook] agent_purchase: metadata.agent_slug ausente, session:', session.id)
    return
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer : (session.customer as Stripe.Customer | null)?.id ?? null

  // CRÍTICO: validar Customer tem email (necessário para Stripe receipt)
  let customerEmail: string | null = null
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted) customerEmail = customer.email ?? null
    } catch (e) {
      console.warn('[stripe-webhook] customer retrieve failed:', (e as Error).message)
    }
  }

  if (!customerEmail) {
    console.error('[CRITICAL] Customer sem email — Stripe receipt pode não ter sido enviado:', customerId)
    await supabase.from('internal_notifications').insert({
      notification_type: 'general',
      title:   'CRÍTICO: Customer sem email — receipt pode não ter sido enviado',
      message: `Customer ${customerId ?? 'desconhecido'} completou pagamento (session ${session.id}) mas não tem email. Verificar urgente.`,
      metadata: { customer_id: customerId, session_id: session.id, event_id: eventId, severity: 'critical' },
    }).then(({ error }) => { if (error) console.error('[stripe-webhook] notif insert:', error.message) })
    // Continua — a venda deve ser registrada mesmo sem email
  }

  // Resolver church_id
  const churchId = await resolveChurchId(
    session.metadata as Record<string, string> | null,
    customerId,
    session.id,
  )
  if (!churchId) {
    console.error('[stripe-webhook] agent_purchase: church_id não encontrado, session:', session.id)
    return
  }

  // Buscar subscription_id (FK obrigatória)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('church_id', churchId)
    .maybeSingle()
  if (!sub?.id) {
    console.error('[stripe-webhook] agent_purchase: subscription não encontrada para church', churchId)
    return
  }

  // Idempotência: já existe para este agente?
  const { data: existing } = await supabase
    .from('subscription_agents')
    .select('id, activation_status')
    .eq('subscription_id', sub.id)
    .eq('agent_slug', agentSlug)
    .maybeSingle()
  if (existing?.id) {
    console.log(`[stripe-webhook] agent_purchase idempotente — já existe id=${existing.id} status=${existing.activation_status}`)
    return
  }

  // Buscar nomes para notificação legível
  const [{ data: church }, { data: agent }] = await Promise.all([
    supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
    supabase.from('agents_catalog').select('name').eq('slug', agentSlug).maybeSingle(),
  ])
  const churchName = church?.name ?? churchId
  const agentName  = agent?.name  ?? agentSlug

  // INSERT subscription_agents: pending_activation, active=false
  const { data: newAgentSub, error: insertErr } = await supabase
    .from('subscription_agents')
    .insert({
      subscription_id:   sub.id,
      agent_slug:        agentSlug,
      activation_status: 'pending_activation',
      active:            false,
    })
    .select()
    .single()

  if (insertErr || !newAgentSub) {
    const msg = insertErr?.message ?? 'unknown error'
    console.error('[stripe-webhook] subscription_agents insert falhou:', msg)
    throw new Error(`subscription_agents insert failed: ${msg}`)
  }

  console.log(`[stripe-webhook] subscription_agents criado: id=${newAgentSub.id} church=${churchId} agent=${agentSlug} status=pending_activation`)

  // INSERT internal_notifications — time Ekthos precisa agir
  const { error: notifErr } = await supabase.from('internal_notifications').insert({
    notification_type: 'agent_purchase_pending',
    church_id:         churchId,
    agent_slug:        agentSlug,
    subscription_id:   newAgentSub.id,
    title:   `Nova compra: ${agentName}`,
    message: `Igreja "${churchName}" comprou ${agentName}. Receipt Stripe enviado para ${customerEmail ?? '(sem email)'}. Aguardando setup assistido.`,
    metadata: {
      agent_name:     agentName,
      customer_email: customerEmail,
      session_id:     session.id,
      event_id:       eventId,
    },
  })
  if (notifErr) {
    console.error('[stripe-webhook] internal_notifications insert falhou:', notifErr.message)
    // Não fatal — subscription_agents já foi criado
  } else {
    console.log(`[stripe-webhook] internal_notifications criada: church=${churchId} agent=${agentSlug}`)
  }

  // WhatsApp opcional — complemento, falha não bloqueia
  await tryNotifyPastorWhatsApp(churchId, agentName)

  console.log(`[stripe-webhook] ✅ agent_purchase pending: church=${churchId} agent=${agentSlug} sub=${newAgentSub.id} email=${customerEmail ?? 'none'}`)
}

// ── Handlers existentes (inalterados de v10) ─────────────────

async function handleLandingPageCheckout(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  const { data: existingCheck } = await supabase.from('subscriptions')
    .select('id, church_id').eq('stripe_checkout_session_id', session.id).maybeSingle()
  if (existingCheck?.id) { console.log(`[F6] já processado: session=${session.id}`); return }

  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id ?? null
  const subId      = typeof session.subscription === 'string' ? session.subscription : (session.subscription as Stripe.Subscription | null)?.id ?? null
  const email      = session.customer_email ?? session.customer_details?.email ?? session.metadata?.email ?? null
  if (!email) { console.error('[F6] sem email:', session.id); return }

  const planSlug   = session.metadata?.plan_slug ?? 'chamado'
  const pastorName = (session.metadata?.name ?? session.customer_details?.name ?? '').trim()

  type CustomTextField = { key: string; text?: { value?: string | null } }
  const churchNameField = ((session.custom_fields ?? []) as CustomTextField[]).find(f => f.key === 'church_name')
  const churchName = churchNameField?.text?.value?.trim() || (pastorName ? `Igreja de ${pastorName}` : `Igreja ${email.split('@')[0]}`)
  const churchSlug = `${slugify(churchName)}-${Date.now().toString(36)}`

  const { data: planData } = await supabase.from('plans').select('price_cents').eq('slug', planSlug).single()
  const originalPriceCents = planData?.price_cents ?? 0

  const couponInfo    = await resolveCouponFromSession(session, email, planSlug)
  const billingOrigin = couponInfo?.billingOrigin ?? 'stripe'
  const discountCents = couponInfo?.discountCents ?? 0
  const couponId      = couponInfo?.couponId      ?? null
  const redemptionId  = couponInfo?.redemptionId  ?? null
  const finalOriginal = couponInfo?.originalCents ?? originalPriceCents

  let userId: string | null = null
  try {
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { full_name: pastorName },
    })
    if (inviteErr) console.warn('[F6] inviteUserByEmail (non-fatal):', inviteErr.message)
    else userId = invited?.user?.id ?? null
  } catch (e) { console.warn('[F6] invite failed (non-fatal):', (e as Error).message) }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_stripe_checkout_completed', {
    p_payload: {
      session_id: session.id, stripe_event_id: eventId, stripe_subscription_id: subId,
      stripe_customer_id: customerId, church_name: churchName, church_slug: churchSlug,
      plan_slug: planSlug, user_id: userId, billing_origin: billingOrigin,
      original_price_cents: finalOriginal, discount_cents: discountCents,
      coupon_id: couponId, redemption_id: redemptionId,
    },
  })

  if (rpcErr || !rpcResult?.success) {
    throw new Error(`[F6] checkout RPC failed: ${rpcErr?.message ?? rpcResult?.error ?? 'RPC failure'}`)
  }
  if (rpcResult.already_processed) { console.log('[F6] idempotente via RPC'); return }

  const churchId = rpcResult.church_id as string
  console.log(`[F6] church criada: ${churchId} plan=${planSlug}`)

  if (userId && churchId) {
    try {
      await supabase.auth.admin.updateUserById(userId, { app_metadata: { church_id: churchId, role: 'admin' } })
    } catch (e) { console.warn('[F6] updateUserById (non-fatal):', (e as Error).message) }
  }
  if (customerId && churchId) {
    try { await stripe.customers.update(customerId, { metadata: { church_id: churchId } }) }
    catch (e) { console.warn('[F6] stripe customer update (non-fatal):', (e as Error).message) }
  }
  await recordAffiliateConversion(session, churchId)
}

async function handleCockpitCheckout(session: Stripe.Checkout.Session, churchId: string): Promise<void> {
  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id ?? null
  const subId      = typeof session.subscription === 'string' ? session.subscription : (session.subscription as Stripe.Subscription | null)?.id ?? null
  const planSlug   = session.metadata?.plan_slug ?? null

  const { data: plan } = planSlug
    ? await supabase.from('plans').select('price_cents').eq('slug', planSlug).single()
    : { data: null }
  const originalCents = plan?.price_cents ?? 0
  const discountCents = Math.max(0, originalCents - (session.amount_total ?? originalCents))

  await updateSubscription(churchId, {
    stripe_subscription_id: subId ?? undefined, stripe_customer_id: customerId ?? undefined,
    stripe_checkout_session_id: session.id, status: 'active', billing_origin: 'stripe',
    effective_price_cents: originalCents - discountCents, discount_cents: discountCents,
    ...(planSlug ? { plan_slug: planSlug } : {}), updated_at: new Date().toISOString(),
  })

  await supabase.from('churches').update({ status: 'onboarding' }).eq('id', churchId).eq('status', 'pending_payment')

  const subRecord = await supabase.from('subscriptions').select('id').eq('church_id', churchId).eq('status', 'active').maybeSingle()
  if (subRecord.data?.id) {
    const existingGrant = await supabase.from('access_grants').select('id').eq('church_id', churchId).eq('grant_type', 'paid').eq('active', true).maybeSingle()
    if (!existingGrant.data?.id) {
      await supabase.rpc('grant_access', {
        p_church_id: churchId, p_plan_slug: planSlug ?? 'chamado', p_grant_type: 'paid',
        p_source: 'stripe', p_subscription_id: subRecord.data.id, p_granted_reason: 'cockpit_stripe_checkout_completed',
      })
    }
  }

  const pastorEmail = session.metadata?.pastor_email ?? session.customer_email ?? session.customer_details?.email ?? null
  if (pastorEmail) {
    try {
      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(pastorEmail, {
        redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { full_name: session.metadata?.pastor_name ?? '' },
      })
      if (inviteErr) console.warn('[stripe-webhook] inviteUserByEmail (cockpit):', inviteErr.message)
      else if (invited?.user) {
        await supabase.auth.admin.updateUserById(invited.user.id, { app_metadata: { church_id: churchId, role: 'admin' } })
        console.log(`[stripe-webhook] pastor ${pastorEmail} convidado → church ${churchId}`)
      }
    } catch (e) { console.warn('[stripe-webhook] invite failed (cockpit, non-fatal):', (e as Error).message) }
  }
  await recordAffiliateConversion(session, churchId)
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  // B1: Compra de agente premium — pending_activation
  if (session.metadata?.source === 'agent_purchase') {
    console.log(`[stripe-webhook] agent_purchase: session=${session.id} agent=${session.metadata.agent_slug ?? 'n/a'}`)
    await handleAgentPurchase(session, eventId)
    return
  }
  // F6: Landing page cria church do zero
  if (session.metadata?.source === 'landing_page') {
    await handleLandingPageCheckout(session, eventId)
    return
  }
  // Cockpit: church já existe
  const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id ?? null
  const churchId = await resolveChurchId(session.metadata as Record<string, string> | null, customerId, session.id)
  if (!churchId) { console.error('[stripe-webhook] checkout: church_id não encontrado', session.id); return }
  console.log(`[stripe-webhook] checkout (cockpit) church=${churchId}`)
  await handleCockpitCheckout(session, churchId)
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as Stripe.Customer | null)?.id ?? null
  const churchId   = await resolveChurchId(invoice.metadata as Record<string, string> | null, customerId)
  if (!churchId) { console.error('[stripe-webhook] invoice.paid: church não encontrada', invoice.id); return }
  const subLine = invoice.lines?.data?.find(l => l.type === 'subscription')
  await updateSubscription(churchId, {
    status: 'active',
    current_period_start: subLine?.period ? unixToIso(subLine.period.start) : null,
    current_period_end:   subLine?.period ? unixToIso(subLine.period.end)   : null,
    updated_at: new Date().toISOString(),
  })
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id ?? null
  await supabase.from('invoices').insert({
    church_id: churchId, stripe_invoice_id: invoice.id, stripe_subscription_id: subId,
    stripe_customer_id: customerId, amount_paid: invoice.amount_paid, currency: invoice.currency,
    period_start: subLine?.period ? unixToIso(subLine.period.start) : null,
    period_end:   subLine?.period ? unixToIso(subLine.period.end)   : null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null, invoice_pdf: invoice.invoice_pdf ?? null,
    status: invoice.status ?? 'paid', created_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[stripe-webhook] invoice insert:', error.message) })
  await recordAffiliateCommission(invoice, churchId)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id ?? null
  if (!subId) { console.warn('[stripe-webhook] invoice.payment_failed: sem sub_id', invoice.id); return }
  const { data: result, error } = await supabase.rpc('process_invoice_payment_failed', {
    p_payload: { stripe_subscription_id: subId, stripe_event_id: invoice.id },
  })
  if (error) { console.error('[stripe-webhook] process_invoice_payment_failed RPC:', error.message); return }
  if (!result?.success) { console.warn('[stripe-webhook] subscription not found', subId); return }
  console.log(`[stripe-webhook] invoice.payment_failed → past_due: church=${result.church_id}`)
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const { data: result, error } = await supabase.rpc('process_subscription_updated', {
    p_payload: {
      stripe_subscription_id: sub.id, stripe_event_id: sub.id,
      status: mapStripeStatus(sub.status),
      current_period_start: unixToIso(sub.current_period_start),
      current_period_end:   unixToIso(sub.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end,
    },
  })
  if (error) { console.error('[stripe-webhook] process_subscription_updated RPC:', error.message); throw new Error(error.message) }
  if (!result?.success) { console.warn('[stripe-webhook] sub.updated: não encontrada', sub.id); return }
  console.log(`[stripe-webhook] sub.updated: church=${result.church_id} status=${mapStripeStatus(sub.status)}`)
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription, eventId: string): Promise<void> {
  const { data: result, error } = await supabase.rpc('process_subscription_deleted', {
    p_payload: { stripe_subscription_id: sub.id, stripe_event_id: eventId },
  })
  if (error) { console.error('[stripe-webhook] process_subscription_deleted RPC:', error.message); throw new Error(error.message) }
  if (!result?.success) { console.warn('[stripe-webhook] sub.deleted: não encontrada', sub.id); return }
  if (result.already_processed) { console.log('[stripe-webhook] sub.deleted idempotente'); return }
  console.log(`[stripe-webhook] sub.deleted: church=${result.church_id} access_revoked=${result.access_revoked}`)
  await markConversionsChurned(result.church_id as string)
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer as Stripe.Customer | null)?.id ?? null
  const churchId   = await resolveChurchId(charge.metadata as Record<string, string> | null, customerId)
  if (!churchId) return
  const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice as Stripe.Invoice | null)?.id ?? null
  if (!invoiceId) return
  await markConversionsRefunded(churchId, invoiceId)
}

// ── Main ────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const body      = await req.arrayBuffer()
  const rawBody   = new Uint8Array(body)
  const signature = req.headers.get('stripe-signature')

  let event: Stripe.Event

  // Bypass de assinatura para smoke tests internos
  // STRIPE_WEBHOOK_SKIP_SIG=true NUNCA deve ser setado em produção
  if (SKIP_SIG && !signature) {
    console.warn('[stripe-webhook] ⚠️ SKIP_SIG ativo — bypass de assinatura (smoke test apenas)')
    try {
      event = JSON.parse(new TextDecoder().decode(rawBody)) as Stripe.Event
    } catch (e) {
      return errorResponse('Body inválido (SKIP_SIG mode)', 400, (e as Error).message)
    }
  } else {
    if (!signature) return errorResponse('Missing stripe-signature', 400)
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)
    } catch (e) {
      return errorResponse('Signature verification failed', 400, (e as Error).message)
    }
  }

  console.log(`[stripe-webhook] ${event.type} id=${event.id}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, event.id)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id)
        break
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break
      default:
        console.log(`[stripe-webhook] evento ignorado: ${event.type}`)
    }
  } catch (e) {
    return errorResponse('Handler error', 500, (e as Error).message)
  }

  return jsonResponse({ received: true, event_id: event.id, event_type: event.type })
})
