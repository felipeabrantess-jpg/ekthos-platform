// ============================================================
// Edge Function: admin-churches-list
// Retorna lista paginada de igrejas com métricas consolidadas.
//
// GET /admin-churches-list?page=1&limit=50&status=all&plan=all&q=
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN           = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

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

  // Auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // Query params
  const url    = new URL(req.url)
  const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'))
  const limit  = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))
  const status = url.searchParams.get('status') ?? 'all'
  const plan   = url.searchParams.get('plan')   ?? 'all'
  const q      = (url.searchParams.get('q') ?? '').trim()
  const from   = (page - 1) * limit
  const to     = from + limit - 1

  // Query: usa view consolidada
  let query = supabase
    .from('admin_churches_overview')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status !== 'all') query = query.eq('status', status)
  if (plan   !== 'all') query = query.eq('plan_slug', plan)
  if (q) {
    query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[admin-churches-list]', error)
    return json({ error: error.message }, 500)
  }

  return json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  })
})
