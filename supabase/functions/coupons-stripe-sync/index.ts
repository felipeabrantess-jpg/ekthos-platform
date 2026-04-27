// ============================================================
// F4: coupons-stripe-sync
// POST — mirror Stripe para public.coupons (F3).
//
// Substitui mirror das EFs legadas affiliate-coupon-create e
// affiliate-coupon-toggle (decommission Opção 1, Felipe 27/04/2026).
//
// Operações suportadas:
//   create     — cria Stripe Coupon + PromotionCode, popula stripe_*_id
//   deactivate — desativa PromotionCode no Stripe
//   update     — sincroniza active status do PromotionCode
//
// Chamado pelo worker/cockpit passando { coupon_id, operation, job_id }.
// job_id é opcional: se presente, atualiza status em coupon_sync_jobs.
//
// verify_jwt: false — valida admin manualmente via JWT.
// ============================================================

import Stripe from 'npm:stripe'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// Auth client separado — previne contaminação de RLS no client de dados
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── Auth: admin only ──────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  // ── Parse body ────────────────────────────────────────────
  let body: { coupon_id?: string; operation?: string; job_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400, origin)
  }

  const { coupon_id, operation, job_id } = body

  if (!coupon_id || !operation) {
    return json({ error: 'coupon_id e operation são obrigatórios' }, 400, origin)
  }

  if (!['create', 'update', 'deactivate'].includes(operation)) {
    return json({ error: `Operação desconhecida: ${operation}` }, 400, origin)
  }

  // ── Marcar job como in_progress ───────────────────────────
  if (job_id) {
    await supabase
      .from('coupon_sync_jobs')
      .update({
        status:           'in_progress',
        last_attempt_at:  new Date().toISOString(),
      })
      .eq('id', job_id)
  }

  try {
    // ── Buscar cupom ──────────────────────────────────────
    const { data: coupon, error: fetchErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', coupon_id)
      .single()

    if (fetchErr || !coupon) {
      throw new Error(`Cupom não encontrado: ${coupon_id}`)
    }

    let result: Record<string, string> | null = null

    // ── Operação: create ──────────────────────────────────
    if (operation === 'create') {
      // 1. Criar Stripe Coupon
      const stripeCoupon = await stripe.coupons.create({
        name: coupon.code,
        ...(coupon.discount_type === 'percent_off'
          ? { percent_off: coupon.discount_value }
          : { amount_off: coupon.discount_value, currency: 'brl' }),
        duration: coupon.duration as 'once' | 'forever' | 'repeating',
        ...(coupon.duration === 'repeating' && coupon.duration_in_months
          ? { duration_in_months: coupon.duration_in_months }
          : {}),
        ...(coupon.max_redemptions
          ? { max_redemptions: coupon.max_redemptions }
          : {}),
        ...(coupon.valid_until
          ? { redeem_by: Math.floor(new Date(coupon.valid_until).getTime() / 1000) }
          : {}),
        metadata: {
          ekthos_coupon_id:   String(coupon.id),
          ekthos_coupon_type: String(coupon.coupon_type),
          ekthos_affiliate_id: coupon.affiliate_id ? String(coupon.affiliate_id) : '',
        },
      })

      // 2. Criar Stripe PromotionCode (código legível pelo cliente)
      const promoCode = await stripe.promotionCodes.create({
        coupon:          stripeCoupon.id,
        code:            coupon.code,
        active:          coupon.active,
        ...(coupon.max_redemptions
          ? { max_redemptions: coupon.max_redemptions }
          : {}),
        ...(coupon.valid_until
          ? { expires_at: Math.floor(new Date(coupon.valid_until).getTime() / 1000) }
          : {}),
        metadata: {
          ekthos_coupon_id: String(coupon.id),
        },
      })

      // 3. Persistir IDs Stripe de volta em public.coupons
      await supabase
        .from('coupons')
        .update({
          stripe_coupon_id:         stripeCoupon.id,
          stripe_promotion_code_id: promoCode.id,
          stripe_synced_at:         new Date().toISOString(),
        })
        .eq('id', coupon_id)

      result = {
        stripe_coupon_id:         stripeCoupon.id,
        stripe_promotion_code_id: promoCode.id,
      }
    }

    // ── Operação: deactivate ──────────────────────────────
    else if (operation === 'deactivate') {
      if (!coupon.stripe_promotion_code_id) {
        throw new Error(
          `Cupom ${coupon_id} sem stripe_promotion_code_id — não é possível desativar no Stripe`
        )
      }
      await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, {
        active: false,
      })
      await supabase
        .from('coupons')
        .update({ stripe_synced_at: new Date().toISOString() })
        .eq('id', coupon_id)

      result = { deactivated: coupon.stripe_promotion_code_id }
    }

    // ── Operação: update ──────────────────────────────────
    else if (operation === 'update') {
      if (!coupon.stripe_promotion_code_id) {
        throw new Error(
          `Cupom ${coupon_id} sem stripe_promotion_code_id — não é possível atualizar no Stripe`
        )
      }
      await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, {
        active: coupon.active,
      })
      await supabase
        .from('coupons')
        .update({ stripe_synced_at: new Date().toISOString() })
        .eq('id', coupon_id)

      result = { updated: coupon.stripe_promotion_code_id }
    }

    // ── Sucesso: atualizar job ────────────────────────────
    if (job_id) {
      await supabase
        .from('coupon_sync_jobs')
        .update({
          status:          'success',
          stripe_response: result,
          completed_at:    new Date().toISOString(),
        })
        .eq('id', job_id)
    }

    return json({ ok: true, result }, 200, origin)

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[coupons-stripe-sync] error:', errorMsg)

    // ── Falha: atualizar job com retry exponencial ────────
    if (job_id) {
      const { data: job } = await supabase
        .from('coupon_sync_jobs')
        .select('attempts, max_attempts')
        .eq('id', job_id)
        .single()

      const newAttempts = (job?.attempts ?? 0) + 1
      const maxAttempts = job?.max_attempts ?? 5
      const exhausted   = newAttempts >= maxAttempts
      // Backoff exponencial: 2^attempts minutos (2m, 4m, 8m, 16m, …)
      const nextRetry   = exhausted
        ? null
        : new Date(Date.now() + Math.pow(2, newAttempts) * 60_000).toISOString()

      await supabase
        .from('coupon_sync_jobs')
        .update({
          status:       exhausted ? 'abandoned' : 'failed',
          attempts:     newAttempts,
          last_error:   errorMsg,
          next_retry_at: nextRetry,
        })
        .eq('id', job_id)
    }

    return json({ ok: false, error: errorMsg }, 500, origin)
  }
})
