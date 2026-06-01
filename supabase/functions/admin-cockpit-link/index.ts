// ============================================================
// Edge Function: admin-cockpit-link  v1
//
// Gera link Stripe Checkout rastreado para venda consultiva
// via cockpit admin. Todos os links incluem metadata obrigatória:
//   - church_id, admin_id, origin='cockpit_consultivo', price_id, note
//
// Audit: registra em admin_events antes de retornar a URL.
// Auth: is_ekthos_admin=true via app_metadata (verify_jwt=false).
//
// WHITELIST: somente Price IDs canônicos LIVE são aceitos.
// NUNCA aceitar price_id arbitrário do body.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

// ── Whitelist de Price IDs canônicos LIVE ─────────────────

const ALLOWED_PRICE_IDS: Record<string, { label: string; mode: 'payment' | 'subscription' }> = {
  'price_1TYroEHfvCy1ruEN6j4QxHmU': { label: 'Chamado (R$689,90/mês)',        mode: 'subscription' },
  'price_1Tcya5HfvCy1ruENDXuf9KlM': { label: 'Missão (R$1.639,90/mês)',        mode: 'subscription' },
  'price_1Tcya8HfvCy1ruENe5NqXPWH': { label: 'Avivamento (R$2.469,90/mês)',    mode: 'subscription' },
  'price_1TcyZmHfvCy1ruEND2SbGerK': { label: 'Recarga Emergencial (R$99,00)',  mode: 'payment'      },
  'price_1TcyZpHfvCy1ruENrQi5YdZu': { label: 'Recarga Ponte (R$269,00)',       mode: 'payment'      },
  'price_1TYroFHfvCy1ruENm4Lunluh': { label: 'Agent Acolhimento (R$290,00)',   mode: 'payment'      },
}

// ── CORS ──────────────────────────────────────────────────

function corsHeaders(origin: string) {
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:3000']
  const o = allowed.includes(origin) ? origin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin':  o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(data: unknown, status = 200, req: Request) {
  const origin = req.headers.get('origin') || ''
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// ── Handler ───────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, req)
  }

  // ── Auth: apenas admin Ekthos ──────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    return json({ error: 'unauthorized' }, 401, req)
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return json({ error: 'invalid token' }, 401, req)
  }

  const isAdmin = user.app_metadata?.is_ekthos_admin === true
  if (!isAdmin) {
    return json({ error: 'forbidden: ekthos admin only' }, 403, req)
  }

  // ── Parse body ─────────────────────────────────────────
  let body: { church_id?: string; price_id?: string; coupon?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400, req)
  }

  const { church_id, price_id, coupon, note } = body

  if (!church_id || typeof church_id !== 'string') {
    return json({ error: 'church_id required' }, 400, req)
  }
  if (!price_id || typeof price_id !== 'string') {
    return json({ error: 'price_id required' }, 400, req)
  }

  // ── Whitelist check ─────────────────────────────────────
  const produto = ALLOWED_PRICE_IDS[price_id]
  if (!produto) {
    return json({ error: 'price_id not in whitelist' }, 400, req)
  }

  // ── Buscar igreja + customer Stripe ────────────────────
  const { data: church } = await supabase
    .from('churches')
    .select('id, name')
    .eq('id', church_id)
    .maybeSingle()

  if (!church) {
    return json({ error: 'church not found' }, 404, req)
  }

  // Tentar obter stripe_customer_id da assinatura ativa
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('church_id', church_id)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const stripeCustomerId = sub?.stripe_customer_id ?? undefined

  // ── Criar Checkout Session ─────────────────────────────
  const metadata: Record<string, string> = {
    church_id,
    admin_id:  user.id,
    origin:    'cockpit_consultivo',
    price_id,
  }
  if (note && typeof note === 'string') {
    metadata.note = note.slice(0, 200)
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode:       produto.mode,
    line_items: [{ price: price_id, quantity: 1 }],
    metadata,
    success_url: `${ALLOWED_ORIGIN}/admin/churches/${church_id}?tab=assinatura&checkout=success`,
    cancel_url:  `${ALLOWED_ORIGIN}/admin/churches/${church_id}?tab=venda&checkout=cancelled`,
    expires_at:  Math.floor(Date.now() / 1000) + 86400, // 24h
  }

  if (stripeCustomerId) {
    sessionParams.customer = stripeCustomerId
  }

  if (coupon && typeof coupon === 'string' && coupon.trim()) {
    sessionParams.discounts = [{ coupon: coupon.trim().toUpperCase() }]
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(sessionParams)
  } catch (stripeErr: unknown) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr)
    console.error('[admin-cockpit-link] Stripe error:', msg)
    return json({ error: `stripe: ${msg}` }, 500, req)
  }

  // ── Audit: registra em admin_events ────────────────────
  await supabase.from('admin_events').insert({
    church_id,
    admin_user_id: user.id,
    actor_email:   user.email ?? null,
    action:        'cockpit_link_generated',
    after: {
      price_id,
      produto_label:   produto.label,
      coupon:          coupon ?? null,
      note:            note ?? null,
      checkout_url:    session.url,
      checkout_id:     session.id,
      expires_at:      new Date((session.expires_at) * 1000).toISOString(),
    },
  })

  return json({
    url:        session.url,
    expires_at: new Date(session.expires_at * 1000).toISOString(),
    session_id: session.id,
  }, 200, req)
})
