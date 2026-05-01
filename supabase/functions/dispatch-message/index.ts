// ============================================================
// Edge Function: dispatch-message
// Roteamento de mensagens WhatsApp para agentes premium
//
// POST /functions/v1/dispatch-message
// verify_jwt = false — chamada interna via service_role Bearer
//
// Body: {
//   church_id: string (uuid)
//   agent_slug: string
//   to_phone: string
//   message: string
//   person_id?: string (uuid, opcional)
// }
//
// Fluxo Sprint 1 (worker não implementado):
//   1. Valida campos obrigatórios
//   2. Decide canal via agent_channel_routing
//   3. Verifica se igreja tem canal configurado
//   4. Enfileira em agent_pending_messages (status: awaiting_credits → dispatched)
//
// Sprint 2+: worker consome agent_pending_messages e envia via Z-API/Meta
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const body = await req.json()
    const { church_id, agent_slug, to_phone, message, person_id } = body

    // 1. Validar campos obrigatórios
    if (!church_id || !agent_slug || !to_phone || !message) {
      return json({ ok: false, error: 'missing_fields', required: ['church_id', 'agent_slug', 'to_phone', 'message'] }, 400)
    }

    // 2. Decide canal pelo agent_channel_routing
    const { data: routing } = await supabaseAdmin
      .from('agent_channel_routing')
      .select('channel_type')
      .eq('agent_slug', agent_slug)
      .maybeSingle()

    // Default: meta_cloud se não há rota configurada
    const channelType = routing?.channel_type ?? 'meta_cloud'

    // 3. Verifica se a igreja tem o canal configurado
    const { data: channel } = await supabaseAdmin
      .from('church_whatsapp_channels')
      .select('id, phone_number')
      .eq('church_id', church_id)
      .eq('channel_type', channelType)
      .eq('active', true)
      .maybeSingle()

    if (!channel) {
      // Sprint 1: sem canal configurado — enfileira anyway com status de falta de canal
      console.warn(`[dispatch-message] Igreja ${church_id} sem canal ${channelType} configurado`)
    }

    // 4. Enfileira em agent_pending_messages
    // Sprint 1: status = 'awaiting_credits' (worker não existe ainda)
    // Sprint 2+: worker lê 'awaiting_credits' + verifica créditos + envia + atualiza 'dispatched'
    const { data: queued, error: insertErr } = await supabaseAdmin
      .from('agent_pending_messages')
      .insert({
        church_id,
        agent_slug,
        scheduled_for: new Date().toISOString(),
        payload: {
          to_phone,
          message,
          person_id: person_id ?? null,
          channel_type: channelType,
          channel_id: channel?.id ?? null,
          channel_configured: !!channel
        },
        status: 'awaiting_credits'
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[dispatch-message] Insert error:', insertErr.message)
      return json({ ok: false, error: 'queue_error' }, 500)
    }

    return json({
      ok: true,
      queued: true,
      message_id: queued.id,
      channel_type: channelType,
      channel_configured: !!channel,
      note: 'Sprint 1: mensagem enfileirada. Worker de envio disponível a partir do Sprint 2.'
    })

  } catch (err) {
    console.error('[dispatch-message] Unhandled error:', err)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
}
