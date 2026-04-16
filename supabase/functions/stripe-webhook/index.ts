// ============================================================
// Edge Function: stripe-webhook
// Processa eventos do Stripe para ciclo de vida da assinatura.
//
// checkout.session.completed → churches.status = 'onboarding'
// invoice.paid               → subscription active + grava invoice
// invoice.payment_failed     → subscription past_due
// customer.subscription.*    → sync status/período
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

// ── Handlers ────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
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

  // Atualiza subscription
  await updateSubscription(churchId, {
    stripe_subscription_id:    subId ?? undefined,
    stripe_customer_id:        customerId ?? undefined,
    stripe_checkout_session_id: session.id,
    status:                    'active',
    updated_at:                new Date().toISOString(),
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
      default:
        console.log(`[stripe-webhook] evento ignorado: ${event.type}`)
    }
  } catch (e) {
    return errorResponse('Handler error', 500, (e as Error).message)
  }

  return jsonResponse({ received: true, event_id: event.id })
})
