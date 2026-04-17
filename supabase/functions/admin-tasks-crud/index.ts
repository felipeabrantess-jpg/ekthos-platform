// ============================================================
// Edge Function: admin-tasks-crud
// CRUD de tarefas internas do time Ekthos.
//
// GET    /admin-tasks-crud?status=open&church_id=   → lista
// POST   /admin-tasks-crud    body: { title, church_id?, priority?, due_date?, description? }
// PATCH  /admin-tasks-crud    body: { id, status?, title?, priority?, due_date?, description?, assigned_to? }
// DELETE /admin-tasks-crud    body: { id }
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
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
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getAdmin(token: string) {
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) return null
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  return isAdmin ? user : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const user = await getAdmin(token)
  if (!user) return json({ error: 'Forbidden' }, 403)

  // ── GET: lista tarefas ────────────────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const status    = url.searchParams.get('status')    ?? 'open'
    const churchId  = url.searchParams.get('church_id') ?? null
    const limit     = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))

    let query = supabase
      .from('admin_tasks')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status !== 'all') query = query.eq('status', status)
    if (churchId)         query = query.eq('church_id', churchId)

    const { data, error } = await query
    if (error) return json({ error: error.message }, 500)
    return json({ data: data ?? [], total: data?.length ?? 0 })
  }

  // ── POST: cria tarefa ─────────────────────────────────────
  if (req.method === 'POST') {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.title?.toString().trim()) return json({ error: 'title é obrigatório' }, 400)

    const { data, error } = await supabase
      .from('admin_tasks')
      .insert({
        title:        body.title.toString().trim(),
        church_id:    body.church_id    ?? null,
        assigned_to:  body.assigned_to  ?? null,
        description:  body.description  ?? null,
        priority:     body.priority     ?? 'medium',
        due_date:     body.due_date     ?? null,
        status:       'open',
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)
    return json(data, 201)
  }

  // ── PATCH: atualiza tarefa ────────────────────────────────
  if (req.method === 'PATCH') {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

    const { id, ...rest } = body
    if (!id) return json({ error: 'id é obrigatório' }, 400)

    const allowedFields = ['status', 'title', 'priority', 'due_date', 'description', 'assigned_to']
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowedFields) {
      if (k in rest) patch[k] = rest[k]
    }
    // Se status mudar para done, registra completed_at
    if (patch.status === 'done') patch.completed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('admin_tasks')
      .update(patch)
      .eq('id', id as string)
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)
    return json(data)
  }

  // ── DELETE: cancela tarefa (soft delete via status) ───────
  if (req.method === 'DELETE') {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.id) return json({ error: 'id é obrigatório' }, 400)

    const { error } = await supabase
      .from('admin_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', body.id as string)

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS })
})
