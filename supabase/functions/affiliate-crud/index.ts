// ============================================================
// Edge Function: affiliate-crud
// POST   = create affiliate
// PATCH  = update affiliate fields
// DELETE = soft-delete (status = 'banned')
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
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return null
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) return null
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  return isAdmin ? user : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const user = await requireAdmin(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  // ── POST: create ────────────────────────────────────────────
  if (req.method === 'POST') {
    let body: {
      name: string
      email: string
      pix_key_type?: string
      pix_key?: string
      notes?: string
    }
    try { body = await req.json() }
    catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.name || !body.email) {
      return json({ error: 'name e email são obrigatórios' }, 400)
    }

    const { data, error } = await supabase
      .from('affiliates')
      .insert({
        name:         body.name,
        email:        body.email,
        pix_key_type: body.pix_key_type ?? null,
        pix_key:      body.pix_key      ?? null,
        notes:        body.notes        ?? null,
        status:       'active',
        created_by:   user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return json({ error: 'Email já cadastrado' }, 409)
      console.error('[affiliate-crud] insert error:', error)
      return json({ error: 'Erro ao criar afiliado' }, 500)
    }

    await supabase.from('admin_events').insert({
      admin_user_id: user.id,
      action:        'affiliate_created',
      after:         { id: data.id, name: data.name, email: data.email },
    })

    return json({ affiliate: data }, 201)
  }

  // ── PATCH: update ───────────────────────────────────────────
  if (req.method === 'PATCH') {
    let body: {
      id:            string
      name?:         string
      email?:        string
      pix_key_type?: string | null
      pix_key?:      string | null
      notes?:        string | null
      status?:       string
    }
    try { body = await req.json() }
    catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.id) return json({ error: 'id é obrigatório' }, 400)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name         !== undefined) patch.name         = body.name
    if (body.email        !== undefined) patch.email        = body.email
    if (body.pix_key_type !== undefined) patch.pix_key_type = body.pix_key_type
    if (body.pix_key      !== undefined) patch.pix_key      = body.pix_key
    if (body.notes        !== undefined) patch.notes        = body.notes
    if (body.status       !== undefined) patch.status       = body.status

    const { data, error } = await supabase
      .from('affiliates')
      .update(patch)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return json({ error: 'Email já cadastrado' }, 409)
      console.error('[affiliate-crud] update error:', error)
      return json({ error: 'Erro ao atualizar afiliado' }, 500)
    }

    await supabase.from('admin_events').insert({
      admin_user_id: user.id,
      action:        'affiliate_updated',
      after:         { id: body.id, ...patch },
    })

    return json({ affiliate: data })
  }

  // ── DELETE: soft-delete ────────────────────────────────────
  if (req.method === 'DELETE') {
    let body: { id: string }
    try { body = await req.json() }
    catch { return json({ error: 'Body inválido' }, 400) }

    if (!body.id) return json({ error: 'id é obrigatório' }, 400)

    const { error } = await supabase
      .from('affiliates')
      .update({ status: 'banned', updated_at: new Date().toISOString() })
      .eq('id', body.id)

    if (error) {
      console.error('[affiliate-crud] ban error:', error)
      return json({ error: 'Erro ao banir afiliado' }, 500)
    }

    await supabase.from('admin_events').insert({
      admin_user_id: user.id,
      action:        'affiliate_banned',
      after:         { id: body.id },
    })

    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
})
