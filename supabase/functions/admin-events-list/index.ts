// ============================================================
// Edge Function: admin-events-list
// Lista eventos admin de uma igreja específica.
//
// GET /admin-events-list?church_id=<uuid>&limit=50&action=
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET')    return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Params ─────────────────────────────────────────────────
  const url      = new URL(req.url)
  const churchId = url.searchParams.get('church_id')
  const action   = url.searchParams.get('action') ?? null
  const limit    = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50'))

  if (!churchId) return json({ error: 'church_id é obrigatório' }, 400)

  let query = supabase
    .from('admin_events')
    .select('*')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) query = query.eq('action', action)

  const { data, error } = await query

  if (error) {
    console.error('[admin-events-list]', error)
    return json({ error: error.message }, 500)
  }

  return json({ data: data ?? [], total: data?.length ?? 0 })
})
