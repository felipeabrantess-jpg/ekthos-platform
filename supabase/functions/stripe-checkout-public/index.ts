// ============================================================
// Edge Function: stripe-checkout-public
// Cria uma Stripe Checkout Session a partir da landing page.
// NÃO requer JWT — o pastor ainda não tem conta na Ekthos.
//
// POST /stripe-checkout-public
// Body: {
//   plan_slug:    string           (chamado | missao | avivamento)
//   email?:       string           (pré-preenche o checkout Stripe)
//   name?:        string
//   success_url:  string
//   cancel_url:   string
//   utm_source?:  string
//   utm_medium?:  string
//   utm_campaign?: string
//   utm_content?: string
// }
// Returns: { url: string }
//
// Após o pagamento, o stripe-webhook deve detectar
// metadata.source === 'landing_page' e criar o usuário Supabase.
// ============================================================

import Stripe       from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || '*'

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
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(msg: string, status: number, detail?: unknown): Response {
  console.error(`[stripe-checkout-public] ${status} — ${msg}`, detail ?? '')
  return json({ error: msg }, status)
}

// ── Resolve line item (mesma lógica do stripe-checkout autenticado) ────
async function resolvePriceLineItem(
  planSlug: string,
  planName: string,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  const { data: sp } = await supabase
    .from('stripe_prices')
    .select('stripe_price_id')
    .eq('plan_slug', planSlug)
    .eq('nickname', 'plan_base')
    .eq('active', true)
    .maybeSingle()

  if (!sp?.stripe_price_id) {
    // Fallback: cria price_data inline usando valor do plano no banco
    const { data: plan } = await supabase
      .from('plans')
      .select('price_cents, name')
      .eq('slug', planSlug)
      .eq('active', true)
      .maybeSingle()

    if (!plan?.price_cents) {
      throw new Error(`Plano '${planSlug}' sem price configurado. Execute stripe-bootstrap.`)
    }

    return {
      quantity: 1,
      price_data: {
        currency:    'brl',
        unit_amount: plan.price_cents,
        recurring:   { interval: 'month' },
        product_data: { name: planName },
      },
    }
  }

  return { quantity: 1, price: sp.stripe_price_id }
}

// ── Handler ────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST')    return err('Method not allowed', 405)

  let body: {
    plan_slug?:    string
    email?:        string
    name?:         string
    success_url?:  string
    cancel_url?:   string
    utm_source?:   string
    utm_medium?:   string
    utm_campaign?: string
    utm_content?:  string
  }
  try { body = await req.json() } catch { return err('Body inválido', 400) }

  const {
    plan_slug, email, name,
    success_url, cancel_url,
    utm_source, utm_medium, utm_campaign, utm_content,
  } = body

  if (!plan_slug)                  return err('plan_slug é obrigatório', 422)
  if (!success_url || !cancel_url) return err('success_url e cancel_url são obrigatórios', 422)
  try { new URL(success_url); new URL(cancel_url) } catch { return err('URLs inválidas', 422) }

  // Valida email se fornecido
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('Email inválido', 422)
  }

  // Busca o plano — PK é slug, sem coluna id
  const { data: plan } = await supabase
    .from('plans')
    .select('slug, name')
    .eq('slug', plan_slug)
    .eq('active', true)
    .maybeSingle()

  if (!plan) return err(`Plano '${plan_slug}' não encontrado ou inativo`, 404)

  // Resolve price
  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem
  try {
    lineItem = await resolvePriceLineItem(plan_slug, plan.name)
  } catch (e) {
    return err((e as Error).message, 500)
  }

  // Monta metadata com UTMs para rastreamento de conversão
  const metadata: Record<string, string> = {
    plan_slug,
    source: 'landing_page',
  }
  if (email)        metadata.email        = email
  if (name)         metadata.name         = name ?? ''
  if (utm_source)   metadata.utm_source   = utm_source
  if (utm_medium)   metadata.utm_medium   = utm_medium
  if (utm_campaign) metadata.utm_campaign = utm_campaign
  if (utm_content)  metadata.utm_content  = utm_content

  const sep = success_url.includes('?') ? '&' : '?'

  // Parâmetros do checkout
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode:       'subscription',
    line_items: [lineItem],
    success_url: `${success_url}${sep}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url,
    metadata,
    allow_promotion_codes:      true,
    billing_address_collection: 'required',
    // Coleta email no checkout se não fornecido
    ...(email ? { customer_email: email } : {}),
    // Campos customizados para coletar o nome da igreja
    custom_fields: [
      {
        key:   'church_name',
        label: { type: 'custom', custom: 'Nome da sua igreja' },
        type:  'text',
      },
    ],
    // Texto personalizado no botão de pagamento
    submit_type: 'subscribe',
    // Locale português
    locale: 'pt-BR',
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(sessionParams)
  } catch (e) {
    return err('Erro ao criar sessão Stripe', 502, (e as Error).message)
  }

  if (!session.url) return err('Stripe retornou sessão sem URL', 502)

  console.log(`[stripe-checkout-public] session=${session.id} plan=${plan_slug} email=${email ?? 'n/a'}`)

  return json({ url: session.url, session_id: session.id })
})
