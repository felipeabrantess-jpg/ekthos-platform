// ============================================================
// Edge Function: agent-outbound-retry
// Worker de retry para mensagens que falharam ao chegar no n8n.
//
// Chamado por pg_cron a cada 5 minutos.
// Trigger: POST /functions/v1/agent-outbound-retry  { trigger: 'cron' }
// verify_jwt = false
//
// Política de retry:
//   - Busca agent_pending_messages WHERE status = 'awaiting_retry'
//     AND attempt_count < 3
//     AND scheduled_for <= now()
//   - Tenta POST ao webhook n8n do agente
//   - Sucesso: status → dispatched_to_n8n
//   - Falha:   attempt_count++
//              se attempt_count >= 3: status → failed
//              senão: reagenda scheduled_for += backoff exponencial
//
// Backoff: 2^attempt_count minutos (1min, 2min, 4min)
// Batch: até 20 mensagens por execução (uma por uma para controle de falha)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_ATTEMPTS     = 3
const BATCH_SIZE       = 20

// Mapa agente → env var + fallback hardcoded (URLs públicas, não são segredos)
const AGENT_WEBHOOK_CONFIG: Record<string, { envVar: string; fallback: string }> = {
  'agent-acolhimento':   {
    envVar:   'N8N_WEBHOOK_ACOLHIMENTO',
    fallback: 'https://ekthosai.app.n8n.cloud/webhook/ekthos-acolhimento-outbound',
  },
  'agent-reengajamento': { envVar: 'N8N_WEBHOOK_REENGAJAMENTO', fallback: '' },
  'agent-operacao':      { envVar: 'N8N_WEBHOOK_OPERACAO',      fallback: '' },
}

function getWebhookUrl(agentSlug: string): string | null {
  const cfg = AGENT_WEBHOOK_CONFIG[agentSlug]
  if (!cfg) return null
  return (Deno.env.get(cfg.envVar) ?? cfg.fallback) || null
}

// Backoff exponencial: 2^attempt minutos em ms
function backoffMs(attempt: number): number {
  return Math.pow(2, attempt) * 60_000
}

interface PendingMessage {
  id:            string
  church_id:     string
  agent_slug:    string
  attempt_count: number
  payload:       {
    to_phone:    string
    message:     string
    person_id:   string | null
    channel_type: string
  }
}

async function retryMessage(
  sb: ReturnType<typeof createClient>,
  msg: PendingMessage
): Promise<{ id: string; result: 'dispatched' | 'rescheduled' | 'failed' | 'no_webhook' }> {
  const webhookUrl = getWebhookUrl(msg.agent_slug)

  if (!webhookUrl) {
    // Sem webhook configurado — não tem como enviar, apenas incrementa até falhar
    const newCount = msg.attempt_count + 1
    if (newCount >= MAX_ATTEMPTS) {
      await sb.from('agent_pending_messages')
        .update({ status: 'failed', attempt_count: newCount, resolved_at: new Date().toISOString() })
        .eq('id', msg.id)
      console.warn(`[retry] ${msg.id} → failed (sem webhook para ${msg.agent_slug})`)
      return { id: msg.id, result: 'failed' }
    }
    const nextAt = new Date(Date.now() + backoffMs(newCount)).toISOString()
    await sb.from('agent_pending_messages')
      .update({ attempt_count: newCount, scheduled_for: nextAt })
      .eq('id', msg.id)
    return { id: msg.id, result: 'no_webhook' }
  }

  // Tenta POST ao n8n
  try {
    const n8nPayload = {
      message_id:   msg.id,
      church_id:    msg.church_id,
      agent_slug:   msg.agent_slug,
      to_phone:     msg.payload.to_phone,
      message:      msg.payload.message,
      person_id:    msg.payload.person_id ?? null,
      channel_type: msg.payload.channel_type,
      retried_at:   new Date().toISOString(),
      attempt:      msg.attempt_count + 1
    }

    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(n8nPayload),
      signal:  AbortSignal.timeout(8_000)
    })

    if (res.ok) {
      await sb.from('agent_pending_messages')
        .update({
          status:        'dispatched_to_n8n',
          attempt_count: msg.attempt_count + 1,
          resolved_at:   new Date().toISOString()
        })
        .eq('id', msg.id)
      console.log(`[retry] ${msg.id} → dispatched_to_n8n (attempt ${msg.attempt_count + 1})`)
      return { id: msg.id, result: 'dispatched' }
    }

    // n8n retornou erro HTTP
    const newCount = msg.attempt_count + 1
    if (newCount >= MAX_ATTEMPTS) {
      await sb.from('agent_pending_messages')
        .update({ status: 'failed', attempt_count: newCount, resolved_at: new Date().toISOString() })
        .eq('id', msg.id)
      console.warn(`[retry] ${msg.id} → failed após ${newCount} tentativas (n8n ${res.status})`)
      return { id: msg.id, result: 'failed' }
    }

    const nextAt = new Date(Date.now() + backoffMs(newCount)).toISOString()
    await sb.from('agent_pending_messages')
      .update({ attempt_count: newCount, scheduled_for: nextAt })
      .eq('id', msg.id)
    console.log(`[retry] ${msg.id} → reagendado para ${nextAt} (attempt ${newCount}, n8n ${res.status})`)
    return { id: msg.id, result: 'rescheduled' }

  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err)
    const newCount = msg.attempt_count + 1

    if (newCount >= MAX_ATTEMPTS) {
      await sb.from('agent_pending_messages')
        .update({ status: 'failed', attempt_count: newCount, resolved_at: new Date().toISOString() })
        .eq('id', msg.id)
      console.warn(`[retry] ${msg.id} → failed após ${newCount} tentativas (${msg2})`)
      return { id: msg.id, result: 'failed' }
    }

    const nextAt = new Date(Date.now() + backoffMs(newCount)).toISOString()
    await sb.from('agent_pending_messages')
      .update({ attempt_count: newCount, scheduled_for: nextAt })
      .eq('id', msg.id)
    console.log(`[retry] ${msg.id} → reagendado (attempt ${newCount}, erro: ${msg2})`)
    return { id: msg.id, result: 'rescheduled' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // Busca mensagens pendentes de retry
    const { data: pending, error: fetchErr } = await sb
      .from('agent_pending_messages')
      .select('id, church_id, agent_slug, attempt_count, payload')
      .eq('status', 'awaiting_retry')
      .lt('attempt_count', MAX_ATTEMPTS)
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for')
      .limit(BATCH_SIZE)

    if (fetchErr) {
      console.error('[retry] Erro ao buscar pending:', fetchErr.message)
      return jsonResp({ ok: false, error: fetchErr.message }, 500)
    }

    if (!pending || pending.length === 0) {
      return jsonResp({ ok: true, processed: 0, note: 'Nada para retentar' })
    }

    console.log(`[retry] Processando ${pending.length} mensagens...`)

    // Processa sequencialmente para evitar flood no n8n
    const results: Array<{ id: string; result: string }> = []
    for (const msg of pending) {
      const r = await retryMessage(sb, msg as PendingMessage)
      results.push(r)
    }

    const dispatched  = results.filter(r => r.result === 'dispatched').length
    const rescheduled = results.filter(r => r.result === 'rescheduled').length
    const failed      = results.filter(r => r.result === 'failed').length
    const noWebhook   = results.filter(r => r.result === 'no_webhook').length

    console.log(`[retry] Resultado: dispatched=${dispatched} rescheduled=${rescheduled} failed=${failed} no_webhook=${noWebhook}`)

    return jsonResp({
      ok:        true,
      processed: pending.length,
      dispatched,
      rescheduled,
      failed,
      no_webhook: noWebhook
    })

  } catch (err) {
    console.error('[retry] Unhandled error:', err)
    return jsonResp({ ok: false, error: 'internal_error' }, 500)
  }
})

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
