// ============================================================
// Edge Function: affiliate-commissions-export-csv
// POST — exports approved commissions for a given month as CSV.
// Creates a payment batch record and links commissions to it.
// Returns JSON { csv: string, batch_id, total_amount_cents, rows }.
// verify_jwt: false — validates manually (admin only)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

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

function centsToBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
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
  let body: { reference_month: string } // format: 'YYYY-MM'
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  if (!body.reference_month || !/^\d{4}-\d{2}$/.test(body.reference_month)) {
    return json({ error: 'reference_month inválido (formato: YYYY-MM)' }, 400)
  }

  // ── Fetch approved unpaid commissions ────────────────────
  const { data: commissions, error: fetchErr } = await supabase
    .from('affiliate_commissions')
    .select(`
      id,
      amount_cents,
      reference_month,
      affiliates (
        id,
        name,
        email,
        pix_key_type,
        pix_key
      )
    `)
    .eq('status', 'approved')
    .eq('reference_month', body.reference_month)
    .is('paid_batch_id', null)

  if (fetchErr) {
    console.error('[affiliate-commissions-export-csv] fetch error:', fetchErr)
    return json({ error: 'Erro ao buscar comissões' }, 500)
  }

  if (!commissions || commissions.length === 0) {
    return json({ error: 'Nenhuma comissão aprovada para exportar neste mês' }, 404)
  }

  // ── Aggregate by affiliate ───────────────────────────────
  const byAffiliate = new Map<string, {
    affiliate: { id: string; name: string; email: string; pix_key_type: string | null; pix_key: string | null }
    totalCents: number
    commissionIds: string[]
  }>()

  for (const c of commissions) {
    const aff = c.affiliates as { id: string; name: string; email: string; pix_key_type: string | null; pix_key: string | null }
    if (!aff) continue
    const existing = byAffiliate.get(aff.id)
    if (existing) {
      existing.totalCents += c.amount_cents
      existing.commissionIds.push(c.id)
    } else {
      byAffiliate.set(aff.id, {
        affiliate: aff,
        totalCents: c.amount_cents,
        commissionIds: [c.id],
      })
    }
  }

  const rows = Array.from(byAffiliate.values())
  const totalAmountCents = rows.reduce((sum, r) => sum + r.totalCents, 0)

  // ── Create batch ─────────────────────────────────────────
  const { data: batch, error: batchErr } = await supabase
    .from('affiliate_payment_batches')
    .insert({
      reference_month:    body.reference_month,
      total_amount_cents: totalAmountCents,
      row_count:          rows.length,
      created_by:         user.id,
    })
    .select('id')
    .single()

  if (batchErr || !batch) {
    console.error('[affiliate-commissions-export-csv] batch insert error:', batchErr)
    return json({ error: 'Erro ao criar lote de pagamento' }, 500)
  }

  // ── Link commissions to batch ────────────────────────────
  const allIds = rows.flatMap(r => r.commissionIds)
  const { error: updateErr } = await supabase
    .from('affiliate_commissions')
    .update({ paid_batch_id: batch.id })
    .in('id', allIds)

  if (updateErr) {
    console.error('[affiliate-commissions-export-csv] link error:', updateErr)
    return json({ error: 'Erro ao vincular comissões ao lote' }, 500)
  }

  // ── Build CSV ─────────────────────────────────────────────
  const header = 'nome,email,tipo_chave_pix,chave_pix,valor_centavos,valor_brl,descricao,mes_referencia'
  const lines = rows.map(r => {
    const { affiliate: a, totalCents } = r
    const descricao = `Comissão afiliado ${body.reference_month}`
    return [
      `"${(a.name ?? '').replace(/"/g, '""')}"`,
      `"${(a.email ?? '').replace(/"/g, '""')}"`,
      `"${(a.pix_key_type ?? '').replace(/"/g, '""')}"`,
      `"${(a.pix_key ?? '').replace(/"/g, '""')}"`,
      totalCents,
      centsToBRL(totalCents),
      `"${descricao}"`,
      body.reference_month,
    ].join(',')
  })
  const csv = [header, ...lines].join('\n')

  await supabase.from('admin_events').insert({
    admin_user_id: user.id,
    action:        'affiliate_csv_exported',
    after:         { batch_id: batch.id, reference_month: body.reference_month, total_amount_cents: totalAmountCents, rows: rows.length },
  })

  return json({
    csv,
    batch_id:           batch.id,
    total_amount_cents: totalAmountCents,
    rows:               rows.length,
  })
})
