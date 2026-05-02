// ============================================================
// Edge Function: channel-dispatcher  v3 — ChatPro
// Única função que conhece providers de canal.
//
// Fluxo:
//   1. SELECT channel_dispatch_queue WHERE status=pending
//   2. UPDATE status=processing (lock otimista)
//   3. resolveAdapter(channel_type).send(...)
//   4. Sucesso: status=sent | Falha: backoff / failed
//
// Providers suportados:
//   zapi      → Z-API REST
//   chatpro   → chatpro-send EF (credenciais via Secrets)
//   mock      → MockAdapter (log fake)
//   meta_cloud → stub (futuro)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BATCH_SIZE       = 20

// ── Adapter types ─────────────────────────────────────────────

interface NormalizedInbound {
  from_phone: string; text: string; provider_message_id: string;
  timestamp: string;  instance_id: string;
}
interface SendResult { ok: boolean; message_id?: string; error?: string }
interface ChannelAdapter {
  send(params: { instance_id: string; token: string; to_phone: string; text: string }): Promise<SendResult>
  parseWebhook(raw: unknown): NormalizedInbound | null
}

// ── ZApiAdapter ───────────────────────────────────────────────
const ZApiAdapter: ChannelAdapter = {
  async send({ instance_id, token, to_phone, text }) {
    const phone = to_phone.replace(/\D/g, '')
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${instance_id}/token/${token}/send-text`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, message: text }), signal: AbortSignal.timeout(10_000) }
      )
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      if (res.ok) return { ok: true, message_id: (body.zaapId ?? body.messageId ?? '') as string }
      return { ok: false, error: `Z-API ${res.status}: ${JSON.stringify(body)}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
  parseWebhook(raw) {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>
    if (p.isGroup === true) return null
    if (p.type && p.type !== 'ReceivedCallback') return null
    const phone = typeof p.phone === 'string' ? p.phone.replace(/\D/g, '') : null
    if (!phone) return null
    let text: string | null = null
    if (typeof p.text === 'string') text = p.text
    else if (p.text && typeof p.text === 'object') text = ((p.text as Record<string, unknown>).message as string) ?? null
    if (!text) return null
    return { from_phone: phone, text,
      provider_message_id: (p.messageId as string | undefined) ?? '',
      timestamp: new Date(typeof p.momment === 'number' ? p.momment : Date.now()).toISOString(),
      instance_id: (p.instanceId as string | undefined) ?? '' }
  },
}

// ── ChatProAdapter ────────────────────────────────────────────
// Credenciais via Secrets (CHATPRO_*) — não ficam na linha do canal
const ChatProAdapter: ChannelAdapter = {
  async send({ to_phone, text }) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chatpro-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_phone, message: text }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      if (res.ok && body.ok) return { ok: true, message_id: (body.message_id as string) ?? undefined }
      return { ok: false, error: `chatpro-send: ${JSON.stringify(body)}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
  parseWebhook(raw) {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>
    const phone = typeof p.phone === 'string' ? p.phone.replace(/\D/g, '') : null
    const text  = typeof p.body === 'string' ? p.body : typeof p.message === 'string' ? p.message : null
    if (!phone || !text) return null
    return { from_phone: phone, text,
      provider_message_id: (p.id as string | undefined) ?? '',
      timestamp: new Date().toISOString(), instance_id: 'chatpro' }
  },
}

// ── MetaAdapter ───────────────────────────────────────────────
const MetaAdapter: ChannelAdapter = {
  async send() { return { ok: false, error: 'MetaAdapter not implemented yet' } },
  parseWebhook() { return null },
}

// ── MockAdapter ───────────────────────────────────────────────
const MockAdapter: ChannelAdapter = {
  async send({ to_phone, text }) {
    const mockId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    await new Promise(r => setTimeout(r, 150))
    console.log(`[MockAdapter] 📨 MOCK → ${to_phone}\n  id: ${mockId}\n  body: "${text.slice(0,120)}…"`)
    return { ok: true, message_id: mockId }
  },
  parseWebhook(raw) {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>
    const phone = typeof p.phone === 'string' ? p.phone.replace(/\D/g, '') : null
    const text  = typeof p.text  === 'string' ? p.text : null
    if (!phone || !text) return null
    return { from_phone: phone, text,
      provider_message_id: `mock_in_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(), instance_id: 'mock' }
  },
}

function resolveAdapter(channelType: string): ChannelAdapter {
  switch (channelType) {
    case 'zapi': case 'z-api': return ZApiAdapter
    case 'chatpro':             return ChatProAdapter
    case 'meta_cloud':          return MetaAdapter
    case 'mock':                return MockAdapter
    default:
      console.warn(`[channel-dispatcher] channelType desconhecido: ${channelType} — usando ZApiAdapter`)
      return ZApiAdapter
  }
}

// ── Helpers ───────────────────────────────────────────────────
function backoffMs(attempt: number): number { return Math.pow(2, attempt) * 60_000 }
function resp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

// ── Main ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resp({ ok: true }, 204)

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json().catch(() => ({ trigger: 'cron' })) as { trigger: string; message_id?: string }

    if (body.trigger === 'direct' && body.message_id) {
      const result = await processQueueItem(sb, body.message_id)
      return resp({ ok: true, result })
    }

    const { data: items, error: fetchErr } = await sb
      .from('channel_dispatch_queue')
      .select('id')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(BATCH_SIZE)

    if (fetchErr) return resp({ ok: false, error: fetchErr.message }, 500)
    if (!items || items.length === 0) return resp({ ok: true, processed: 0, note: 'Nada na fila' })

    console.log(`[channel-dispatcher] Processando ${items.length} itens...`)
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

// ── processQueueItem ──────────────────────────────────────────
async function processQueueItem(
  sb:      ReturnType<typeof createClient>,
  queueId: string
): Promise<string> {

  const { data: item, error: itemErr } = await sb
    .from('channel_dispatch_queue')
    .select(`
      id, message_id, to_phone, content,
      attempt_count, max_attempts, status, channel_id,
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

  if (item.status !== 'pending') return item.status as string

  await sb.from('channel_dispatch_queue').update({ status: 'processing' }).eq('id', queueId).eq('status', 'pending')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = (item as any).church_whatsapp_channels as {
    channel_type: string; zapi_instance_id: string | null;
    zapi_token: string | null; active: boolean; session_status: string;
  } | null

  if (!channel || !channel.active) return await markFailed(sb, item, 'Canal inativo ou não encontrado')
  if (!['testing', 'active'].includes(channel.session_status)) {
    return await markFailed(sb, item, `Canal em estado inválido: ${channel.session_status}`)
  }

  const isChatPro = channel.channel_type === 'chatpro'
  const isMock    = channel.channel_type === 'mock'

  // ZApi: precisa de credenciais na linha do canal
  if (!isMock && !isChatPro && (!channel.zapi_instance_id || !channel.zapi_token)) {
    return await markFailed(sb, item, 'Credenciais Z-API ausentes no canal')
  }

  const adapter = resolveAdapter(channel.channel_type ?? 'zapi')
  const result  = await adapter.send({
    instance_id: channel.zapi_instance_id ?? 'mock',
    token:       channel.zapi_token       ?? 'mock',
    to_phone:    item.to_phone,
    text:        item.content,
  })

  const now = new Date().toISOString()

  if (result.ok) {
    await Promise.all([
      sb.from('channel_dispatch_queue').update({
        status: 'sent', attempt_count: item.attempt_count + 1,
        processed_at: now, provider_response: { message_id: result.message_id },
      }).eq('id', queueId),
      sb.from('conversation_messages').update({
        status: 'sent', provider_message_id: result.message_id ?? null,
      }).eq('id', item.message_id),
    ])
    console.log(`[channel-dispatcher] ${queueId} → sent (id: ${result.message_id})`)
    return 'sent'
  }

  return await markFailed(sb, item, result.error ?? 'provider error')
}

// ── markFailed ────────────────────────────────────────────────
async function markFailed(
  sb: ReturnType<typeof createClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any, err: string
): Promise<string> {
  const newCount = (item.attempt_count as number) + 1
  const now      = new Date().toISOString()

  if (newCount >= (item.max_attempts as number)) {
    await Promise.all([
      sb.from('channel_dispatch_queue').update({
        status: 'failed', attempt_count: newCount, processed_at: now, error_message: err,
      }).eq('id', item.id),
      sb.from('conversation_messages').update({
        status: 'failed', error_detail: err,
      }).eq('id', item.message_id),
    ])
    console.warn(`[channel-dispatcher] ${item.id} → failed (${newCount}x): ${err}`)
    return 'failed'
  }

  const nextAt = new Date(Date.now() + backoffMs(newCount)).toISOString()
  await sb.from('channel_dispatch_queue').update({
    status: 'pending', attempt_count: newCount, scheduled_at: nextAt, error_message: err,
  }).eq('id', item.id)
  console.log(`[channel-dispatcher] ${item.id} → reagendado ${nextAt} (tentativa ${newCount}): ${err}`)
  return 'rescheduled'
}
