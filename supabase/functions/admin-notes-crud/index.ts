// ============================================================
// Edge Function: admin-notes-crud
// CRUD de notas internas do time sobre uma conta de igreja.
//
// GET    /admin-notes-crud?church_id=   → lista notas
// POST   /admin-notes-crud    body: { church_id, body, pinned? }
// DELETE /admin-notes-crud    body: { id }
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
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getAdmin(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
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

  // ── GET: lista notas de uma igreja ───────────────────────
  if (req.method === 'GET') {
    const churchId = new URL(req.url).searchParams.get('church_id')
    if (!churchId) return json({ error: 'church_id é obrigatório' }, 400)

    const { data, error } = await supabase
      .from('church_notes')
      .select('*')
      .eq('church_id', churchId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return json({ error: error.message }, 500)
    return json({ data: data ?? [] })
  }

  // ── POST: cria nota ──────────────────────────────────────
  if (req.method === 'POST') {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.church_id) return json({ error: 'church_id é obrigatório' }, 400)
    if (!body.body?.toString().trim()) return json({ error: 'body é obrigatório' }, 400)

    const { data, error } = await supabase
      .from('church_notes')
      .insert({
        church_id:     body.church_id as string,
        admin_user_id: user.id,
        body:          body.body.toString().trim(),
        pinned:        body.pinned === true,
      })
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)
    return json(data, 201)
  }

  // ── DELETE: remove nota ──────────────────────────────────
  if (req.method === 'DELETE') {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.id) return json({ error: 'id é obrigatório' }, 400)

    // Garante que só o autor pode deletar (ou qualquer admin — aqui qualquer admin)
    const { error } = await supabase
      .from('church_notes')
      .delete()
      .eq('id', body.id as string)

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS })
})
