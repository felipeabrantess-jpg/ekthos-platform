// ============================================================
// Edge Function: affiliate-coupon-create
// POST — creates a coupon for an affiliate.
// Creates Stripe Coupon + PromotionCode for percent_first/percent_recurring.
// For trial_days: stored in DB only (stripe_coupon_id = null).
// verify_jwt: false — validates manually (admin only)
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// Auth client - JWT validation only (prevents RLS contamination of DB client)
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method Not Allowed' }, 405)

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: {
    affiliate_id:               string
    code:                       string
    discount_kind:              'percent_first' | 'percent_recurring' | 'trial_days'
    discount_value:             number
    commission_kind:            'percent_first' | 'percent_recurring' | 'fixed_per_sale'
    commission_value:           number
    commission_duration_months?: number | null
    max_redemptions?:           number | null
    expires_at?:                string | null
  }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  const {
    affiliate_id, code, discount_kind, discount_value,
    commission_kind, commission_value, commission_duration_months,
    max_redemptions, expires_at,
  } = body

  if (!affiliate_id || !code || !discount_kind || discount_value == null || !commission_kind || commission_value == null) {
    return json({ error: 'Campos obrigatórios ausentes' }, 400)
  }

  // Check code uniqueness
  const { data: existing } = await supabase
    .from('affiliate_coupons')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (existing) return json({ error: `Código "${code}" já existe` }, 409)

  // ── Stripe: skip for trial_days ───────────────────────────
  let stripeCouponId:        string | null = null
  let stripePromotionCodeId: string | null = null

  if (discount_kind !== 'trial_days') {
    try {
      // Determine Stripe coupon duration
      let duration: 'once' | 'repeating' | 'forever' = 'once'
      let durationInMonths: number | undefined

      if (discount_kind === 'percent_first') {
        duration = 'once'
      } else {
        // percent_recurring
        if (commission_duration_months && commission_duration_months > 0) {
          duration = 'repeating'
          durationInMonths = commission_duration_months
        } else {
          duration = 'forever'
        }
      }

      const coupon = await stripe.coupons.create({
        percent_off:         discount_value,
        duration,
        ...(durationInMonths ? { duration_in_months: durationInMonths } : {}),
        ...(max_redemptions  ? { max_redemptions }                       : {}),
        ...(expires_at       ? { redeem_by: Math.floor(new Date(expires_at).getTime() / 1000) } : {}),
        metadata: { affiliate_id, code: code.toUpperCase(), kind: 'affiliate' },
      })
      stripeCouponId = coupon.id

      const promoCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code:   code.toUpperCase(),
        ...(max_redemptions ? { max_redemptions } : {}),
        ...(expires_at      ? { expires_at: Math.floor(new Date(expires_at).getTime() / 1000) } : {}),
        metadata: { affiliate_id, kind: 'affiliate' },
      })
      stripePromotionCodeId = promoCode.id
    } catch (stripeErr) {
      console.error('[affiliate-coupon-create] stripe error:', (stripeErr as Error).message)
      return json({ error: 'Falha ao criar cupom no Stripe' }, 500)
    }
  }

  // ── Insert coupon in DB ───────────────────────────────────
  const { data: couponRow, error: insertErr } = await supabase
    .from('affiliate_coupons')
    .insert({
      affiliate_id,
      code:                       code.toUpperCase(),
      discount_kind,
      discount_value,
      commission_kind,
      commission_value,
      commission_duration_months: commission_duration_months ?? null,
      max_redemptions:            max_redemptions ?? null,
      expires_at:                 expires_at ?? null,
      stripe_coupon_id:           stripeCouponId,
      stripe_promotion_code_id:   stripePromotionCodeId,
      active:                     true,
      created_by:                 user.id,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[affiliate-coupon-create] insert error:', insertErr)
    return json({ error: 'Erro ao salvar cupom' }, 500)
  }

  await supabase.from('admin_events').insert({
    admin_user_id: user.id,
    action:        'affiliate_coupon_created',
    after:         { id: couponRow.id, affiliate_id, code: code.toUpperCase(), discount_kind },
  })

  return json({ coupon: couponRow }, 201)
})
