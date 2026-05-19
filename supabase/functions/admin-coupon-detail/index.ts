// ============================================================
// Edge Function: admin-coupon-detail
// Detalhes de um cupom + igrejas que usaram
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

  let body: { coupon_id?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

  const { coupon_id } = body
  if (!coupon_id?.trim()) return json({ error: 'coupon_id é obrigatório' }, 400)

  // ── Busca cupom local ───────────────────────────────────────
  const { data: coupon, error: fetchErr } = await supabase
    .from('stripe_coupons')
    .select('*')
    .eq('id', coupon_id)
    .maybeSingle()

  if (fetchErr) return json({ error: fetchErr.message }, 500)
  if (!coupon) return json({ error: 'Cupom não encontrado' }, 404)

  // ── Sync com Stripe ─────────────────────────────────────────
  let stripeLive: Record<string, unknown> = {}
  try {
    const res = await fetch(`https://api.stripe.com/v1/coupons/${coupon_id}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    })
    stripeLive = await res.json()
    if (!stripeLive.error && typeof stripeLive.times_redeemed === 'number') {
      await supabase.from('stripe_coupons')
        .update({ times_redeemed: stripeLive.times_redeemed as number, last_synced_at: new Date().toISOString() })
        .eq('id', coupon_id)
      coupon.times_redeemed = stripeLive.times_redeemed as number
    }
  } catch (_) { /* sync falhou — não bloqueia */ }

  // ── Busca igrejas que usaram (via subscriptions.metadata) ──
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('church_id, plan_slug, created_at, churches(name, city, state)')
    .contains('metadata', { coupon: coupon_id })
    .limit(50)

  // Fallback: busca via discount_coupon_id se existir
  const { data: subsByDiscount } = await supabase
    .from('subscriptions')
    .select('church_id, plan_slug, created_at, churches(name, city, state)')
    .eq('discount_coupon_id' as any, coupon_id)
    .limit(50)

  const usedBy = [
    ...(subscriptions ?? []),
    ...(subsByDiscount ?? []),
  ].filter((v, i, arr) => arr.findIndex(x => x.church_id === v.church_id) === i)

  // ── Audit history ──────────────────────────────────────────
  const { data: auditEvents } = await supabase
    .from('admin_events')
    .select('action, created_at, actor_email, after')
    .eq('resource', 'coupon')
    .eq('resource_id', coupon_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return json({
    coupon: {
      ...coupon,
      stripe_live: stripeLive.error ? null : {
        times_redeemed: stripeLive.times_redeemed,
        valid: stripeLive.valid,
        deleted: !!(stripeLive as any).deleted,
      },
    },
    used_by: usedBy.map((s: any) => ({
      church_id: s.church_id,
      church_name: s.churches?.name ?? '—',
      city: s.churches?.city ?? null,
      state: s.churches?.state ?? null,
      plan_slug: s.plan_slug,
      subscribed_at: s.created_at,
    })),
    audit_events: auditEvents ?? [],
    payment_link_with_coupon: `https://buy.stripe.com/7sY9AT69n4Gw7EZ4AT5os00?prefilled_promo_code=${coupon_id}`,
  })
})
