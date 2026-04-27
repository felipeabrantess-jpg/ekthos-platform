// ============================================================
// Edge Function: stripe-webhook v10 — F6 atomic via RPC (27/04/2026)
//
// MUDANÇAS v7 → v10:
//   - handleLandingPageCheckout: substituído por RPC atômica
//     process_stripe_checkout_completed() — garante atomicidade
//     Postgres para church + subscription + profiles + user_roles +
//     access_grant + coupon_redemption.
//   - handleSubscriptionUpdated → process_subscription_updated RPC
//   - handleSubscriptionDeleted → process_subscription_deleted RPC
//     (revoga access_grants + suspende church atomicamente)
//   - handleInvoicePaymentFailed → process_invoice_payment_failed RPC
//   - inviteUserByEmail: chamado ANTES do RPC (obtém user_id para
//     profiles/user_roles). Tratado como não-fatal.
//   - Busca cupons em public.coupons (novo schema F3) com fallback
//     para affiliate_coupons (legacy, compatibilidade retroativa).
//
// INALTERADO v7 → v10:
//   - handleInvoicePaid (updates idempotentes, baixo risco)
//   - handleChargeRefunded + markConversionsRefunded (legacy, TODO F7)
//   - recordAffiliateCommission (legacy, TODO F7)
//   - Verificação de assinatura Stripe
//   - resolveChurchId helper
//
// verify_jwt: false — endpoint público, seguro por assinatura Stripe
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY       = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET   = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN          = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://ekthos-platform.vercel.app'

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
    .replace(/[\u0300-\u036f]/g, '')
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

async function updateSubscription(
  churchId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('subscriptions').update(patch).eq('church_id', churchId)
  if (error) throw new Error(`DB update failed for church ${churchId}: ${error.message}`)
}

// ── Coupon lookup (novo schema F3 com fallback legacy) ───────

interface CouponInfo {
  couponId:        string
  redemptionId:    string | null
  billingOrigin:   'affiliate_coupon' | 'promo_coupon'
  discountCents:   number
  originalCents:   number
}

async function resolveCouponFromSession(
  session: Stripe.Checkout.Session,
  email:   string,
  planSlug: string,
): Promise<CouponInfo | null> {
  if (!session.discounts?.length) return null

  for (const discount of session.discounts) {
    const promoCodeId = typeof discount.promotion_code === 'string'
      ? discount.promotion_code
      : (discount.promotion_code as Stripe.PromotionCode | null)?.id ?? null

    if (!promoCodeId) continue

    // Busca primeiro em public.coupons (novo sistema F3)
    const { data: coupon } = await supabase
      .from('coupons')
      .select('id, coupon_type, discount_type, discount_value')
      .eq('stripe_promotion_code_id', promoCodeId)
      .eq('active', true)
      .maybeSingle()

    if (!coupon) continue

    const billingOrigin: 'affiliate_coupon' | 'promo_coupon' =
      coupon.coupon_type === 'affiliate' ? 'affiliate_coupon' : 'promo_coupon'

    // Busca redemption em 'attempted' criada pelo coupon-validate
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

    // Redemption não encontrada (checkout sem passar por coupon-validate)
    // Calcula desconto a partir do amount_total do Stripe
    const { data: plan } = await supabase
      .from('plans')
      .select('price_cents')
      .eq('slug', planSlug)
      .single()
    const originalCents = plan?.price_cents ?? 0
    const discountCents = Math.max(0, originalCents - (session.amount_total ?? originalCents))

    return {
      couponId:      coupon.id,
      redemptionId:  null,
      billingOrigin,
      discountCents,
      originalCents,
    }
  }

  return null
}

// ── Affiliate helpers (legacy, TODO F7: migrar para public.coupons) ─

async function recordAffiliateConversion(
  session: Stripe.Checkout.Session,
  churchId: string,
): Promise<void> {
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

      const { data: existingConversion } = await supabase
        .from('affiliate_conversions')
        .select('id')
        .eq('church_id', churchId)
        .eq('coupon_id', coupon.id)
        .maybeSingle()

      if (existingConversion?.id) {
        console.log(`[stripe-webhook] affiliate_conversion já existe (idempotente): church=${churchId}`)
        continue
      }

      await supabase.from('affiliate_conversions').insert({
        affiliate_id: coupon.affiliate_id,
        coupon_id:    coupon.id,
        church_id:    churchId,
        status:       'active',
        converted_at: new Date().toISOString(),
      })

      await supabase.rpc('increment_coupon_redemptions', { coupon_id: coupon.id })
        .then(({ error }) => {
          if (error) console.warn('[stripe-webhook] increment_coupon_redemptions:', error.message)
        })
    }
  } catch (e) {
    console.warn('[stripe-webhook] recordAffiliateConversion (legacy, non-fatal):', (e as Error).message)
  }
}

async function recordAffiliateCommission(
  invoice: Stripe.Invoice,
  churchId: string,
): Promise<void> {
  try {
    const { data: conversion } = await supabase
      .from('affiliate_conversions')
      .select(`
        id, affiliate_id, coupon_id, converted_at, status,
        affiliate_coupons (
          commission_kind, commission_value, commission_duration_months
        )
      `)
      .eq('church_id', churchId)
      .eq('status', 'active')
      .maybeSingle()

    if (!conversion) return

    const coupon = conversion.affiliate_coupons as {
      commission_kind: string
      commission_value: number
      commission_duration_months: number | null
    } | null
    if (!coupon) return

    const { commission_kind, commission_value, commission_duration_months } = coupon

    if (commission_duration_months && commission_duration_months > 0) {
      const convertedAt    = new Date(conversion.converted_at)
      const monthsElapsed  = (Date.now() - convertedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsElapsed >= commission_duration_months) {
        await supabase.from('affiliate_conversions').update({ status: 'matured' }).eq('id', conversion.id)
        return
      }
    }

    if (commission_kind === 'percent_first' || commission_kind === 'fixed_per_sale') {
      const { count } = await supabase
        .from('affiliate_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('conversion_id', conversion.id)
        .not('status', 'eq', 'cancelled')
      if ((count ?? 0) > 0) return
    }

    let amountCents = 0
    const invoiceAmountCents = invoice.amount_paid ?? 0

    if (commission_kind === 'percent_first' || commission_kind === 'percent_recurring') {
      amountCents = Math.round((invoiceAmountCents * commission_value) / 100)
    } else {
      amountCents = commission_value
    }

    if (amountCents <= 0) return

    const now            = new Date()
    const referenceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const approvesAt     = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('affiliate_commissions').insert({
      affiliate_id:      conversion.affiliate_id,
      conversion_id:     conversion.id,
      coupon_id:         conversion.coupon_id,
      church_id:         churchId,
      stripe_invoice_id: invoice.id,
      amount_cents:      amountCents,
      commission_kind,
      reference_month:   referenceMonth,
      status:            'pending',
      approves_at:       approvesAt,
    })
  } catch (e) {
    console.warn('[stripe-webhook] recordAffiliateCommission (legacy, non-fatal):', (e as Error).message)
  }
}

async function markConversionsChurned(churchId: string): Promise<void> {
  try {
    await supabase
      .from('affiliate_conversions')
      .update({ status: 'churned' })
      .eq('church_id', churchId)
      .eq('status', 'active')

    await supabase
      .from('affiliate_commissions')
      .update({ status: 'cancelled' })
      .eq('church_id', churchId)
      .in('status', ['pending', 'approved'])
  } catch (e) {
    console.warn('[stripe-webhook] markConversionsChurned (non-fatal):', (e as Error).message)
  }
}

async function markConversionsRefunded(churchId: string, invoiceId: string): Promise<void> {
  try {
    await supabase
      .from('affiliate_commissions')
      .update({ status: 'cancelled' })
      .eq('church_id', churchId)
      .eq('stripe_invoice_id', invoiceId)
      .eq('status', 'pending')
  } catch (e) {
    console.warn('[stripe-webhook] markConversionsRefunded (non-fatal):', (e as Error).message)
  }
}

// ── Handlers ────────────────────────────────────────────────

// ── Landing page: checkout completo do zero ──────────────────
// v10: usa RPC atômica process_stripe_checkout_completed()
// Atomicidade Postgres garante que ou TUDO cria ou NADA cria.
// inviteUserByEmail chamado ANTES da RPC para obter user_id.
// Auth + Stripe API (não-transacionais) tratados como não-fatais.

async function handleLandingPageCheckout(
  session:  Stripe.Checkout.Session,
  eventId:  string,
): Promise<void> {
  // Quick idempotency: antes de chamar Auth API cara
  const { data: existingCheck } = await supabase
    .from('subscriptions')
    .select('id, church_id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  if (existingCheck?.id) {
    console.log(`[F6] landing checkout já processado (idempotente): session=${session.id}`)
    return
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer : session.customer?.id ?? null
  const subId = typeof session.subscription === 'string'
    ? session.subscription : session.subscription?.id ?? null

  const email = session.customer_email
    ?? session.customer_details?.email
    ?? session.metadata?.email
    ?? null

  if (!email) {
    console.error('[F6] landing checkout sem email:', session.id)
    return
  }

  const planSlug   = session.metadata?.plan_slug ?? 'chamado'
  const pastorName = (session.metadata?.name ?? session.customer_details?.name ?? '').trim()

  type CustomTextField = { key: string; text?: { value?: string | null } }
  const churchNameField = ((session.custom_fields ?? []) as CustomTextField[])
    .find(f => f.key === 'church_name')
  const churchName = churchNameField?.text?.value?.trim()
    || (pastorName ? `Igreja de ${pastorName}` : `Igreja ${email.split('@')[0]}`)

  const churchSlug = `${slugify(churchName)}-${Date.now().toString(36)}`

  // Buscar preço original do plano
  const { data: planData } = await supabase
    .from('plans')
    .select('price_cents')
    .eq('slug', planSlug)
    .single()
  const originalPriceCents = planData?.price_cents ?? 0

  // Identificar cupom (se houver)
  const couponInfo = await resolveCouponFromSession(session, email, planSlug)
  const billingOrigin    = couponInfo?.billingOrigin  ?? 'stripe'
  const discountCents    = couponInfo?.discountCents  ?? 0
  const couponId         = couponInfo?.couponId       ?? null
  const redemptionId     = couponInfo?.redemptionId   ?? null
  const finalOriginal    = couponInfo?.originalCents  ?? originalPriceCents

  // ── inviteUserByEmail ANTES da RPC (para ter user_id) ──────
  // Não-fatal: se falhar, RPC continua sem user_id (admin corrige
  // via Cockpit — church e acesso ainda são criados).
  let userId: string | null = null
  try {
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
        data: { full_name: pastorName },
      },
    )
    if (inviteErr) {
      console.warn('[F6] inviteUserByEmail (non-fatal):', inviteErr.message)
    } else {
      userId = invited?.user?.id ?? null
    }
  } catch (e) {
    console.warn('[F6] invite failed (non-fatal):', (e as Error).message)
  }

  // ── RPC atômica: tudo ou nada ───────────────────────────────
  const rpcPayload = {
    session_id:             session.id,
    stripe_event_id:        eventId,
    stripe_subscription_id: subId,
    stripe_customer_id:     customerId,
    church_name:            churchName,
    church_slug:            churchSlug,
    plan_slug:              planSlug,
    user_id:                userId,
    billing_origin:         billingOrigin,
    original_price_cents:   finalOriginal,
    discount_cents:         discountCents,
    coupon_id:              couponId,
    redemption_id:          redemptionId,
  }

  const { data: rpcResult, error: rpcErr } = await supabase
    .rpc('process_stripe_checkout_completed', { p_payload: rpcPayload })

  if (rpcErr || !rpcResult?.success) {
    const errMsg = rpcErr?.message ?? rpcResult?.error ?? 'RPC returned failure'
    console.error('[F6] process_stripe_checkout_completed FAILED:', errMsg)
    // Throw para que o handler principal retorne 500 → Stripe retentar
    throw new Error(`[F6] checkout RPC failed: ${errMsg}`)
  }

  if (rpcResult.already_processed) {
    console.log(`[F6] landing checkout já processado (idempotente via RPC): church=${rpcResult.church_id}`)
    return
  }

  const churchId = rpcResult.church_id as string
  console.log(`[F6] church criada atomicamente: ${churchId} plan=${planSlug} billing=${billingOrigin}`)

  // ── Post-RPC: atualizar app_metadata (não-fatal) ────────────
  // updateUserById requer church_id que só existe após a RPC.
  if (userId && churchId) {
    try {
      const { error: metaErr } = await supabase.auth.admin.updateUserById(
        userId,
        { app_metadata: { church_id: churchId, role: 'admin' } },
      )
      if (metaErr) console.warn('[F6] updateUserById (non-fatal):', metaErr.message)
      else console.log(`[F6] pastor ${email} convidado → church ${churchId}`)
    } catch (e) {
      console.warn('[F6] updateUserById failed (non-fatal):', (e as Error).message)
    }
  }

  // ── Post-RPC: salvar church_id no customer Stripe (não-fatal) ─
  if (customerId && churchId) {
    try {
      await stripe.customers.update(customerId, { metadata: { church_id: churchId } })
    } catch (e) {
      console.warn('[F6] stripe customer update (non-fatal):', (e as Error).message)
    }
  }

  // ── Affiliate legacy (TODO F7: migrar para public.coupons) ──
  await recordAffiliateConversion(session, churchId)
}

// ── Checkout via Cockpit (church já existe) ──────────────────
// Cockpit cria church + subscription antes do pagamento.
// Webhook apenas confirma pagamento e cria access_grant.
// TODO F6.1: refatorar em RPC dedicada para cockpit checkout.

async function handleCockpitCheckout(
  session: Stripe.Checkout.Session,
  churchId: string,
): Promise<void> {
  const customerId = typeof session.customer === 'string'
    ? session.customer : session.customer?.id ?? null
  const subId = typeof session.subscription === 'string'
    ? session.subscription : session.subscription?.id ?? null
  const planSlug = session.metadata?.plan_slug ?? null

  // Atualiza subscription com stripe IDs + campos F2
  const { data: plan } = planSlug
    ? await supabase.from('plans').select('price_cents').eq('slug', planSlug).single()
    : { data: null }
  const originalCents = plan?.price_cents ?? 0
  const discountCents = Math.max(0, originalCents - (session.amount_total ?? originalCents))

  await updateSubscription(churchId, {
    stripe_subscription_id:     subId ?? undefined,
    stripe_customer_id:         customerId ?? undefined,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    billing_origin:             'stripe',
    effective_price_cents:      originalCents - discountCents,
    discount_cents:             discountCents,
    ...(planSlug ? { plan_slug: planSlug } : {}),
    updated_at:                 new Date().toISOString(),
  })

  // Transiciona church: pending_payment → onboarding
  await supabase
    .from('churches')
    .update({ status: 'onboarding' })
    .eq('id', churchId)
    .eq('status', 'pending_payment')

  // Criar access_grant se ainda não existe para esta subscription
  const subRecord = await supabase
    .from('subscriptions')
    .select('id')
    .eq('church_id', churchId)
    .eq('status', 'active')
    .maybeSingle()

  if (subRecord.data?.id) {
    const existingGrant = await supabase
      .from('access_grants')
      .select('id')
      .eq('church_id', churchId)
      .eq('grant_type', 'paid')
      .eq('active', true)
      .maybeSingle()

    if (!existingGrant.data?.id) {
      await supabase.rpc('grant_access', {
        p_church_id:      churchId,
        p_plan_slug:      planSlug ?? 'chamado',
        p_grant_type:     'paid',
        p_source:         'stripe',
        p_subscription_id: subRecord.data.id,
        p_granted_reason: 'cockpit_stripe_checkout_completed',
      })
    }
  }

  // Invita pastor (non-fatal)
  const pastorEmail = session.metadata?.pastor_email
    ?? session.customer_email
    ?? session.customer_details?.email
    ?? null

  if (pastorEmail) {
    try {
      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
        pastorEmail,
        {
          redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
          data: { full_name: session.metadata?.pastor_name ?? '' },
        },
      )
      if (inviteErr) {
        console.warn('[stripe-webhook] inviteUserByEmail (cockpit):', inviteErr.message)
      } else if (invited?.user) {
        await supabase.auth.admin.updateUserById(
          invited.user.id,
          { app_metadata: { church_id: churchId, role: 'admin' } },
        )
        console.log(`[stripe-webhook] pastor ${pastorEmail} convidado → church ${churchId}`)
      }
    } catch (e) {
      console.warn('[stripe-webhook] invite failed (cockpit, non-fatal):', (e as Error).message)
    }
  }

  await recordAffiliateConversion(session, churchId)
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  if (session.metadata?.source === 'landing_page') {
    await handleLandingPageCheckout(session, eventId)
    return
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer : session.customer?.id ?? null

  const churchId = await resolveChurchId(
    session.metadata as Record<string, string> | null,
    customerId,
    session.id,
  )

  if (!churchId) {
    console.error('[stripe-webhook] checkout.session.completed: church_id não encontrado', session.id)
    return
  }

  console.log(`[stripe-webhook] checkout.session.completed (cockpit) church=${churchId}`)
  await handleCockpitCheckout(session, churchId)
}

// ── invoice.paid: atualiza período + grava invoice ──────────
// Mantido de v7. Operações idempotentes (UPDATE puro + INSERT com stripe_invoice_id único).

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
  const subId      = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null

  const churchId = await resolveChurchId(invoice.metadata as Record<string, string> | null, customerId)
  if (!churchId) {
    console.error('[stripe-webhook] invoice.paid: church_id não encontrado', invoice.id)
    return
  }

  let periodStart: string | null = null
  let periodEnd:   string | null = null
  const subLine = invoice.lines?.data?.find(l => l.type === 'subscription')
  if (subLine?.period) {
    periodStart = unixToIso(subLine.period.start)
    periodEnd   = unixToIso(subLine.period.end)
  }

  await updateSubscription(churchId, {
    status: 'active', current_period_start: periodStart, current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  })

  await supabase.from('invoices').insert({
    church_id: churchId, stripe_invoice_id: invoice.id,
    stripe_subscription_id: subId, stripe_customer_id: customerId,
    amount_paid: invoice.amount_paid, currency: invoice.currency,
    period_start: periodStart, period_end: periodEnd,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    status: invoice.status ?? 'paid', created_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[stripe-webhook] invoice insert:', error.message) })

  await recordAffiliateCommission(invoice, churchId)
}

// ── invoice.payment_failed → RPC atômica (decisão A4) ──────
// RPC apenas atualiza status=past_due. access_grants intocados.

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
  const subId      = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null

  if (!subId) {
    console.warn('[stripe-webhook] invoice.payment_failed: sem stripe_subscription_id', invoice.id)
    return
  }

  const { data: result, error } = await supabase.rpc('process_invoice_payment_failed', {
    p_payload: {
      stripe_subscription_id: subId,
      stripe_event_id:        invoice.id,
    },
  })

  if (error) {
    console.error('[stripe-webhook] process_invoice_payment_failed RPC error:', error.message)
    return
  }

  if (!result?.success) {
    console.warn('[stripe-webhook] invoice.payment_failed: subscription not found', subId)
    return
  }

  console.log(`[stripe-webhook] invoice.payment_failed → past_due: church=${result.church_id}`)
}

// ── customer.subscription.updated → RPC atômica (decisão A3) ─
// NÃO toca em access_grants quando cancel_at_period_end=true.

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const { data: result, error } = await supabase.rpc('process_subscription_updated', {
    p_payload: {
      stripe_subscription_id: sub.id,
      stripe_event_id:        sub.id, // evento não tem ID separado, usa sub.id
      status:                 mapStripeStatus(sub.status),
      current_period_start:   unixToIso(sub.current_period_start),
      current_period_end:     unixToIso(sub.current_period_end),
      cancel_at_period_end:   sub.cancel_at_period_end,
    },
  })

  if (error) {
    console.error('[stripe-webhook] process_subscription_updated RPC error:', error.message)
    throw new Error(error.message)
  }

  if (!result?.success) {
    console.warn('[stripe-webhook] subscription.updated: não encontrada', sub.id)
    return
  }

  console.log(`[stripe-webhook] subscription.updated → church=${result.church_id} status=${mapStripeStatus(sub.status)}`)
}

// ── customer.subscription.deleted → RPC atômica ──────────────
// Revoga access_grants + cancela subscription + suspende church.

async function handleSubscriptionDeleted(
  sub:     Stripe.Subscription,
  eventId: string,
): Promise<void> {
  const { data: result, error } = await supabase.rpc('process_subscription_deleted', {
    p_payload: {
      stripe_subscription_id: sub.id,
      stripe_event_id:        eventId,
    },
  })

  if (error) {
    console.error('[stripe-webhook] process_subscription_deleted RPC error:', error.message)
    throw new Error(error.message)
  }

  if (!result?.success) {
    console.warn('[stripe-webhook] subscription.deleted: não encontrada', sub.id)
    return
  }

  if (result.already_processed) {
    console.log(`[stripe-webhook] subscription.deleted já processada (idempotente): church=${result.church_id}`)
    return
  }

  console.log(`[stripe-webhook] subscription.deleted → church=${result.church_id} access_revoked=${result.access_revoked}`)

  // Legacy affiliate handling (non-fatal)
  await markConversionsChurned(result.church_id as string)
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id ?? null
  const churchId = await resolveChurchId(charge.metadata as Record<string, string> | null, customerId)
  if (!churchId) return

  const invoiceId = typeof charge.invoice === 'string'
    ? charge.invoice
    : (charge.invoice as Stripe.Invoice | null)?.id ?? null
  if (!invoiceId) return

  await markConversionsRefunded(churchId, invoiceId)
}

// ── Main ────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const body      = await req.arrayBuffer()
  const rawBody   = new Uint8Array(body)
  const signature = req.headers.get('stripe-signature')
  if (!signature) return errorResponse('Missing stripe-signature', 400)

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    return errorResponse('Signature verification failed', 400, (e as Error).message)
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
