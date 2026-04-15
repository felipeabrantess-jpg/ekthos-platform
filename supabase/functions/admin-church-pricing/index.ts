// ============================================================
// Edge Function: admin-church-pricing
// Atualiza precificação customizada de uma assinatura.
// Todos os campos são opcionais — envia só o que quiser alterar.
// Sempre registra em admin_events.
//
// PATCH /admin-church-pricing
// Body: { church_id, custom_plan_price_cents?, custom_user_price_cents?,
//         custom_agent_price_cents?, price_notes? }
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface PricingBody {
  church_id:                string
  custom_plan_price_cents?:  number | null
  custom_user_price_cents?:  number | null
  custom_agent_price_cents?: number | null
  price_notes?:              string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'PATCH')  return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: PricingBody
  try {
    body = await req.json() as PricingBody
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const { church_id } = body
  if (!church_id) return json({ error: 'church_id é obrigatório' }, 400)

  // ── Busca assinatura atual (para registrar o "before") ────
  const { data: currentSub, error: fetchErr } = await supabase
    .from('subscriptions')
    .select('id, custom_plan_price_cents, custom_user_price_cents, custom_agent_price_cents, price_notes')
    .eq('church_id', church_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchErr || !currentSub) {
    return json({ error: 'Assinatura não encontrada para esta igreja' }, 404)
  }

  // ── Monta patch apenas com campos fornecidos ──────────────
  const patch: Record<string, unknown> = {}
  if ('custom_plan_price_cents'  in body) patch.custom_plan_price_cents  = body.custom_plan_price_cents  ?? null
  if ('custom_user_price_cents'  in body) patch.custom_user_price_cents  = body.custom_user_price_cents  ?? null
  if ('custom_agent_price_cents' in body) patch.custom_agent_price_cents = body.custom_agent_price_cents ?? null
  if ('price_notes'              in body) patch.price_notes              = body.price_notes              ?? null

  if (Object.keys(patch).length === 0) {
    return json({ error: 'Nenhum campo fornecido para atualizar' }, 400)
  }

  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('id', currentSub.id)

  if (updateErr) {
    console.error('[admin-church-pricing] update:', updateErr)
    return json({ error: 'Erro ao atualizar precificação' }, 500)
  }

  // ── Registra em admin_events ──────────────────────────────
  await supabase.from('admin_events').insert({
    church_id,
    admin_user_id: user.id,
    action:        'pricing_updated',
    before: {
      custom_plan_price_cents:  currentSub.custom_plan_price_cents,
      custom_user_price_cents:  currentSub.custom_user_price_cents,
      custom_agent_price_cents: currentSub.custom_agent_price_cents,
      price_notes:              currentSub.price_notes,
    },
    after:  patch,
  })

  return json({ ok: true, updated: patch })
})
