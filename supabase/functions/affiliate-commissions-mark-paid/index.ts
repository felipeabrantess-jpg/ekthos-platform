// ============================================================
// Edge Function: affiliate-commissions-mark-paid
// POST — marks a payment batch as paid and updates commissions.
// verify_jwt: false — validates manually (admin only)
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: { batch_id: string; comprovante_url?: string | null }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  if (!body.batch_id) return json({ error: 'batch_id é obrigatório' }, 400)

  const paidAt = new Date().toISOString()

  // Update batch
  const { error: batchErr } = await supabase
    .from('affiliate_payment_batches')
    .update({
      paid_at:         paidAt,
      paid_by:         user.id,
      comprovante_url: body.comprovante_url ?? null,
    })
    .eq('id', body.batch_id)

  if (batchErr) {
    console.error('[affiliate-commissions-mark-paid] batch update error:', batchErr)
    return json({ error: 'Erro ao atualizar lote' }, 500)
  }

  // Update all commissions in batch to 'paid'
  const { data: updated, error: commsErr } = await supabase
    .from('affiliate_commissions')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('paid_batch_id', body.batch_id)
    .select('id')

  if (commsErr) {
    console.error('[affiliate-commissions-mark-paid] commissions update error:', commsErr)
    return json({ error: 'Erro ao marcar comissões como pagas' }, 500)
  }

  const count = updated?.length ?? 0

  await supabase.from('admin_events').insert({
    admin_user_id: user.id,
    action:        'affiliate_batch_marked_paid',
    after:         { batch_id: body.batch_id, paid_at: paidAt, commissions_count: count },
  })

  return json({ ok: true, commissions_paid: count })
})
