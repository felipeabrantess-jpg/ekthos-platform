// ============================================================
// Edge Function: affiliate-coupon-toggle
// POST — toggles active status of an affiliate coupon.
// If deactivating and has stripe_promotion_code_id: deactivates on Stripe too.
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
  let body: { coupon_id: string; active: boolean }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  const { coupon_id, active } = body
  if (!coupon_id || active === undefined) {
    return json({ error: 'coupon_id e active são obrigatórios' }, 400)
  }

  // Fetch current coupon
  const { data: coupon, error: fetchErr } = await supabase
    .from('affiliate_coupons')
    .select('id, stripe_promotion_code_id, active')
    .eq('id', coupon_id)
    .maybeSingle()

  if (fetchErr || !coupon) return json({ error: 'Cupom não encontrado' }, 404)

  // If deactivating and has a Stripe promotion code, deactivate it on Stripe
  if (!active && coupon.stripe_promotion_code_id) {
    try {
      await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, { active: false })
    } catch (stripeErr) {
      console.error('[affiliate-coupon-toggle] stripe deactivate error:', (stripeErr as Error).message)
      return json({ error: 'Falha ao desativar cupom no Stripe' }, 500)
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('affiliate_coupons')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', coupon_id)
    .select()
    .single()

  if (updateErr) {
    console.error('[affiliate-coupon-toggle] update error:', updateErr)
    return json({ error: 'Erro ao atualizar cupom' }, 500)
  }

  await supabase.from('admin_events').insert({
    admin_user_id: user.id,
    action:        active ? 'affiliate_coupon_activated' : 'affiliate_coupon_deactivated',
    after:         { id: coupon_id, active },
  })

  return json({ coupon: updated })
})
