// ============================================================
// Edge Function: dispatch-message
// Roteamento de mensagens WhatsApp para agentes premium
//
// POST /functions/v1/dispatch-message
// verify_jwt = false — chamada interna via service_role Bearer
//
// Body: {
//   church_id:  string (uuid)
//   agent_slug: string
//   to_phone:   string
//   message:    string
//   person_id?: string (uuid, opcional)
// }
//
// Fluxo Sprint 2+ChatPro:
//   1. Valida campos obrigatórios
//   2. Decide canal via agent_channel_routing
//   3. Verifica canal WhatsApp configurado
//   4. Enfileira em agent_pending_messages (status: awaiting_retry)
//   5. Se channel_type='chatpro' → invoca EF chatpro-send diretamente
//      Se channel_type='mock'    → log fake, status delivered
//      Outros (n8n path)         → POST ao webhook n8n configurado
//   6. Atualiza status conforme resultado
//
// Variáveis de ambiente:
//   N8N_WEBHOOK_ACOLHIMENTO   → agent-acolhimento (path n8n)
//   N8N_WEBHOOK_REENGAJAMENTO → agent-reengajamento (Sprint 3)
//   N8N_WEBHOOK_OPERACAO      → agent-operacao      (Sprint 4)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
}

// Mapa agente → webhook n8n (fallback quando não usa ChatPro)
const AGENT_WEBHOOK_CONFIG: Record<string, { envVar: string; fallback: string }> = {
  'agent-acolhimento':   {
    envVar:   'N8N_WEBHOOK_ACOLHIMENTO',
    fallback: 'https://ekthosai.app.n8n.cloud/webhook/ekthos-acolhimento-outbound',
  },
  'agent-reengajamento': {
    envVar:   'N8N_WEBHOOK_REENGAJAMENTO',
    fallback: '',  // Sprint 3
  },
  'agent-operacao':      {
    envVar:   'N8N_WEBHOOK_OPERACAO',
    fallback: '',  // Sprint 4
  },
}

function getWebhookUrl(agentSlug: string): string | null {
  const cfg = AGENT_WEBHOOK_CONFIG[agentSlug]
  if (!cfg) return null
  return (Deno.env.get(cfg.envVar) ?? cfg.fallback) || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200)
  if (req.method !== 'POST')    return json({ ok: false, error: 'method_not_allowed' }, 405)

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
      return json({
        ok: false, error: 'missing_fields',
        required: ['church_id', 'agent_slug', 'to_phone', 'message']
      }, 400)
    }

    // 2. Decide canal pelo agent_channel_routing (default: meta_cloud)
    const { data: routing } = await supabaseAdmin
      .from('agent_channel_routing')
      .select('channel_type')
      .eq('agent_slug', agent_slug)
      .maybeSingle()

    const channelType = routing?.channel_type ?? 'meta_cloud'

    // 3. Verifica canal WhatsApp configurado
    const { data: channel } = await supabaseAdmin
      .from('church_whatsapp_channels')
      .select('id, phone_number, channel_type')
      .eq('church_id', church_id)
      .eq('channel_type', channelType)
      .eq('active', true)
      .maybeSingle()

    if (!channel) {
      console.warn(`[dispatch-message] Igreja ${church_id} sem canal ${channelType} ativo`)
    }

    // 4. Enfileira em agent_pending_messages
    const { data: queued, error: insertErr } = await supabaseAdmin
      .from('agent_pending_messages')
      .insert({
        church_id,
        agent_slug,
        scheduled_for:  new Date().toISOString(),
        payload: {
          to_phone,
          message,
          person_id:          person_id ?? null,
          channel_type:       channelType,
          channel_id:         channel?.id ?? null,
          channel_configured: !!channel
        },
        status:        'awaiting_retry',
        attempt_count: 0
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[dispatch-message] Insert error:', insertErr.message)
      return json({ ok: false, error: 'queue_error' }, 500)
    }

    const messageId = queued.id

    // 5. Dispatch por provider ─────────────────────────────────

    // ── 5a. ChatPro: invoca EF chatpro-send diretamente ────────
    if (channelType === 'chatpro') {
      console.log(`[dispatch-message] Roteando ${messageId} via ChatPro`)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!

      try {
        const chatproRes = await fetch(`${supabaseUrl}/functions/v1/chatpro-send`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ to_phone, message }),
          signal:  AbortSignal.timeout(20_000),
        })

        const chatproBody = await chatproRes.json().catch(() => ({}))

        if (chatproRes.ok && (chatproBody as Record<string, unknown>).ok) {
          await supabaseAdmin
            .from('agent_pending_messages')
            .update({
              status:      'delivered',
              resolved_at: new Date().toISOString(),
              payload: {
                to_phone, message,
                person_id:          person_id ?? null,
                channel_type:       channelType,
                channel_id:         channel?.id ?? null,
                channel_configured: !!channel,
                chatpro_message_id: (chatproBody as Record<string, unknown>).message_id ?? null,
              }
            })
            .eq('id', messageId)

          console.log(`[dispatch-message] ✅ ChatPro entregou ${messageId}`)
          return json({
            ok:               true,
            queued:           true,
            message_id:       messageId,
            channel_type:     channelType,
            dispatched_via:   'chatpro',
            chatpro_message_id: (chatproBody as Record<string, unknown>).message_id ?? null,
          })
        }

        // ChatPro retornou erro
        console.warn(`[dispatch-message] ChatPro falhou para ${messageId}:`, chatproBody)
        await supabaseAdmin
          .from('agent_pending_messages')
          .update({ status: 'awaiting_retry' })
          .eq('id', messageId)

        return json({
          ok:              true,
          queued:          true,
          message_id:      messageId,
          channel_type:    channelType,
          dispatched_via:  'chatpro',
          chatpro_ok:      false,
          chatpro_error:   chatproBody,
          note:            'ChatPro retornou erro. Mensagem ficará como awaiting_retry.',
        })

      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        console.warn(`[dispatch-message] chatpro-send fetch error para ${messageId}: ${msg}`)
        return json({
          ok:             true,
          queued:         true,
          message_id:     messageId,
          channel_type:   channelType,
          dispatched_via: 'chatpro',
          chatpro_ok:     false,
          error:          'chatpro_send_unreachable',
        })
      }
    }

    // ── 5b. Mock: log fake, entrega imediata ───────────────────
    if (channelType === 'mock') {
      const mockId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      console.log(`[dispatch-message] 📨 MOCK → ${to_phone}\n  mock_id: ${mockId}\n  body: "${message.slice(0, 80)}..."`)

      await supabaseAdmin
        .from('agent_pending_messages')
        .update({
          status:      'delivered',
          resolved_at: new Date().toISOString(),
          payload: {
            to_phone, message,
            person_id:          person_id ?? null,
            channel_type:       'mock',
            channel_id:         channel?.id ?? null,
            channel_configured: !!channel,
            mock_message_id:    mockId,
          }
        })
        .eq('id', messageId)

      return json({
        ok:             true,
        queued:         true,
        message_id:     messageId,
        channel_type:   'mock',
        dispatched_via: 'mock',
        mock_message_id: mockId,
      })
    }

    // ── 5c. n8n path (meta_cloud, zapi, etc.) ─────────────────
    const webhookUrl = getWebhookUrl(agent_slug)

    if (!webhookUrl) {
      console.warn(`[dispatch-message] Sem webhook n8n para ${agent_slug}. ${messageId} → awaiting_retry.`)
      return json({
        ok:                true,
        queued:            true,
        message_id:        messageId,
        channel_type:      channelType,
        channel_configured: !!channel,
        dispatched_to_n8n: false,
        note:              'Webhook n8n não configurado. Worker de retry assumirá.',
      })
    }

    try {
      const n8nPayload = {
        message_id:   messageId,
        church_id,
        agent_slug,
        to_phone,
        message,
        person_id:    person_id ?? null,
        channel_type: channelType,
        queued_at:    new Date().toISOString()
      }

      const n8nRes = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(n8nPayload),
        signal:  AbortSignal.timeout(8_000)
      })

      if (n8nRes.ok) {
        await supabaseAdmin
          .from('agent_pending_messages')
          .update({
            status:      'dispatched_to_n8n',
            resolved_at: new Date().toISOString()
          })
          .eq('id', messageId)

        console.log(`[dispatch-message] Mensagem ${messageId} → n8n (${n8nRes.status})`)
        return json({
          ok:                true,
          queued:            true,
          message_id:        messageId,
          channel_type:      channelType,
          channel_configured: !!channel,
          dispatched_to_n8n: true
        })
      }

      const errText = await n8nRes.text().catch(() => '')
      console.warn(`[dispatch-message] n8n retornou ${n8nRes.status} para ${messageId}: ${errText}`)
      return json({
        ok:                true,
        queued:            true,
        message_id:        messageId,
        channel_type:      channelType,
        channel_configured: !!channel,
        dispatched_to_n8n: false,
        n8n_status:        n8nRes.status
      })

    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      console.warn(`[dispatch-message] n8n fetch falhou para ${messageId}: ${msg}`)
      return json({
        ok:                true,
        queued:            true,
        message_id:        messageId,
        channel_type:      channelType,
        channel_configured: !!channel,
        dispatched_to_n8n: false,
        error:             'n8n_unreachable'
      })
    }

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
