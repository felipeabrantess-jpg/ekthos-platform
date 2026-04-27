// ============================================================
// Edge Function: addon-request
// Registra pedido de contratação de agente ou módulo.
//
// POST /addon-request
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { addon_type: 'agent' | 'module', addon_slug: string }
// Returns: 201 { pending_addon_id, charge_at, addon_slug }
//          409 se já existe pedido pendente ou ativo para esse slug
//
// verify_jwt: false — validação manual (padrão ES256)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Preços por slug (cents) ───────────────────────────────────
const ADDON_PRICES: Record<string, number> = {
  // Agentes avulsos
  'agent-cadastro':      14990,
  'agent-conteudo':      14990,
  'agent-metricas':      14990,
  'agent-whatsapp':      14990,
  'agent-financeiro':    14990,
  'agent-reengajamento': 14990,
  'agent-agenda':        14990,
  'agent-voluntarios':   14990,
  'agent-kids-pastoral': 14990,
  'agent-kids-comunicacao': 14990,
  // Módulos
  'volunteer-pro':  28990,
  'kids-pro':       34990,
  'financeiro-pro': 48990,
}

// ── CORS ─────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return jsonErr('Method not allowed', 405)
  }

  // ── Auth ───────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonErr('Unauthorized', 401)
  const token = authHeader.slice(7)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  const churchId = user.app_metadata?.church_id as string | undefined
  if (!churchId) return jsonErr('Church not found in token', 400)

  // ── Body ───────────────────────────────────────────────────
  let body: { addon_type?: string; addon_slug?: string }
  try {
    body = await req.json()
  } catch {
    return jsonErr('Invalid JSON body', 400)
  }

  const { addon_type, addon_slug } = body
  if (!addon_type || !['agent', 'module'].includes(addon_type)) {
    return jsonErr('addon_type must be "agent" or "module"', 400)
  }
  if (!addon_slug || typeof addon_slug !== 'string') {
    return jsonErr('addon_slug is required', 400)
  }

  // ── Preço ─────────────────────────────────────────────────
  const price_cents = ADDON_PRICES[addon_slug]
  if (!price_cents) return jsonErr(`Unknown addon_slug: ${addon_slug}`, 400)

  // ── Checar duplicata — pedido já pending ou já ativo ──────
  const { data: existing } = await supabase
    .from('pending_addons')
    .select('id, status')
    .eq('church_id', churchId)
    .eq('addon_slug', addon_slug)
    .in('status', ['pending', 'confirmed'])
    .maybeSingle()

  if (existing) {
    return jsonErr('Já existe um pedido ativo para esse addon', 409)
  }

  // ── Se for agente, checar subscription_agents ─────────────
  if (addon_type === 'agent') {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('church_id', churchId)
      .maybeSingle()

    if (sub) {
      const { data: activeAgent } = await supabase
        .from('subscription_agents')
        .select('agent_slug')
        .eq('subscription_id', sub.id)
        .eq('agent_slug', addon_slug)
        .eq('active', true)
        .maybeSingle()

      if (activeAgent) return jsonErr('Agente já está ativo na sua assinatura', 409)
    }
  }

  // ── Calcular charge_at = next billing date ────────────────
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('current_period_end')
    .eq('church_id', churchId)
    .maybeSingle()

  const charge_at = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // fallback: +30 days

  // ── Inserir pending_addon ─────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from('pending_addons')
    .insert({
      church_id: churchId,
      user_id: user.id,
      addon_type,
      addon_slug,
      price_cents,
      charge_at,
    })
    .select('id, charge_at')
    .single()

  if (insertErr) {
    console.error('Insert error:', insertErr)
    return jsonErr('Erro ao registrar pedido', 500)
  }

  return jsonOk({
    pending_addon_id: inserted.id,
    addon_slug,
    charge_at: inserted.charge_at,
    price_cents,
  }, 201)
})
