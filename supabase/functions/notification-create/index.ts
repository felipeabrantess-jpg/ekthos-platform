// ============================================================
// Edge Function: notification-create
// Helper interno — cria uma notificação para um usuário.
//
// POST /functions/v1/notification-create
// verify_jwt = false — chamada interna via service_role Bearer
//
// Body:
//   church_id:       uuid  (obrigatório)
//   user_id:         uuid  (obrigatório — destinatário)
//   title:           string (obrigatório)
//   body:            string (opcional)
//   type:            'alert'|'info'|'warning'|'success' (obrigatório)
//   link:            string (opcional, ex: '/pessoas?tab=novos')
//   automation_name: string (opcional, ex: 'qr_code_visitor')
//   person_id:       uuid  (opcional)
//
// Retorna: { ok: true, notification_id: uuid }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const VALID_TYPES = new Set(['alert', 'info', 'warning', 'success'])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Auth: apenas service_role ─────────────────────────────
  const authHeader  = req.headers.get('authorization') ?? ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (bearerToken !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Validação ─────────────────────────────────────────────
  const churchId      = typeof body.church_id === 'string' ? body.church_id.trim() : null
  const userId        = typeof body.user_id   === 'string' ? body.user_id.trim()   : null
  const title         = typeof body.title     === 'string' ? body.title.trim()     : null
  const type          = typeof body.type      === 'string' ? body.type.trim()      : null
  const bodyText      = typeof body.body      === 'string' ? body.body.trim()      : null
  const link          = typeof body.link      === 'string' ? body.link.trim()      : null
  const automationName = typeof body.automation_name === 'string' ? body.automation_name.trim() : null
  const personId      = typeof body.person_id === 'string' ? body.person_id.trim() : null

  if (!churchId || !userId || !title || !type) {
    return new Response(
      JSON.stringify({ error: 'church_id, user_id, title e type são obrigatórios' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!VALID_TYPES.has(type)) {
    return new Response(
      JSON.stringify({ error: `type inválido: ${type}. Use alert|info|warning|success` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── INSERT na tabela notifications ────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('notifications')
      .insert({
        church_id:       churchId,
        user_id:         userId,
        title,
        body:            bodyText,
        type,
        read:            false,
        link,
        automation_name: automationName,
        person_id:       personId,
      })
      .select('id')
      .single() as { data: { id: string } | null; error: { message: string } | null }

    if (error || !data) {
      console.error('[notification-create] INSERT falhou:', error?.message)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar notificação' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const notificationId = data.id

    // ── audit_log ─────────────────────────────────────────
    await sb.from('audit_logs').insert({
      church_id:   churchId,
      entity_type: 'notification',
      entity_id:   notificationId,
      action:      'notification_created',
      actor_type:  'system',
      actor_id:    'notification-create',
      payload:     { type, automation_name: automationName, user_id: userId },
      model_used:  null,
      tokens_used: 0,
    }).catch(() => {/* audit falha silenciosa */})

    console.log(`[notification-create] ok → ${notificationId} (type=${type}, user=${userId})`)

    return new Response(
      JSON.stringify({ ok: true, notification_id: notificationId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[notification-create] UNHANDLED:', msg)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
