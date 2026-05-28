// ============================================================
// Edge Function: admin-coupon-create
// Cria coupon + promotion code no Stripe LIVE e persiste em stripe_coupons
// Acesso: APENAS ekthos_admin
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function rand6(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

const STRIPE_HEADERS = {
  Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Stripe-Version': '2024-06-20',
}

async function stripeRequest(method: string, path: string, params?: Record<string, string>) {
  const options: RequestInit = {
    method,
    headers: STRIPE_HEADERS,
  }
  if (params) {
    options.body = new URLSearchParams(params).toString()
  }
  const res = await fetch(`https://api.stripe.com${path}`, options)
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  // ── Guarda: Stripe LIVE obrigatório ──────────────────────────
  if (!STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    return json({ error: 'Stripe key não está em modo LIVE. Configure STRIPE_SECRET_KEY com sk_live_.' }, 500)
  }

  // ── Auth: valida JWT e confirma ekthos_admin ──────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin = user.app_metadata?.is_ekthos_admin === true ||
    (Array.isArray(user.app_metadata?.ekthos_roles) &&
      user.app_metadata.ekthos_roles.includes('ekthos_admin'))
  if (!isAdmin) return json({ error: 'Forbidden — ekthos_admin only' }, 403)

  // ── Parse body ─────────────────────────────────────────────
  let body: {
    name?: string
    code?: string
    discount_type?: string
    amount_off?: number
    percent_off?: number
    currency?: string
    duration?: string
    max_redemptions?: number | null
    redeem_by?: string | null
    applies_to_products?: string[]
    metadata?: Record<string, string>
  }
  try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

  const {
    name,
    code,
    discount_type = 'amount_off',
    amount_off,
    percent_off,
    currency = 'brl',
    duration,
    max_redemptions,
    redeem_by,
    applies_to_products,
    metadata = {},
  } = body

  // Validações
  if (!name?.trim()) return json({ error: 'name é obrigatório' }, 400)
  if (!['amount_off', 'percent_off'].includes(discount_type))
    return json({ error: 'discount_type deve ser amount_off ou percent_off' }, 400)
  if (discount_type === 'amount_off' && !amount_off)
    return json({ error: 'amount_off é obrigatório quando discount_type=amount_off' }, 400)
  if (discount_type === 'percent_off' && !percent_off)
    return json({ error: 'percent_off é obrigatório quando discount_type=percent_off' }, 400)
  if (!['once', 'forever'].includes(duration ?? ''))
    return json({ error: 'duration deve ser once ou forever' }, 400)

  // Gera código se não fornecido
  const couponId = code?.trim().toUpperCase() ||
    `EKTHOS_${Date.now().toString(36).toUpperCase()}_${rand6()}`

  // ── 1. Cria Coupon no Stripe ─────────────────────────────────
  const stripeParams: Record<string, string> = {
    id: couponId,
    currency,
    duration: duration!,
    'metadata[created_by_ef]': 'admin-coupon-create',
    'metadata[admin_id]': user.id,
  }
  if (discount_type === 'amount_off') stripeParams.amount_off = String(amount_off)
  if (discount_type === 'percent_off') stripeParams.percent_off = String(percent_off)
  if (max_redemptions != null) stripeParams.max_redemptions = String(max_redemptions)
  if (redeem_by) stripeParams.redeem_by = String(Math.floor(new Date(redeem_by).getTime() / 1000))
  if (applies_to_products?.length) {
    applies_to_products.forEach((p, i) => {
      stripeParams[`applies_to[products][${i}]`] = p
    })
  }
  Object.entries(metadata).forEach(([k, v]) => {
    stripeParams[`metadata[${k}]`] = v
  })

  const couponRes = await stripeRequest('POST', '/v1/coupons', stripeParams)
  if (!couponRes.ok || couponRes.data.error) {
    return json({
      error: 'stripe_coupon_failed',
      stripe_error: couponRes.data.error?.message ?? `HTTP ${couponRes.status}`,
    }, 400)
  }
  const stripeCoupon = couponRes.data

  // ── 2. Cria PromotionCode no Stripe (mesmo código para prefilled_promo_code) ──
  const promoRes = await stripeRequest('POST', '/v1/promotion_codes', {
    coupon: couponId,
    code: couponId,
    'metadata[admin_id]': user.id,
    'metadata[created_by_ef]': 'admin-coupon-create',
  })

  let stripePromoCodeId: string | null = null
  let stripePromoCode: string | null = null

  if (promoRes.ok && !promoRes.data.error) {
    stripePromoCodeId = promoRes.data.id   // promo_XXXX
    stripePromoCode   = promoRes.data.code // "AMIGO_PILOTO_R1" — o que o cliente digita
  } else {
    // PromotionCode falhou — não bloqueia, mas loga
    console.warn('[admin-coupon-create] promo code creation failed:', promoRes.data.error?.message)
  }

  // ── 3. Persiste em stripe_coupons ─────────────────────────────────────────
  const { error: insertErr } = await supabase.from('stripe_coupons').insert({
    id: stripeCoupon.id,
    name: name.trim(),
    discount_type,
    amount_off: discount_type === 'amount_off' ? amount_off : null,
    percent_off: discount_type === 'percent_off' ? percent_off : null,
    currency,
    duration: duration!,
    max_redemptions: max_redemptions ?? null,
    times_redeemed: 0,
    redeem_by: redeem_by ?? null,
    applies_to_products: applies_to_products ?? null,
    metadata,
    active: true,
    livemode: stripeCoupon.livemode,
    created_by: user.id,
    last_synced_at: new Date().toISOString(),
    stripe_promo_code_id: stripePromoCodeId,
    promo_code: stripePromoCode,
  } as any)

  if (insertErr) {
    // Rollback: deleta coupon e promo code no Stripe para evitar drift
    console.error('[admin-coupon-create] insert error, rolling back Stripe:', insertErr.message)
    await stripeRequest('DELETE', `/v1/coupons/${couponId}`)
    if (stripePromoCodeId) {
      // PromotionCodes não têm DELETE direto — desativar via update
      await stripeRequest('POST', `/v1/promotion_codes/${stripePromoCodeId}`, { active: 'false' })
    }
    return json({
      error: 'db_insert_failed',
      detail: 'Cupom criado no Stripe mas falhou ao persistir. Rollback executado.',
    }, 500)
  }

  // ── 4. Audit event ────────────────────────────────────────────
  await supabase.rpc('record_audit_event', {
    p_church_id:                null,
    p_admin_user_id:            user.id,
    p_action:                   'coupon.created',
    p_before:                   null,
    p_after: {
      coupon_id:            stripeCoupon.id,
      name:                 name.trim(),
      discount_type,
      amount_off:           amount_off ?? null,
      percent_off:          percent_off ?? null,
      duration,
      max_redemptions:      max_redemptions ?? null,
      livemode:             stripeCoupon.livemode,
      stripe_promo_code_id: stripePromoCodeId,
      promo_code:           stripePromoCode,
    },
    p_reason:                   'Cupom criado via cockpit admin',
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'coupon',
    p_resource_id:              null,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: null,
    p_impersonated_church_id:   null,
    p_source:                   'cockpit',
    p_request_id:               req.headers.get('x-request-id') ?? null,
  })

  // Usa promo code se criado, senão cai de volta no coupon ID
  const codeForLink = stripePromoCode ?? couponId

  return json({
    coupon_id:            stripeCoupon.id,
    code:                 stripeCoupon.id,
    promo_code:           stripePromoCode,
    stripe_promo_code_id: stripePromoCodeId,
    livemode:             stripeCoupon.livemode,
    valid:                stripeCoupon.valid,
    payment_link_chamado:    `https://buy.stripe.com/7sY9AT69n4Gw7EZ4AT5os00?prefilled_promo_code=${codeForLink}`,
    payment_link_acolhimento: `https://buy.stripe.com/cNibJ1fJX5KA1gB6J15os01?prefilled_promo_code=${codeForLink}`,
  }, 201)
})
