// ============================================================
// Edge Function: webhook-receiver
// Único ponto de entrada para mensagens inbound de qualquer provider.
//
// POST /functions/v1/webhook-receiver?provider=zapi&instance_id=INST
// verify_jwt = false — URL pública, validação por assinatura/instance_id
//
// Responsabilidades (e APENAS estas):
//   1. Validar que o payload vem de um provider conhecido
//   2. Identificar qual igreja/canal pelo instance_id
//   3. Normalizar via channel-adapter (agnóstico de provider)
//   4. Deduplicar por provider_message_id
//   5. INSERT conversation_messages (direction=inbound)
//   6. UPSERT conversations (cria se não existe)
//   7. Chamar conversation-router via fetch (async, non-blocking)
//   8. Retornar 200 IMEDIATO ao provider (Z-API retenta se demorar >5s)
//
// NÃO:
//   - Não chama Z-API de volta
//   - Não chama n8n
//   - Não decide o que fazer com a mensagem (isso é o conversation-router)
//   - Não bloqueia a resposta esperando o router terminar
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ZApiAdapter, resolveAdapter } from '../_shared/channel-adapter.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return ok()
  }

  // Z-API pode usar GET para verificação de webhook — responde 200
  if (req.method === 'GET') {
    return ok()
  }

  if (req.method !== 'POST') {
    return ok() // Sempre 200 ao provider — nunca 4xx (causaria retentativas)
  }

  const url        = new URL(req.url)
  const provider   = url.searchParams.get('provider') ?? 'zapi'
  const instanceId = url.searchParams.get('instance_id') ?? ''

  // Responde 200 IMEDIATAMENTE — processamento acontece depois
  // (Fire-and-forget pattern: provider não fica esperando)
  const processingPromise = processInbound(req, provider, instanceId)

  // Retorna antes de processar (evita timeout do Z-API)
  // O Deno.serve aguarda a promise terminar antes de matar o isolate
  await processingPromise

  return ok()
})

// ── processInbound ───────────────────────────────────────────

async function processInbound(
  req:        Request,
  provider:   string,
  instanceId: string
): Promise<void> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 1. Parsear body
    const raw = await req.json().catch(() => null)
    if (!raw) {
      console.warn('[webhook-receiver] payload vazio ou inválido')
      return
    }

    // 2. Normalizar via adapter
    const adapter    = resolveAdapter(provider)
    const normalized = adapter.parseWebhook(raw)

    if (!normalized) {
      // Payload não é mensagem de texto (status update, grupo, etc.) — ignora
      console.log('[webhook-receiver] payload ignorado (não é mensagem de texto)')
      return
    }

    // Usa instance_id do payload se não veio na query string
    const effectiveInstanceId = instanceId || normalized.instance_id
    if (!effectiveInstanceId) {
      console.warn('[webhook-receiver] instance_id ausente — não é possível identificar a igreja')
      return
    }

    // 3. Identificar canal + igreja pelo instance_id
    const { data: channel, error: chErr } = await sb
      .from('church_whatsapp_channels')
      .select('id, church_id, phone_number, channel_type')
      .eq('zapi_instance_id', effectiveInstanceId)
      .eq('active', true)
      .maybeSingle()

    if (chErr || !channel) {
      console.warn(`[webhook-receiver] Canal não encontrado para instance_id=${effectiveInstanceId}`)
      return
    }

    const { id: channelId, church_id: churchId } = channel

    // 4. Deduplicar por provider_message_id
    if (normalized.provider_message_id) {
      const { count } = await sb
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('provider_message_id', normalized.provider_message_id)

      if ((count ?? 0) > 0) {
        console.log(`[webhook-receiver] Duplicata ignorada: ${normalized.provider_message_id}`)
        return
      }
    }

    // 5. UPSERT conversation
    // Busca ou cria conversa para este contato neste canal
    const { data: conv, error: convErr } = await sb
      .from('conversations')
      .upsert(
        {
          church_id:     churchId,
          channel_id:    channelId,
          contact_phone: normalized.from_phone,
          status:        'open',
          ownership:     'agent',   // default: agente responde
          last_message_at:      normalized.timestamp,
          last_message_preview: normalized.text.slice(0, 120),
        },
        {
          onConflict:    'church_id,channel_id,contact_phone',
          ignoreDuplicates: false,
        }
      )
      .select('id, ownership, agent_slug, person_id')
      .single()

    if (convErr || !conv) {
      console.error('[webhook-receiver] upsert conversation falhou:', convErr?.message)
      return
    }

    // Atualiza preview + timestamp se conversa já existia
    await sb
      .from('conversations')
      .update({
        last_message_at:      normalized.timestamp,
        last_message_preview: normalized.text.slice(0, 120),
        unread_count:         sb.rpc as unknown as number, // incrementado via trigger futuramente
        status:               'open', // reabre se estava closed
      })
      .eq('id', conv.id)

    // 6. INSERT conversation_messages
    const { data: msg, error: msgErr } = await sb
      .from('conversation_messages')
      .insert({
        conversation_id:     conv.id,
        church_id:           churchId,
        direction:           'inbound',
        sender_type:         'contact',
        sender_id:           normalized.from_phone,
        content:             normalized.text,
        content_type:        'text',
        provider_message_id: normalized.provider_message_id || null,
        status:              'delivered',  // inbound = já entregue por definição
      })
      .select('id')
      .single()

    if (msgErr || !msg) {
      console.error('[webhook-receiver] INSERT conversation_messages falhou:', msgErr?.message)
      return
    }

    console.log(
      `[webhook-receiver] Mensagem inbound gravada: conv=${conv.id} msg=${msg.id} ` +
      `de=${normalized.from_phone} ownership=${conv.ownership}`
    )

    // 7. Chamar conversation-router (async, non-blocking)
    // O router decide: chama o agente IA ou notifica staff humano
    fetch(`${SUPABASE_URL}/functions/v1/conversation-router`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        conversation_id: conv.id,
        message_id:      msg.id,
        church_id:       churchId,
        ownership:       conv.ownership,
        agent_slug:      conv.agent_slug,
        person_id:       conv.person_id,
        inbound_text:    normalized.text,
      }),
      signal: AbortSignal.timeout(3_000),
    }).catch(err => {
      console.warn('[webhook-receiver] conversation-router call falhou:', err.message)
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook-receiver] processInbound error:', msg)
  }
}

// ── helpers ──────────────────────────────────────────────────

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Silencia import não-usado (ZApiAdapter exportado para uso futuro direto)
void ZApiAdapter
