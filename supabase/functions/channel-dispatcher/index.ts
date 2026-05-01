// ============================================================
// Edge Function: channel-dispatcher
// Única função que conhece providers de canal.
// Responsabilidade: pegar mensagens de channel_dispatch_queue
//                   e entregar via adapter correto.
//
// Chamado por:
//   - pg_cron a cada 30s (trigger: 'cron')
//   - Qualquer EF que queira envio imediato (trigger: 'direct')
//
// POST /functions/v1/channel-dispatcher
// verify_jwt = false — chamada interna via service_role
//
// Body (cron):   { trigger: 'cron' }
// Body (direct): { trigger: 'direct', message_id: uuid }
//                → força envio imediato de uma mensagem específica
//
// Fluxo por mensagem:
//   1. SELECT channel_dispatch_queue WHERE status=pending + scheduled_at<=now()
//   2. UPDATE status=processing (lock otimista)
//   3. SELECT channel para obter zapi_instance_id + zapi_token
//   4. resolveAdapter(channel_type).send(...)
//   5. Sucesso: UPDATE message status=sent, queue status=sent
//      Falha:   attempt_count++, backoff, status=failed se >= max
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveAdapter } from '../_shared/channel-adapter.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BATCH_SIZE       = 20

function backoffMs(attempt: number): number {
  // 1min → 2min → 4min (exponencial, igual ao agent-outbound-retry)
  return Math.pow(2, attempt) * 60_000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return resp({ ok: true }, 204)
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json().catch(() => ({ trigger: 'cron' })) as {
      trigger:    string
      message_id?: string
    }

    // ── Direct: forçar envio de mensagem específica ─────────
    if (body.trigger === 'direct' && body.message_id) {
      const result = await processQueueItem(sb, body.message_id)
      return resp({ ok: true, result })
    }

    // ── Cron: processar fila de pendentes ───────────────────
    const { data: items, error: fetchErr } = await sb
      .from('channel_dispatch_queue')
      .select('id')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(BATCH_SIZE)

    if (fetchErr) {
      console.error('[channel-dispatcher] fetch error:', fetchErr.message)
      return resp({ ok: false, error: fetchErr.message }, 500)
    }

    if (!items || items.length === 0) {
      return resp({ ok: true, processed: 0, note: 'Nada na fila' })
    }

    console.log(`[channel-dispatcher] Processando ${items.length} itens...`)

    // Processa sequencialmente — evita flood no provider
    const results: Array<{ id: string; result: string }> = []
    for (const item of items) {
      const r = await processQueueItem(sb, item.id)
      results.push({ id: item.id, result: r })
    }

    const sent   = results.filter(r => r.result === 'sent').length
    const failed = results.filter(r => r.result === 'failed').length
    const retry  = results.filter(r => r.result === 'rescheduled').length

    console.log(`[channel-dispatcher] sent=${sent} failed=${failed} rescheduled=${retry}`)
    return resp({ ok: true, processed: items.length, sent, failed, rescheduled: retry })

  } catch (err) {
    console.error('[channel-dispatcher] unhandled:', err)
    return resp({ ok: false, error: 'internal_error' }, 500)
  }
})

// ── processQueueItem ─────────────────────────────────────────
// Retorna: 'sent' | 'failed' | 'rescheduled' | 'not_found'

async function processQueueItem(
  sb:      ReturnType<typeof createClient>,
  queueId: string
): Promise<string> {

  // 1. Buscar item + canal em uma query
  const { data: item, error: itemErr } = await sb
    .from('channel_dispatch_queue')
    .select(`
      id, message_id, to_phone, content,
      attempt_count, max_attempts, status,
      channel_id,
      church_whatsapp_channels!channel_id (
        channel_type, zapi_instance_id, zapi_token, active, session_status
      )
    `)
    .eq('id', queueId)
    .single()

  if (itemErr || !item) {
    console.warn(`[channel-dispatcher] item não encontrado: ${queueId}`)
    return 'not_found'
  }

  // Skip se já foi processado (race condition guard)
  if (item.status !== 'pending') {
    console.log(`[channel-dispatcher] ${queueId} já processado (${item.status})`)
    return item.status as string
  }

  // Lock otimista: marca processing
  await sb
    .from('channel_dispatch_queue')
    .update({ status: 'processing' })
    .eq('id', queueId)
    .eq('status', 'pending')  // só atualiza se ainda pending

  // 2. Validar canal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = (item as any).church_whatsapp_channels as {
    channel_type:    string
    zapi_instance_id: string | null
    zapi_token:      string | null
    active:          boolean
    session_status:  string
  } | null

  if (!channel || !channel.active) {
    return await markFailed(sb, item, 'Canal inativo ou não encontrado')
  }

  if (!channel.zapi_instance_id || !channel.zapi_token) {
    return await markFailed(sb, item, 'Credenciais Z-API ausentes no canal')
  }

  if (!['testing', 'active'].includes(channel.session_status)) {
    return await markFailed(sb, item, `Canal em estado inválido: ${channel.session_status}`)
  }

  // 3. Enviar via adapter
  const adapter = resolveAdapter(channel.channel_type ?? 'zapi')
  const result  = await adapter.send({
    instance_id: channel.zapi_instance_id,
    token:       channel.zapi_token,
    to_phone:    item.to_phone,
    text:        item.content,
  })

  const now = new Date().toISOString()

  if (result.ok) {
    // 4a. Sucesso: atualiza fila + mensagem
    await Promise.all([
      sb.from('channel_dispatch_queue').update({
        status:            'sent',
        attempt_count:     item.attempt_count + 1,
        processed_at:      now,
        provider_response: { message_id: result.message_id },
      }).eq('id', queueId),

      sb.from('conversation_messages').update({
        status:              'sent',
        provider_message_id: result.message_id ?? null,
      }).eq('id', item.message_id),
    ])

    console.log(`[channel-dispatcher] ${queueId} → sent (provider_id: ${result.message_id})`)
    return 'sent'
  }

  // 4b. Falha: decide retry ou abandona
  return await markFailed(sb, item, result.error ?? 'provider error')
}

// ── markFailed ───────────────────────────────────────────────

async function markFailed(
  sb:   ReturnType<typeof createClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  err:  string
): Promise<string> {
  const newCount = (item.attempt_count as number) + 1
  const now      = new Date().toISOString()

  if (newCount >= (item.max_attempts as number)) {
    // Desistiu: status final = failed
    await Promise.all([
      sb.from('channel_dispatch_queue').update({
        status:        'failed',
        attempt_count: newCount,
        processed_at:  now,
        error_message: err,
      }).eq('id', item.id),

      sb.from('conversation_messages').update({
        status:       'failed',
        error_detail: err,
      }).eq('id', item.message_id),
    ])

    console.warn(`[channel-dispatcher] ${item.id} → failed após ${newCount} tentativas: ${err}`)
    return 'failed'
  }

  // Reagenda com backoff exponencial
  const nextAt = new Date(Date.now() + backoffMs(newCount)).toISOString()
  await sb.from('channel_dispatch_queue').update({
    status:        'pending',
    attempt_count: newCount,
    scheduled_at:  nextAt,
    error_message: err,
  }).eq('id', item.id)

  console.log(`[channel-dispatcher] ${item.id} → reagendado para ${nextAt} (tentativa ${newCount}): ${err}`)
  return 'rescheduled'
}

// ── helpers ──────────────────────────────────────────────────

function resp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
