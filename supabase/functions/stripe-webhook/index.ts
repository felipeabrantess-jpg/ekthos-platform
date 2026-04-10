// ============================================================
// Edge Function: stripe-webhook
// Handles Stripe webhook events for subscription lifecycle
//
// POST /stripe-webhook
// Headers: stripe-signature (Stripe sets this automatically)
// No JWT — Stripe calls this endpoint directly
//
// verify_jwt: false — public endpoint, secured by Stripe signature
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ──────────────────────────────────────────────────────────
// Environment — fail fast at cold start
// ──────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!STRIPE_SECRET_KEY) throw new Error('[stripe-webhook] STRIPE_SECRET_KEY not set')
if (!STRIPE_WEBHOOK_SECRET) throw new Error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
if (!SUPABASE_URL) throw new Error('[stripe-webhook] SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY not set')

// ──────────────────────────────────────────────────────────
// Clients
// ──────────────────────────────────────────────────────────
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────
type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'paused'

interface SubscriptionUpdate {
  status?: SubscriptionStatus
  stripe_subscription_id?: string
  stripe_customer_id?: string
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end?: boolean
  updated_at: string
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number, details?: unknown): Response {
  console.error(`[stripe-webhook] ${status} — ${message}`, details ?? '')
  return jsonResponse({ error: message, details: details ?? null }, status)
}

// Convert Unix timestamp (Stripe) → ISO 8601 string
function unixToIso(ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toISOString()
}

// Map Stripe subscription status to our internal enum
// Stripe statuses: active | past_due | canceled | incomplete |
//                  incomplete_expired | trialing | paused | unpaid
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    paused: 'paused',
    unpaid: 'past_due',
  }
  return map[stripeStatus] ?? 'incomplete'
}

// ──────────────────────────────────────────────────────────
// church_id resolution
// Priority: event metadata → customer metadata (fallback)
// ──────────────────────────────────────────────────────────
async function resolveChurchId(
  eventMetadata: Record<string, string> | null,
  customerId: string | null
): Promise<string | null> {
  // 1. Prefer metadata attached directly to the event object
  if (eventMetadata?.church_id) {
    return eventMetadata.church_id
  }

  // 2. Fall back to Stripe customer metadata
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted && customer.metadata?.church_id) {
        return customer.metadata.church_id
      }
    } catch (err) {
      console.warn('[stripe-webhook] Could not retrieve customer metadata:', (err as Error).message)
    }
  }

  return null
}

// ──────────────────────────────────────────────────────────
// DB helpers
// ──────────────────────────────────────────────────────────
async function updateSubscription(
  churchId: string,
  patch: SubscriptionUpdate
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('church_id', churchId)

  if (error) {
    // Throw so the caller can return 500 and Stripe retries
    throw new Error(`DB update failed for church ${churchId}: ${error.message}`)
  }
}

async function insertInvoice(params: {
  churchId: string
  stripeInvoiceId: string
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  amountPaid: number
  currency: string
  periodStart: string | null
  periodEnd: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  status: string
}): Promise<void> {
  const { error } = await supabase.from('invoices').insert({
    church_id: params.churchId,
    stripe_invoice_id: params.stripeInvoiceId,
    stripe_subscription_id: params.stripeSubscriptionId,
    stripe_customer_id: params.stripeCustomerId,
    amount_paid: params.amountPaid,
    currency: params.currency,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    hosted_invoice_url: params.hostedInvoiceUrl,
    invoice_pdf: params.invoicePdf,
    status: params.status,
    created_at: new Date().toISOString(),
  })

  if (error) {
    // Log but don't throw — subscription update is more critical
    console.error('[stripe-webhook] Failed to insert invoice:', error.message, params.stripeInvoiceId)
  }
}

// ──────────────────────────────────────────────────────────
// Event handlers
// ──────────────────────────────────────────────────────────

// checkout.session.completed
// First time a subscription is created through Checkout
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const churchId = await resolveChurchId(
    session.metadata as Record<string, string> | null,
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  )

  if (!churchId) {
    console.error('[stripe-webhook] checkout.session.completed: church_id not found', session.id)
    return
  }

  const stripeSubscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null

  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null

  console.log(`[stripe-webhook] checkout.session.completed church=${churchId} sub=${stripeSubscriptionId}`)

  await updateSubscription(churchId, {
    stripe_subscription_id: stripeSubscriptionId ?? undefined,
    stripe_customer_id: stripeCustomerId ?? undefined,
    status: 'active',
    updated_at: new Date().toISOString(),
  })
}

// invoice.paid
// Recurring payment succeeded — refresh period and record invoice
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null

  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null

  const churchId = await resolveChurchId(
    invoice.metadata as Record<string, string> | null,
    stripeCustomerId
  )

  if (!churchId) {
    console.error('[stripe-webhook] invoice.paid: church_id not found', invoice.id)
    return
  }

  console.log(`[stripe-webhook] invoice.paid church=${churchId} invoice=${invoice.id}`)

  // Derive period from the invoice's subscription line item when available
  let periodStart: string | null = null
  let periodEnd: string | null = null

  const subscriptionLine = invoice.lines?.data?.find(
    (line) => line.type === 'subscription'
  )
  if (subscriptionLine?.period) {
    periodStart = unixToIso(subscriptionLine.period.start)
    periodEnd = unixToIso(subscriptionLine.period.end)
  }

  // Update subscription status and period
  await updateSubscription(churchId, {
    status: 'active',
    current_period_start: periodStart ?? undefined,
    current_period_end: periodEnd ?? undefined,
    updated_at: new Date().toISOString(),
  })

  // Record invoice — non-fatal if it fails (see insertInvoice)
  await insertInvoice({
    churchId,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId,
    stripeCustomerId,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    periodStart,
    periodEnd,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
    status: invoice.status ?? 'paid',
  })
}

// invoice.payment_failed
// Card declined or payment method expired
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? null

  const churchId = await resolveChurchId(
    invoice.metadata as Record<string, string> | null,
    stripeCustomerId
  )

  if (!churchId) {
    console.error('[stripe-webhook] invoice.payment_failed: church_id not found', invoice.id)
    return
  }

  console.log(`[stripe-webhook] invoice.payment_failed church=${churchId} invoice=${invoice.id}`)

  await updateSubscription(churchId, {
    status: 'past_due',
    updated_at: new Date().toISOString(),
  })
}

// customer.subscription.updated
// Plan change, cancellation schedule, trial ending, status change
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null

  const churchId = await resolveChurchId(
    subscription.metadata as Record<string, string> | null,
    stripeCustomerId
  )

  if (!churchId) {
    console.error('[stripe-webhook] customer.subscription.updated: church_id not found', subscription.id)
    return
  }

  const status = mapStripeStatus(subscription.status)
  const periodStart = unixToIso(subscription.current_period_start)
  const periodEnd = unixToIso(subscription.current_period_end)

  console.log(
    `[stripe-webhook] customer.subscription.updated church=${churchId} status=${status} ` +
    `cancel_at_period_end=${subscription.cancel_at_period_end}`
  )

  await updateSubscription(churchId, {
    status,
    stripe_subscription_id: subscription.id,
    current_period_start: periodStart ?? undefined,
    current_period_end: periodEnd ?? undefined,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  })
}

// customer.subscription.deleted
// Subscription fully canceled (period ended or immediate cancellation)
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null

  const churchId = await resolveChurchId(
    subscription.metadata as Record<string, string> | null,
    stripeCustomerId
  )

  if (!churchId) {
    console.error('[stripe-webhook] customer.subscription.deleted: church_id not found', subscription.id)
    return
  }

  console.log(`[stripe-webhook] customer.subscription.deleted church=${churchId}`)

  await updateSubscription(churchId, {
    status: 'canceled',
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  })
}

// ──────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // ── Verify Stripe signature ──────────────────────────────
  // Must read raw body as ArrayBuffer — any string conversion
  // will corrupt the signature check.
  const body = await req.arrayBuffer()
  const rawBody = new Uint8Array(body)

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return errorResponse('Missing stripe-signature header', 400)
  }

  let event: Stripe.Event
  try {
    // stripe.webhooks.constructEventAsync is available in Stripe SDK ≥ 12
    // and accepts Uint8Array | Buffer | string
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] Signature verification failed:', message)
    // Return 400 — Stripe will NOT retry on 4xx (signature mismatch is permanent)
    return errorResponse('Webhook signature verification failed', 400, message)
  }

  console.log(`[stripe-webhook] Received event: ${event.type} id=${event.id}`)

  // ── Dispatch event ───────────────────────────────────────
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
        // Return 200 for unhandled events — Stripe expects acknowledgement
        console.log(`[stripe-webhook] Unhandled event type: ${event.type} — ignoring`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, message)
    // Return 500 so Stripe retries the event (up to its retry policy)
    return errorResponse('Internal server error processing event', 500, message)
  }

  // Stripe requires a 2xx to acknowledge receipt
  return jsonResponse({ received: true, event_id: event.id })
})
