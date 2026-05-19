// ============================================================
// Edge Function: admin-coupons-list
// Lista cupons com sync de times_redeemed do Stripe
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

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  })
  return res.json()
}

function formatDiscount(row: Record<string, unknown>): string {
  if (row.discount_type === 'amount_off' && row.amount_off) {
    return `R$ ${(Number(row.amount_off) / 100).toFixed(2).replace('.', ',')} off`
  }
  if (row.discount_type === 'percent_off' && row.percent_off) {
    return `${row.percent_off}% off`
  }
  return '—'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin = user.app_metadata?.is_ekthos_admin === true ||
    (Array.isArray(user.app_metadata?.ekthos_roles) &&
      user.app_metadata.ekthos_roles.includes('ekthos_admin'))
  if (!isAdmin) return json({ error: 'Forbidden — ekthos_admin only' }, 403)

  let body: { include_archived?: boolean; limit?: number; offset?: number } = {}
  try { body = await req.json() } catch { /* default */ }

  const { include_archived = false, limit = 50, offset = 0 } = body

  // ── Busca no banco ──────────────────────────────────────────
  let query = supabase
    .from('stripe_coupons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1)

  if (!include_archived) {
    query = query.eq('active', true)
  }

  const { data: coupons, error: dbErr } = await query
  if (dbErr) return json({ error: dbErr.message }, 500)

  // ── Sync times_redeemed do Stripe em paralelo ───────────────
  const syncedCoupons = await Promise.all(
    (coupons ?? []).map(async (coupon) => {
      try {
        const stripe = await stripeGet(`/v1/coupons/${coupon.id}`)
        if (!stripe.error && typeof stripe.times_redeemed === 'number') {
          // Atualiza se mudou
          if (stripe.times_redeemed !== coupon.times_redeemed) {
            await supabase
              .from('stripe_coupons')
              .update({ times_redeemed: stripe.times_redeemed, last_synced_at: new Date().toISOString() })
              .eq('id', coupon.id)
            coupon.times_redeemed = stripe.times_redeemed
          }
        }
      } catch (_) { /* ignora erros de sync — não bloqueia listagem */ }

      return {
        id: coupon.id,
        name: coupon.name,
        discount_display: formatDiscount(coupon),
        discount_type: coupon.discount_type,
        amount_off: coupon.amount_off,
        percent_off: coupon.percent_off,
        duration: coupon.duration,
        redemptions_used: coupon.times_redeemed ?? 0,
        redemptions_max: coupon.max_redemptions ?? null,
        valid_until: coupon.redeem_by ?? null,
        applies_to: coupon.applies_to_products ?? null,
        active: coupon.active,
        archived_at: coupon.archived_at ?? null,
        livemode: coupon.livemode,
        created_at: coupon.created_at,
        last_synced_at: coupon.last_synced_at,
      }
    })
  )

  return json({ coupons: syncedCoupons, total: syncedCoupons.length })
})
