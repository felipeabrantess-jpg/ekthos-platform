// ============================================================
// Edge Function: admin-coupon-deactivate
// Deleta cupom no Stripe e arquiva localmente
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
  if (!coupon.active) return json({ error: 'Cupom já está arquivado' }, 400)

  const stripeHeaders = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': '2024-06-20',
  }

  // ── Desativa PromotionCode no Stripe (se existir) ────────────
  if (coupon.stripe_promo_code_id) {
    await fetch(`https://api.stripe.com/v1/promotion_codes/${coupon.stripe_promo_code_id}`, {
      method: 'POST',
      headers: stripeHeaders,
      body: 'active=false',
    }).catch(() => { /* não bloqueia se falhar */ })
  }

  // ── Deleta Coupon no Stripe ───────────────────────────────────
  // Stripe só aceita DELETE — cupons já usados continuam válidos nas subs existentes
  const stripeRes = await fetch(`https://api.stripe.com/v1/coupons/${coupon_id}`, {
    method: 'DELETE',
    headers: stripeHeaders,
  })
  const stripeData = await stripeRes.json()

  // 404 do Stripe = já deletado, trata como sucesso
  const stripeOk = stripeData.deleted === true || stripeRes.status === 404
  if (!stripeOk && stripeData.error) {
    return json({ error: 'Erro Stripe: ' + stripeData.error.message }, 400)
  }

  // ── Arquiva localmente ─────────────────────────────────────
  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('stripe_coupons')
    .update({ active: false, archived_at: now, last_synced_at: now })
    .eq('id', coupon_id)

  if (updateErr) return json({ error: updateErr.message }, 500)

  // ── Audit event ────────────────────────────────────────────
  await supabase.rpc('record_audit_event', {
    p_church_id:                null,
    p_admin_user_id:            user.id,
    p_action:                   'coupon.deactivated',
    p_before:                   { active: true },
    p_after:                    { active: false, archived_at: now },
    p_reason:                   'Cupom arquivado via cockpit admin',
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'coupon',
    p_resource_id:              null, // coupon_id é text não uuid — incluído em p_after
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: null,
    p_impersonated_church_id:   null,
    p_source:                   'cockpit',
    p_request_id:               req.headers.get('x-request-id') ?? null,
  })

  return json({ success: true, coupon_id, deleted_from_stripe: stripeOk, archived_at: now })
})
