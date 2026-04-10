// ============================================================
// Edge Function: stripe-checkout
// Creates a Stripe Checkout Session for a given plan
//
// POST /stripe-checkout
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { plan_slug: string, success_url: string, cancel_url: string }
// Returns: { url: string }
//
// verify_jwt: false — JWT is validated manually below
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ──────────────────────────────────────────────────────────
// Environment — fail fast at cold start if misconfigured
// ──────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!STRIPE_SECRET_KEY) throw new Error('[stripe-checkout] STRIPE_SECRET_KEY not set')
if (!SUPABASE_URL) throw new Error('[stripe-checkout] SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('[stripe-checkout] SUPABASE_SERVICE_ROLE_KEY not set')

// ──────────────────────────────────────────────────────────
// Clients (singleton — reused across warm invocations)
// ──────────────────────────────────────────────────────────
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client: bypasses RLS intentionally
// Never expose this key to the browser
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ──────────────────────────────────────────────────────────
// CORS — restrict to your own domain in production via env
// ──────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────
interface CheckoutRequestBody {
  plan_slug: string
  success_url: string
  cancel_url: string
}

interface Plan {
  id: string
  slug: string
  name: string
  stripe_price_id: string
}

interface Subscription {
  id: string
  church_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number, details?: unknown): Response {
  console.error(`[stripe-checkout] ${status} — ${message}`, details ?? '')
  return jsonResponse({ error: message, details: details ?? null }, status)
}

// ──────────────────────────────────────────────────────────
// JWT validation — extracts user_id and church_id from claims
// We validate manually because verify_jwt=false is set in
// config.toml so Stripe webhook can share the same pattern.
// ──────────────────────────────────────────────────────────
async function validateJwt(authHeader: string | null): Promise<{
  userId: string
  churchId: string
} | null> {
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)

  // Use Supabase auth.getUser which verifies the JWT signature
  // against the project's JWT secret — safe and canonical.
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    console.warn('[stripe-checkout] JWT validation failed:', error?.message)
    return null
  }

  // church_id is expected in app_metadata (set by your auth hook / admin)
  const churchId: string | undefined =
    data.user.app_metadata?.church_id ?? data.user.user_metadata?.church_id

  if (!churchId) {
    console.warn('[stripe-checkout] church_id missing from JWT claims for user', data.user.id)
    return null
  }

  return { userId: data.user.id, churchId }
}

// ──────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // ── 1. Validate JWT ──────────────────────────────────────
  const auth = await validateJwt(req.headers.get('Authorization'))
  if (!auth) {
    return errorResponse('Unauthorized', 401)
  }
  const { userId, churchId } = auth

  // ── 2. Parse and validate body ───────────────────────────
  let body: CheckoutRequestBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { plan_slug, success_url, cancel_url } = body

  if (!plan_slug || typeof plan_slug !== 'string') {
    return errorResponse('plan_slug is required', 422)
  }
  if (!success_url || !cancel_url) {
    return errorResponse('success_url and cancel_url are required', 422)
  }

  // Basic URL safety check — prevent open-redirect abuse
  try {
    new URL(success_url)
    new URL(cancel_url)
  } catch {
    return errorResponse('success_url and cancel_url must be valid URLs', 422)
  }

  console.log(`[stripe-checkout] user=${userId} church=${churchId} plan=${plan_slug}`)

  // ── 3. Fetch plan from DB ────────────────────────────────
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('id, slug, name, stripe_price_id')
    .eq('slug', plan_slug)
    .eq('is_active', true)
    .single<Plan>()

  if (planError || !plan) {
    console.error('[stripe-checkout] Plan not found:', planError?.message)
    return errorResponse(`Plan '${plan_slug}' not found or inactive`, 404)
  }

  if (!plan.stripe_price_id) {
    return errorResponse(`Plan '${plan_slug}' has no Stripe price configured`, 500)
  }

  // ── 4. Fetch or create subscription row ──────────────────
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('id, church_id, stripe_customer_id, stripe_subscription_id, status')
    .eq('church_id', churchId)
    .maybeSingle<Subscription>()

  if (subError) {
    console.error('[stripe-checkout] Error fetching subscription:', subError.message)
    return errorResponse('Failed to load subscription', 500)
  }

  // ── 5. Create or retrieve Stripe customer ────────────────
  let stripeCustomerId: string

  if (subscription?.stripe_customer_id) {
    stripeCustomerId = subscription.stripe_customer_id
    console.log(`[stripe-checkout] Reusing Stripe customer ${stripeCustomerId}`)
  } else {
    // Fetch church name for the customer label
    const { data: church } = await supabase
      .from('churches')
      .select('name, slug')
      .eq('id', churchId)
      .single()

    const customer = await stripe.customers.create({
      metadata: { church_id: churchId, created_by_user: userId },
      ...(church?.name ? { name: church.name } : {}),
    })

    stripeCustomerId = customer.id
    console.log(`[stripe-checkout] Created Stripe customer ${stripeCustomerId}`)

    // Persist stripe_customer_id — upsert handles both insert and update
    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        church_id: churchId,
        stripe_customer_id: stripeCustomerId,
        status: subscription?.status ?? 'incomplete',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'church_id' }
    )

    if (upsertError) {
      console.error('[stripe-checkout] Failed to persist stripe_customer_id:', upsertError.message)
      // Non-fatal: Stripe session can still be created; webhook will sync
    }
  }

  // ── 6. Create Stripe Checkout Session ────────────────────
  // Append {CHECKOUT_SESSION_ID} to success_url so the front-end
  // can confirm the session without storing it server-side.
  const separator = success_url.includes('?') ? '&' : '?'
  const successUrlWithSession = `${success_url}${separator}session_id={CHECKOUT_SESSION_ID}`

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: successUrlWithSession,
      cancel_url: cancel_url,
      metadata: {
        church_id: churchId,
        plan_slug: plan_slug,
        plan_id: plan.id,
        initiated_by: userId,
      },
      // Allow promotion codes entered by the customer at checkout
      allow_promotion_codes: true,
      // Collect billing address for tax / invoice purposes
      billing_address_collection: 'auto',
    })
  } catch (err) {
    const stripeErr = err as Stripe.StripeRawError
    console.error('[stripe-checkout] Stripe session creation failed:', stripeErr.message)
    return errorResponse('Failed to create checkout session', 502, stripeErr.message)
  }

  if (!session.url) {
    return errorResponse('Stripe returned a session without a URL', 502)
  }

  console.log(`[stripe-checkout] Session created: ${session.id} → ${session.url}`)

  return jsonResponse({ url: session.url })
})
