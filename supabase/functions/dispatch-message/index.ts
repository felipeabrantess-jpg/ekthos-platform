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
// Fluxo Sprint 2:
//   1. Valida campos obrigatórios
//   2. Decide canal via agent_channel_routing
//   3. Verifica canal WhatsApp configurado
//   4. Enfileira em agent_pending_messages (status: awaiting_retry)
//   5. Tenta POST imediato ao n8n webhook do agente
//   6. Se ok → atualiza status para dispatched_to_n8n
//      Se falha → mantém awaiting_retry (agent-outbound-retry assume)
//
// Variáveis de ambiente esperadas por agente:
//   N8N_WEBHOOK_ACOLHIMENTO   → agent-acolhimento
//   N8N_WEBHOOK_REENGAJAMENTO → agent-reengajamento (Sprint 3)
//   N8N_WEBHOOK_OPERACAO      → agent-operacao      (Sprint 4)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
}

// Mapa agente → nome da env var + fallback hardcoded (URLs públicas, não são segredos)
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
  // Preflight
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 200)
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
      .select('id, phone_number')
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
        scheduled_for: new Date().toISOString(),
        payload: {
          to_phone,
          message,
          person_id:         person_id ?? null,
          channel_type:      channelType,
          channel_id:        channel?.id ?? null,
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

    // 5. Tenta dispatch imediato ao n8n
    const webhookUrl = getWebhookUrl(agent_slug)

    if (!webhookUrl) {
      console.warn(`[dispatch-message] Sem webhook n8n configurado para ${agent_slug}. Mensagem ${messageId} ficará como awaiting_retry.`)
      return json({
        ok: true,
        queued: true,
        message_id:        messageId,
        channel_type:      channelType,
        channel_configured: !!channel,
        dispatched_to_n8n: false,
        note:              'Webhook n8n não configurado para este agente. Worker de retry assumirá.'
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
        // 6a. n8n recebeu — atualiza status
        await supabaseAdmin
          .from('agent_pending_messages')
          .update({
            status:      'dispatched_to_n8n',
            resolved_at: new Date().toISOString()
          })
          .eq('id', messageId)

        console.log(`[dispatch-message] Mensagem ${messageId} → n8n (${n8nRes.status})`)
        return json({
          ok: true,
          queued: true,
          message_id:        messageId,
          channel_type:      channelType,
          channel_configured: !!channel,
          dispatched_to_n8n: true
        })
      } else {
        const errText = await n8nRes.text().catch(() => '')
        console.warn(`[dispatch-message] n8n retornou ${n8nRes.status} para ${messageId}: ${errText}`)
        // mantém awaiting_retry — retry worker assume
        return json({
          ok: true,
          queued: true,
          message_id:        messageId,
          channel_type:      channelType,
          channel_configured: !!channel,
          dispatched_to_n8n: false,
          n8n_status:        n8nRes.status
        })
      }

    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      console.warn(`[dispatch-message] n8n fetch falhou para ${messageId}: ${msg}`)
      // mantém awaiting_retry — retry worker assume
      return json({
        ok: true,
        queued: true,
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
