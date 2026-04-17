// ============================================================
// Edge Function: affiliate-commissions-approve
// POST — approves pending commissions past their approves_at date.
// Updates status='approved' for all pending commissions where approves_at <= now().
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

  const now = new Date().toISOString()

  // Approve pending commissions that have passed the chargeback gate
  const { data, error } = await supabase
    .from('affiliate_commissions')
    .update({
      status:      'approved',
      approved_at: now,
    })
    .eq('status', 'pending')
    .lte('approves_at', now)
    .select('id')

  if (error) {
    console.error('[affiliate-commissions-approve] update error:', error)
    return json({ error: 'Erro ao aprovar comissões' }, 500)
  }

  const count = data?.length ?? 0

  if (count > 0) {
    await supabase.from('admin_events').insert({
      admin_user_id: user.id,
      action:        'affiliate_commissions_approved',
      after:         { count, approved_at: now },
    })
  }

  return json({ approved: count })
})
