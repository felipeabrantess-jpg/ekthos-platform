// ============================================================
// F5: coupon-validate v1
// Motor único de validação de cupom.
//
// POST /functions/v1/coupon-validate
// verify_jwt: false — auth CONDICIONAL:
//   - stripe_checkout: anônimo (landing page, pastor sem conta)
//   - cockpit_assisted: requer JWT de admin Ekthos
//
// Sempre registra tentativa em coupon_redemptions (mesmo rejeitadas).
// Nunca registra quando coupon_id seria NULL (invalid_code).
//
// Cenários de validação (em ordem):
//   1. Rate limit por IP   → reason: 'rate_limit'  (200 silencioso)
//   2. Rate limit por email→ reason: 'rate_limit'  (200 silencioso)
//   3. Cupom não existe    → reason: 'invalid_code'
//   4. Expirado            → reason: 'expired'
//   5. Max redemptions     → reason: 'max_redemptions_reached'
//   6. Plan fora do scope  → reason: 'plan_not_eligible'
//   7. Max por email       → reason: 'already_used_by_email'
//   8. Válido              → { valid: true, discount_applied_cents, ... }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
]

// Tunable: pode ser baixado para 10/5 se observarmos abuso real.
// Métricas em /admin/leads ou cockpit dedicado de anti-fraude
// (futuro) vão informar ajustes.
const MAX_ATTEMPTS_PER_IP_PER_HOUR    = 20
const MAX_ATTEMPTS_PER_EMAIL_PER_HOUR = 10

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  })
}

// Cliente para validar JWT do admin (cockpit_assisted)
// Separado do admin client — previne contaminação de RLS.
const supabaseAuth = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Cliente para operações no banco (service_role bypassa RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ──────────────────────────────────────────────────

function calcDiscount(coupon: Record<string, unknown>, originalCents: number): number {
  if (coupon.discount_type === 'percent_off') {
    return Math.floor(originalCents * (coupon.discount_value as number) / 100)
  }
  // amount_off em centavos absolutos — nunca excede o preço original
  return Math.min(coupon.discount_value as number, originalCents)
}

async function getPlanPrice(slug: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('plans')
    .select('price_cents')
    .eq('slug', slug)
    .single()
  return (data as { price_cents: number } | null)?.price_cents ?? 0
}

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, origin)
  }

  const ip        = (req.headers.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim()
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400, origin)
  }

  const code         = (body.code         as string | undefined)?.trim().toUpperCase()
  const email        = (body.email        as string | undefined)?.trim().toLowerCase()
  const plan_slug    = (body.plan_slug    as string | undefined)?.trim()
  const channel      = (body.channel      as string | undefined) ?? 'stripe_checkout'
  const applied_by   = (body.applied_by   as string | null)      ?? null
  const utm_source   = (body.utm_source   as string | null)      ?? null
  const utm_medium   = (body.utm_medium   as string | null)      ?? null
  const utm_campaign = (body.utm_campaign as string | null)      ?? null
  const utm_content  = (body.utm_content  as string | null)      ?? null

  // ── Validações básicas ────────────────────────────────────
  if (!code || !email || !plan_slug) {
    return json({ valid: false, reason: 'missing_params' }, 400, origin)
  }
  if (code.length > 50) {
    return json({ valid: false, reason: 'invalid_code_format' }, 400, origin)
  }
  if (!['stripe_checkout', 'cockpit_assisted', 'api'].includes(channel)) {
    return json({ valid: false, reason: 'invalid_channel' }, 400, origin)
  }

  // ── Confirmar que plan_slug existe na tabela plans ───────
  // Evita atacante usar plan_slug inválido para gerar redemptions
  // com original_price=0, final=0 (passaria CHECK chk_prices_consistent
  // mas seria inválido semanticamente).
  const { data: planExists } = await supabaseAdmin
    .from('plans')
    .select('slug')
    .eq('slug', plan_slug)
    .maybeSingle()

  if (!planExists) {
    return json({ valid: false, reason: 'invalid_plan_slug' }, 400, origin)
  }

  // ── Auth condicional: cockpit_assisted requer JWT admin ───
  if (channel === 'cockpit_assisted') {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    if (!token) {
      return json({ valid: false, reason: 'cockpit_requires_auth' }, 401, origin)
    }
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
    if (authErr || !user) {
      return json({ valid: false, reason: 'invalid_token' }, 401, origin)
    }
    const isAdmin =
      user.app_metadata?.is_ekthos_admin === true ||
      user.user_metadata?.is_ekthos_admin === true
    if (!isAdmin) {
      return json({ valid: false, reason: 'forbidden' }, 403, origin)
    }
    if (!applied_by) {
      return json({ valid: false, reason: 'cockpit_requires_applied_by' }, 400, origin)
    }
  }

  // ── RATE LIMIT por IP — DECISÃO ARQUITETURAL F5 ───────────
  // Conta TODAS as tentativas (não filtra was_blocked=false como
  // lead-capture). Cupom é alvo de força bruta clássica (códigos
  // curtos, adivinháveis). Lockout duro durante a janela é a
  // proteção correta. Lead-capture pode ser mais permissivo
  // porque email+plano não é adivinhável.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count: ipCount } = await supabaseAdmin
    .from('coupon_validate_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('attempted_at', oneHourAgo)

  if ((ipCount ?? 0) >= MAX_ATTEMPTS_PER_IP_PER_HOUR) {
    await supabaseAdmin.from('coupon_validate_rate_limits').insert({
      ip_address: ip, email, coupon_code: code,
      user_agent: userAgent, was_blocked: true, block_reason: 'ip_rate_limit',
    })
    console.warn(`[coupon-validate] IP bloqueado: ${ip} (rate limit)`)
    return json({ valid: false, reason: 'rate_limit' }, 200, origin)
  }

  // ── RATE LIMIT por email ──────────────────────────────────
  // Mesmo raciocínio: conta todas as tentativas daquele email.
  const { count: emailCount } = await supabaseAdmin
    .from('coupon_validate_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('attempted_at', oneHourAgo)

  if ((emailCount ?? 0) >= MAX_ATTEMPTS_PER_EMAIL_PER_HOUR) {
    await supabaseAdmin.from('coupon_validate_rate_limits').insert({
      ip_address: ip, email, coupon_code: code,
      user_agent: userAgent, was_blocked: true, block_reason: 'email_rate_limit',
    })
    console.warn(`[coupon-validate] email bloqueado: ${email} (rate limit)`)
    return json({ valid: false, reason: 'rate_limit' }, 200, origin)
  }

  // ── Buscar cupom ──────────────────────────────────────────
  const { data: coupon } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()

  // ── Helper: registrar rejeição em redemptions + rate_limits ─
  // NÃO chamado quando cupom não existe (coupon_id NOT NULL na FK).
  async function logRejection(
    couponRow: Record<string, unknown>,
    rejectionReason: string
  ) {
    const original = await getPlanPrice(plan_slug!)
    const discount = calcDiscount(couponRow, original)

    await supabaseAdmin.from('coupon_redemptions').insert({
      coupon_id:              couponRow.id,
      email,
      church_id:              null,
      redemption_channel:     channel,
      applied_by,
      plan_slug,
      original_price_cents:   original,
      discount_applied_cents: discount,
      final_price_cents:      original - discount,
      status:                 'rejected',
      rejection_reason:       rejectionReason,
      utm_source, utm_medium, utm_campaign, utm_content,
      ip_address:             ip,
      user_agent:             userAgent,
    })

    await supabaseAdmin.from('coupon_validate_rate_limits').insert({
      ip_address: ip, email, coupon_code: code,
      user_agent: userAgent,
      was_blocked: true,
      block_reason: rejectionReason,
    })
  }

  // ── CENÁRIO 1: cupom não existe ou inativo ────────────────
  if (!coupon) {
    // NÃO registra em coupon_redemptions (coupon_id seria NULL — viola FK)
    // Registra apenas em rate_limits para auditoria
    await supabaseAdmin.from('coupon_validate_rate_limits').insert({
      ip_address: ip, email, coupon_code: code,
      user_agent: userAgent,
      was_blocked: true,
      block_reason: 'invalid_code',
    })
    return json({ valid: false, reason: 'invalid_code' }, 200, origin)
  }

  // ── CENÁRIO 2: expirado ───────────────────────────────────
  if (coupon.valid_until && new Date(coupon.valid_until as string) < new Date()) {
    await logRejection(coupon, 'expired')
    return json({ valid: false, reason: 'expired' }, 200, origin)
  }

  // ── CENÁRIO 3: max_redemptions atingido ───────────────────
  if (
    coupon.max_redemptions != null &&
    (coupon.times_redeemed as number) >= (coupon.max_redemptions as number)
  ) {
    await logRejection(coupon, 'max_redemptions_reached')
    return json({ valid: false, reason: 'max_redemptions_reached' }, 200, origin)
  }

  // ── CENÁRIO 4: plan_scope não inclui o plano ──────────────
  const scope = coupon.plan_scope as string[]
  if (!scope.includes('*') && !scope.includes(plan_slug!)) {
    await logRejection(coupon, 'plan_not_eligible')
    return json({ valid: false, reason: 'plan_not_eligible' }, 200, origin)
  }

  // ── CENÁRIO 5: max_per_customer atingido ──────────────────
  const { count: byEmailCount } = await supabaseAdmin
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id as string)
    .eq('email', email)
    .in('status', ['validated', 'redeemed'])

  if ((byEmailCount ?? 0) >= ((coupon.max_per_customer as number) ?? 1)) {
    await logRejection(coupon, 'already_used_by_email')
    return json({ valid: false, reason: 'already_used_by_email' }, 200, origin)
  }

  // ── CENÁRIO 6: válido — registrar como 'attempted' ────────
  const original = await getPlanPrice(plan_slug!)
  const discount = calcDiscount(coupon, original)
  const final    = original - discount

  const { data: redemption, error: redErr } = await supabaseAdmin
    .from('coupon_redemptions')
    .insert({
      coupon_id:              coupon.id,
      email,
      church_id:              null,
      redemption_channel:     channel,
      applied_by,
      plan_slug,
      original_price_cents:   original,
      discount_applied_cents: discount,
      final_price_cents:      final,
      status:                 'attempted',
      utm_source, utm_medium, utm_campaign, utm_content,
      ip_address:             ip,
      user_agent:             userAgent,
    })
    .select('id')
    .single()

  if (redErr) {
    console.error('[coupon-validate] redemption insert error:', redErr.message)
    return json({ valid: false, reason: 'internal_error' }, 500, origin)
  }

  // Registrar tentativa bem-sucedida no rate limit (was_blocked=false)
  await supabaseAdmin.from('coupon_validate_rate_limits').insert({
    ip_address: ip, email, coupon_code: code,
    user_agent: userAgent, was_blocked: false,
  })

  // Response público (caminho stripe_checkout)
  const baseResponse = {
    valid:                    true,
    coupon_id:                coupon.id,
    discount_type:            coupon.discount_type,
    discount_value:           coupon.discount_value,
    duration:                 coupon.duration,
    duration_in_months:       coupon.duration_in_months ?? null,
    original_price_cents:     original,
    discount_applied_cents:   discount,
    final_price_cents:        final,
    stripe_promotion_code_id: coupon.stripe_promotion_code_id ?? null,
  }

  // Campos internos: APENAS para cockpit_assisted (admin autenticado)
  // Não vazar affiliate_id, coupon_type ou redemption_id
  // pra requests anônimos.
  const adminFields = channel === 'cockpit_assisted' ? {
    affiliate_id:  coupon.affiliate_id ?? null,
    coupon_type:   coupon.coupon_type,
    redemption_id: (redemption as { id: string } | null)?.id ?? null,
  } : {}

  return json({ ...baseResponse, ...adminFields }, 200, origin)
})
