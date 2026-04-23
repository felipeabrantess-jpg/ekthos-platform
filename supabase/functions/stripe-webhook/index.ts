// ============================================================
// Edge Function: stripe-webhook  v7
// Processa eventos do Stripe para ciclo de vida da assinatura.
//
// checkout.session.completed → churches.status = 'onboarding'
//                            → recordAffiliateConversion()
// invoice.paid               → subscription active + grava invoice
//                            → recordAffiliateCommission()
// invoice.payment_failed     → subscription past_due
// customer.subscription.*    → sync status/período
// customer.subscription.deleted → markConversionsChurned()
// charge.refunded            → markConversionsRefunded()
//
// verify_jwt: false — endpoint público, seguro por assinatura Stripe
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

if (!STRIPE_SECRET_KEY)     throw new Error('[stripe-webhook] STRIPE_SECRET_KEY not set')
if (!STRIPE_WEBHOOK_SECRET) throw new Error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
if (!SUPABASE_URL)          throw new Error('[stripe-webhook] SUPABASE_URL not set')
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

async function resolveChurchId(
  eventMetadata: Record<string, string> | null,
  customerId: string | null,
  sessionId?: string | null,
): Promise<string | null> {
  if (eventMetadata?.church_id) return eventMetadata.church_id

  // Tenta pelo stripe_checkout_session_id
  if (sessionId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('church_id')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle()
    if (data?.church_id) return data.church_id
  }

  // Fallback: metadata do customer Stripe
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

// ── Affiliate helpers (non-fatal) ────────────────────────────

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

      // SEC-005: Idempotência — evita duplicar conversão se webhook reentrar
      const { data: existingConversion } = await supabase
        .from('affiliate_conversions')
        .select('id')
        .eq('church_id', churchId)
        .eq('coupon_id', coupon.id)
        .maybeSingle()

      if (existingConversion?.id) {
        console.log(`[stripe-webhook] affiliate_conversion já existe (idempotente): church=${churchId} coupon=${coupon.id}`)
        continue
      }

      // Insert conversion
      await supabase.from('affiliate_conversions').insert({
        affiliate_id:   coupon.affiliate_id,
        coupon_id:      coupon.id,
        church_id:      churchId,
        status:         'active',
        converted_at:   new Date().toISOString(),
      })

      // Increment redemption counter
      await supabase.rpc('increment_coupon_redemptions', { coupon_id: coupon.id })
        .then(({ error }) => {
          if (error) console.warn('[stripe-webhook] increment_coupon_redemptions:', error.message)
        })
    }
  } catch (e) {
    console.warn('[stripe-webhook] recordAffiliateConversion failed:', (e as Error).message)
  }
}

async function recordAffiliateCommission(
  invoice: Stripe.Invoice,
  churchId: string,
): Promise<void> {
  try {
    // Find active conversion for this church
    const { data: conversion } = await supabase
      .from('affiliate_conversions')
      .select(`
        id,
        affiliate_id,
        coupon_id,
        converted_at,
        status,
        affiliate_coupons (
          commission_kind,
          commission_value,
          commission_duration_months
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

    // Check if commission duration has elapsed
    if (commission_duration_months && commission_duration_months > 0) {
      const convertedAt = new Date(conversion.converted_at)
      const monthsElapsed = (Date.now() - convertedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsElapsed >= commission_duration_months) {
        // Mark conversion as matured
        await supabase
          .from('affiliate_conversions')
          .update({ status: 'matured' })
          .eq('id', conversion.id)
        return
      }
    }

    // For first-only commission types, check if already paid once
    if (commission_kind === 'percent_first' || commission_kind === 'fixed_per_sale') {
      const { count } = await supabase
        .from('affiliate_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('conversion_id', conversion.id)
        .not('status', 'eq', 'cancelled')
      if ((count ?? 0) > 0) return
    }

    // Calculate amount
    let amountCents = 0
    const invoiceAmountCents = invoice.amount_paid ?? 0

    if (commission_kind === 'percent_first' || commission_kind === 'percent_recurring') {
      amountCents = Math.round((invoiceAmountCents * commission_value) / 100)
    } else {
      // fixed_per_sale
      amountCents = commission_value
    }

    if (amountCents <= 0) return

    const now = new Date()
    const referenceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    // Chargeback gate: 7 days
    const approvesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('affiliate_commissions').insert({
      affiliate_id:    conversion.affiliate_id,
      conversion_id:   conversion.id,
      coupon_id:       conversion.coupon_id,
      church_id:       churchId,
      stripe_invoice_id: invoice.id,
      amount_cents:    amountCents,
      commission_kind,
      reference_month: referenceMonth,
      status:          'pending',
      approves_at:     approvesAt,
    })
  } catch (e) {
    console.warn('[stripe-webhook] recordAffiliateCommission failed:', (e as Error).message)
  }
}

async function markConversionsChurned(churchId: string): Promise<void> {
  try {
    await supabase
      .from('affiliate_conversions')
      .update({ status: 'churned' })
      .eq('church_id', churchId)
      .eq('status', 'active')

    // Cancel pending/approved commissions
    await supabase
      .from('affiliate_commissions')
      .update({ status: 'cancelled' })
      .eq('church_id', churchId)
      .in('status', ['pending', 'approved'])
  } catch (e) {
    console.warn('[stripe-webhook] markConversionsChurned failed:', (e as Error).message)
  }
}

async function markConversionsRefunded(churchId: string, invoiceId: string): Promise<void> {
  try {
    // Cancel pending commissions for this invoice
    await supabase
      .from('affiliate_commissions')
      .update({ status: 'cancelled' })
      .eq('church_id', churchId)
      .eq('stripe_invoice_id', invoiceId)
      .eq('status', 'pending')
  } catch (e) {
    console.warn('[stripe-webhook] markConversionsRefunded failed:', (e as Error).message)
  }
}

// ── Landing page provisioning ────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

async function handleLandingPageCheckout(session: Stripe.Checkout.Session): Promise<void> {
  // SEC-005: Idempotência — verifica se este checkout já foi processado
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id, church_id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle()

  if (existingSub?.id) {
    console.log(`[stripe-webhook] landing checkout já processado (idempotente): session=${session.id} church=${existingSub.church_id}`)
    return
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const subId      = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null

  // Email obrigatório para convidar o pastor
  const email = session.customer_email
    ?? session.customer_details?.email
    ?? session.metadata?.email
    ?? null

  if (!email) {
    console.error('[stripe-webhook] landing_page checkout sem email:', session.id)
    return
  }

  const planSlug   = session.metadata?.plan_slug ?? 'chamado'
  const pastorName = (session.metadata?.name ?? session.customer_details?.name ?? '').trim()

  // Extrai nome da igreja de custom_fields (key: church_name)
  type CustomTextField = { key: string; text?: { value?: string | null } }
  const churchNameField = ((session.custom_fields ?? []) as CustomTextField[])
    .find(f => f.key === 'church_name')
  const churchName = churchNameField?.text?.value?.trim()
    || (pastorName ? `Igreja de ${pastorName}` : `Igreja ${email.split('@')[0]}`)

  // Slug único com sufixo de timestamp base-36
  const slug = `${slugify(churchName)}-${Date.now().toString(36)}`

  // 1. Cria church
  const { data: church, error: churchErr } = await supabase
    .from('churches')
    .insert({ name: churchName, slug, status: 'onboarding', subscription_plan: planSlug })
    .select('id')
    .single()

  if (churchErr || !church) {
    console.error('[stripe-webhook] falha ao criar church (landing):', churchErr?.message, session.id)
    return
  }

  const churchId = church.id
  console.log(`[stripe-webhook] church criada (landing): ${churchId} slug=${slug} plan=${planSlug}`)

  // 2. Cria subscription
  const { error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      church_id:                  churchId,
      plan_slug:                  planSlug,
      status:                     'active',
      stripe_subscription_id:     subId,
      stripe_customer_id:         customerId,
      stripe_checkout_session_id: session.id,
    })

  if (subErr) {
    console.error('[stripe-webhook] falha ao criar subscription (landing):', subErr.message)
    // Non-fatal — continua para convidar o pastor
  }

  // 3. Convida pastor via magic-link
  try {
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${Deno.env.get('ALLOWED_ORIGIN') ?? 'https://ekthos-platform.vercel.app'}/onboarding`,
        data: { full_name: pastorName },
      },
    )

    if (inviteErr) {
      console.warn('[stripe-webhook] inviteUserByEmail (landing):', inviteErr.message)
    } else if (invited?.user) {
      const { error: metaErr } = await supabase.auth.admin.updateUserById(
        invited.user.id,
        { app_metadata: { church_id: churchId, role: 'admin' } },
      )
      if (metaErr) console.warn('[stripe-webhook] updateUserById (landing):', metaErr.message)
      else console.log(`[stripe-webhook] pastor ${email} convidado → church ${churchId}`)
    }
  } catch (e) {
    console.warn('[stripe-webhook] invite failed (landing):', (e as Error).message)
  }

  // 4. Salva church_id no customer Stripe para resolveChurchId em futuros webhooks
  if (customerId) {
    try {
      await stripe.customers.update(customerId, { metadata: { church_id: churchId } })
    } catch (e) {
      console.warn('[stripe-webhook] customer metadata update (landing):', (e as Error).message)
    }
  }

  // 5. Affiliate conversion (non-fatal)
  await recordAffiliateConversion(session, churchId)
}

// ── Handlers ────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Landing page: provisiona church + usuário do zero
  if (session.metadata?.source === 'landing_page') {
    await handleLandingPageCheckout(session)
    return
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const subId      = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null

  const churchId = await resolveChurchId(
    session.metadata as Record<string, string> | null,
    customerId,
    session.id,
  )

  if (!churchId) {
    console.error('[stripe-webhook] checkout.session.completed: church_id não encontrado', session.id)
    return
  }

  console.log(`[stripe-webhook] checkout.session.completed church=${churchId} sub=${subId}`)

  // plan_slug do metadata (passado pelo stripe-checkout)
  const planSlug = session.metadata?.plan_slug ?? null

  // Atualiza subscription (inclui plan_slug)
  await updateSubscription(churchId, {
    stripe_subscription_id:     subId ?? undefined,
    stripe_customer_id:         customerId ?? undefined,
    stripe_checkout_session_id: session.id,
    status:                     'active',
    ...(planSlug ? { plan_slug: planSlug } : {}),
    updated_at:                 new Date().toISOString(),
  })

  // PAYMENT GATE: transiciona church de pending_payment → onboarding
  const { error: churchErr } = await supabase
    .from('churches')
    .update({ status: 'onboarding' })
    .eq('id', churchId)
    .eq('status', 'pending_payment') // só muda se ainda estava pending

  if (churchErr) {
    console.error('[stripe-webhook] falha ao atualizar church.status:', churchErr.message)
  } else {
    console.log(`[stripe-webhook] church ${churchId} → onboarding`)
  }

  // Envia convite de acesso ao pastor (non-fatal)
  const pastorEmail = session.metadata?.pastor_email
                   ?? session.customer_email
                   ?? session.customer_details?.email
                   ?? null

  if (pastorEmail) {
    try {
      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
        pastorEmail,
        {
          redirectTo: `${Deno.env.get('ALLOWED_ORIGIN') ?? 'https://ekthos-platform.vercel.app'}/onboarding`,
          data: {
            full_name: session.metadata?.pastor_name ?? '',
          },
        },
      )

      if (inviteErr) {
        console.warn('[stripe-webhook] inviteUserByEmail:', inviteErr.message)
      } else if (invited?.user) {
        // app_metadata não pode ser setado no invite — requer updateUserById
        const { error: metaErr } = await supabase.auth.admin.updateUserById(
          invited.user.id,
          { app_metadata: { church_id: churchId, role: 'admin' } },
        )
        if (metaErr) console.warn('[stripe-webhook] updateUserById:', metaErr.message)
        else console.log(`[stripe-webhook] pastor ${pastorEmail} convidado → church ${churchId}`)
      }
    } catch (e) {
      console.warn('[stripe-webhook] invite failed:', (e as Error).message)
    }
  } else {
    console.warn('[stripe-webhook] pastor email não encontrado no session — invite não enviado')
  }

  // Affiliate conversion (non-fatal)
  await recordAffiliateConversion(session, churchId)
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
  const subId      = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null

  const churchId = await resolveChurchId(invoice.metadata as Record<string, string> | null, customerId)
  if (!churchId) { console.error('[stripe-webhook] invoice.paid: church_id não encontrado', invoice.id); return }

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

  // Grava invoice (não-fatal)
  await supabase.from('invoices').insert({
    church_id: churchId, stripe_invoice_id: invoice.id,
    stripe_subscription_id: subId, stripe_customer_id: customerId,
    amount_paid: invoice.amount_paid, currency: invoice.currency,
    period_start: periodStart, period_end: periodEnd,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    status: invoice.status ?? 'paid', created_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[stripe-webhook] invoice insert:', error.message) })

  // Affiliate commission (non-fatal)
  await recordAffiliateCommission(invoice, churchId)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
  const churchId = await resolveChurchId(invoice.metadata as Record<string, string> | null, customerId)
  if (!churchId) { console.error('[stripe-webhook] invoice.payment_failed: church_id não encontrado', invoice.id); return }
  await updateSubscription(churchId, { status: 'past_due', updated_at: new Date().toISOString() })
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
  const churchId = await resolveChurchId(sub.metadata as Record<string, string> | null, customerId)
  if (!churchId) { console.error('[stripe-webhook] subscription.updated: church_id não encontrado', sub.id); return }

  const status = mapStripeStatus(sub.status)
  await updateSubscription(churchId, {
    status, stripe_subscription_id: sub.id,
    current_period_start: unixToIso(sub.current_period_start),
    current_period_end:   unixToIso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
  const churchId = await resolveChurchId(sub.metadata as Record<string, string> | null, customerId)
  if (!churchId) { console.error('[stripe-webhook] subscription.deleted: church_id não encontrado', sub.id); return }

  await updateSubscription(churchId, { status: 'canceled', cancel_at_period_end: false, updated_at: new Date().toISOString() })

  // Suspende a church
  await supabase.from('churches').update({ status: 'suspended' }).eq('id', churchId)
    .then(({ error }) => { if (error) console.error('[stripe-webhook] church suspend:', error.message) })

  // Mark affiliate conversions as churned (non-fatal)
  await markConversionsChurned(churchId)
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id ?? null
  const churchId = await resolveChurchId(charge.metadata as Record<string, string> | null, customerId)
  if (!churchId) return

  const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice as Stripe.Invoice | null)?.id ?? null
  if (!invoiceId) return

  // Cancel pending commissions for this refunded invoice (non-fatal)
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
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
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
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
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

  return jsonResponse({ received: true, event_id: event.id })
})
