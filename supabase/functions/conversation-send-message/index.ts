// ============================================================
// Edge Function: conversation-send-message — Sprint 3D
//
// POST /functions/v1/conversation-send-message
// verify_jwt = false — validação manual interna
//
// Body:
//   { conversation_id: string, body: string }
//
// Regra travada Sprint 3D:
//   O backend é a proteção final. Se ownership !== 'human',
//   a mensagem é BLOQUEADA independente do que o frontend enviar.
//   O frontend não é confiável para essa decisão.
//
// Fluxo:
//   1. Validar JWT → extrair user + church_id
//   2. Buscar conversa → verificar church_id + ownership
//   3. Bloquear se ownership !== 'human' (regra inegociável)
//   4. INSERT conversation_messages (direction=outbound, actor_type=human)
//   5. INSERT channel_dispatch_queue (para channel-dispatcher entregar)
//   6. UPDATE conversations.last_message_preview
//   7. INSERT conversation_events (audit)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 204, corsHeaders())
  }

  // ── 1. Validar JWT ─────────────────────────────────��──────
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)

  if (authErr || !user) {
    return json({ error: 'unauthorized' }, 401)
  }

  // ── 2. church_id do token ───────────────��────────────────
  const churchId = user.app_metadata?.church_id as string | undefined

  if (!churchId) {
    return json({ error: 'forbidden: sem church_id no token' }, 403)
  }

  // ── 3. Parse body ────────────────────────────────��────────
  let body: { conversation_id?: string; body?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const { conversation_id, body: messageBody } = body

  if (!conversation_id) {
    return json({ error: 'conversation_id é obrigatório' }, 400)
  }
  if (!messageBody?.trim()) {
    return json({ error: 'body não pode estar vazio' }, 400)
  }

  const trimmedBody = messageBody.trim()

  // ── 4. Buscar conversa ───────────────────────────────────
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: conv, error: convErr } = await sbAdmin
    .from('conversations')
    .select('id, church_id, ownership, contact_phone, channel_id, status')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conv) {
    return json({ error: 'conversa não encontrada' }, 404)
  }

  // Guard: church_id deve bater
  if (conv.church_id !== churchId) {
    return json({ error: 'forbidden: conversa de outra church' }, 403)
  }

  // ── 5. PROTEÇÃO FINAL: ownership deve ser 'human' ────────
  // Esta é a regra inegociável do Sprint 3D.
  // O frontend pode ter falha, bug ou manipulação — o backend sempre verifica.
  if (conv.ownership !== 'human') {
    console.warn(
      `[conversation-send-message] BLOQUEADO: ` +
      `conversation=${conversation_id} ownership=${conv.ownership} (precisa ser 'human')`
    )
    return json({
      error: 'forbidden: conversa não está em modo humano',
      ownership: conv.ownership,
    }, 403)
  }

  // Guard: não enviar em conversa fechada/arquivada
  if (conv.status === 'closed' || conv.status === 'archived') {
    return json({ error: `não é possível enviar em conversa ${conv.status}` }, 422)
  }

  // ── 6. Buscar canal e dados de envio ─────────────────────
  const { data: channel } = await sbAdmin
    .from('church_whatsapp_channels')
    .select('id, phone_number, provider, instance_id, token')
    .eq('id', conv.channel_id)
    .maybeSingle()

  if (!channel) {
    return json({ error: 'canal da conversa não encontrado' }, 422)
  }

  // ── 7. Buscar display_name do actor ──────────────────────
  const { data: profile } = await sbAdmin
    .from('profiles')
    .select('display_name, name')
    .eq('user_id', user.id)
    .maybeSingle()

  const actorName = profile?.display_name ?? profile?.name ?? user.email ?? 'Staff'

  // ── 8. INSERT conversation_messages ──────────────────────
  const { data: msg, error: msgErr } = await sbAdmin
    .from('conversation_messages')
    .insert({
      conversation_id,
      direction:   'outbound',
      actor_type:  'human',
      actor_id:    user.id,
      body:        trimmedBody,
      status:      'pending',
    })
    .select('id')
    .single()

  if (msgErr || !msg) {
    console.error('[conversation-send-message] insert message error:', msgErr?.message)
    return json({ error: 'internal_error' }, 500)
  }

  // ── 9. INSERT channel_dispatch_queue ────────────────────
  const { error: qErr } = await sbAdmin
    .from('channel_dispatch_queue')
    .insert({
      message_id:   msg.id,
      channel_id:   conv.channel_id,
      church_id:    churchId,
      to_phone:     conv.contact_phone,
      body:         trimmedBody,
      channel_type: channel.provider ?? 'zapi',
      status:       'pending',
      scheduled_at: new Date().toISOString(),
      attempt:      0,
    })

  if (qErr) {
    // Não fatal — channel-dispatcher pode reprocessar, mas logamos
    console.error('[conversation-send-message] enqueue error:', qErr.message)
  }

  // ── 10. UPDATE last_message_preview ─────────────────────
  await sbAdmin
    .from('conversations')
    .update({
      last_message_at:      new Date().toISOString(),
      last_message_preview: trimmedBody.slice(0, 80),
    })
    .eq('id', conversation_id)

  // ── 11. Auditoria — conversation_events (best-effort) ───
  try {
    await sbAdmin.from('conversation_events').insert({
      conversation_id,
      church_id:       churchId,
      event_type:      'message_outbound_human',
      actor_type:      'human',
      actor_id:        user.id,
      actor_name:      actorName,
      message_preview: trimmedBody.slice(0, 80),
    })
  } catch (err) {
    console.warn('[conversation-send-message] event log failed (non-fatal):', err)
  }

  console.log(
    `[conversation-send-message] ${conversation_id} msg=${msg.id}` +
    ` actor=${actorName} len=${trimmedBody.length}`
  )

  return json({ ok: true, message_id: msg.id }, 200, corsHeaders())
})

// ── helpers ─────────────���────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}
