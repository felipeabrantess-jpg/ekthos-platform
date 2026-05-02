// ============================================================
// Edge Function: webhook-receiver  v2
// Único ponto de entrada para mensagens inbound de qualquer provider.
//
// POST /functions/v1/webhook-receiver
// verify_jwt = false
//
// Query params:
//   ?provider=chatpro&channel_id=UUID  → ChatPro (preferido)
//   ?provider=chatpro                  → ChatPro, busca canal ativo
//   ?provider=zapi&instance_id=INST    → Z-API (legado)
//   (sem params)                       → auto-detect pelo payload
//
// Payload ChatPro (inbound text message):
//   { phone: "5521...", body: "texto", id: "msg_id" }
//   ou { phone: "5521...", message: "texto", id: "msg_id" }
//
// Regras desta sprint (A2):
//   ✅ Gravar mensagem inbound em conversation_messages (direction=inbound)
//   ✅ Identificar/criar pessoa por from_phone
//   ✅ Upsert conversation com person_id vinculado
//   🚫 NÃO chamar conversation-router / NÃO responder automaticamente
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── Normalizar telefone ────────────────────────────────────
// Remove tudo que não é dígito, garante código Brasil
function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return ''
  // Remove @s.whatsapp.net, @c.us e similar
  const digits = raw.replace(/@[\w.]+$/, '').replace(/\D/g, '')
  if (!digits) return ''
  // Se não começar com 55, assume Brasil
  return digits.startsWith('55') ? digits : `55${digits}`
}

// ── Parse ChatPro payload ──────────────────────────────────
interface NormalizedInbound {
  from_phone:          string
  text:                string
  provider_message_id: string
  timestamp:           string
}

function parseChatPro(raw: unknown): NormalizedInbound | null {
  if (!raw || typeof raw !== 'object') return null

  // ── Formato 1: ChatPro API v5 — array ["Msg", {cmd, from, body, ...}] ──
  // ChatPro v5 envia um array onde raw[1] é o objeto da mensagem
  if (Array.isArray(raw)) {
    if (raw.length < 2 || !raw[1] || typeof raw[1] !== 'object') return null
    const p = raw[1] as Record<string, unknown>

    // ACK events têm campo 'ack' — ignorar
    if (typeof p.ack === 'number') return null
    // Ignorar mensagens enviadas pelo próprio número (fromMe)
    if (p.fromMe === true) return null
    // Precisa ter 'cmd' (tipo de evento) para ser mensagem válida
    if (p.cmd !== undefined && typeof p.cmd === 'string' && !['chat', 'message', 'text'].includes(p.cmd)) {
      // cmd presente mas não é de mensagem de texto → ignorar
      // (mas se cmd não existe, tentar processar assim mesmo)
    }

    // Telefone: campo 'from' com formato JID (ex: 5521966487878@s.whatsapp.net)
    const rawPhone = typeof p.from === 'string' ? p.from
                   : typeof p.phone === 'string' ? p.phone
                   : null
    if (!rawPhone) return null
    const phone = normalizePhone(rawPhone)
    if (!phone || phone.length < 10) return null

    const text = typeof p.body    === 'string' ? p.body.trim()
               : typeof p.message === 'string' ? p.message.trim()
               : null
    if (!text) return null

    const msgId    = typeof p.id === 'string' ? p.id : ''
    const tsRaw    = typeof p.t  === 'number' ? p.t * 1000 : Date.now()
    const timestamp = new Date(tsRaw).toISOString()

    return { from_phone: phone, text, provider_message_id: msgId, timestamp }
  }

  const p = raw as Record<string, unknown>

  // ── Formato 2: ChatPro Chat — {event, message_data: {message, number, from_me}} ──
  if (typeof p.event === 'string' && p.event === 'received_message' && p.message_data) {
    const md = p.message_data as Record<string, unknown>
    if (md.from_me === true) return null

    const rawPhone = typeof md.number      === 'string' ? md.number
                   : typeof md.participant === 'string' ? md.participant
                   : null
    if (!rawPhone) return null
    const phone = normalizePhone(rawPhone)
    if (!phone || phone.length < 10) return null

    const text = typeof md.message === 'string' ? md.message.trim() : null
    if (!text) return null

    const msgId    = typeof md.id === 'string' ? md.id : ''
    const tsRaw    = typeof md.ts_receive === 'number' ? md.ts_receive * 1000 : Date.now()
    const timestamp = new Date(tsRaw).toISOString()

    return { from_phone: phone, text, provider_message_id: msgId, timestamp }
  }

  // ── Formato 3: flat legado {phone, body/message, fromMe, id, t} ──
  if (p.fromMe === true) return null
  // ACK events: têm campo 'ack'
  if (typeof p.ack === 'number') return null

  const rawPhone = typeof p.phone === 'string' ? p.phone
                 : typeof p.from  === 'string' ? p.from
                 : null
  if (!rawPhone) return null
  const phone = normalizePhone(rawPhone)
  if (!phone || phone.length < 10) return null

  const text = typeof p.body    === 'string' ? p.body.trim()
             : typeof p.message === 'string' ? p.message.trim()
             : null
  if (!text) return null

  const msgId    = typeof p.id === 'string' ? p.id : ''
  const tsRaw    = typeof p.t  === 'number' ? p.t * 1000 : Date.now()
  const timestamp = new Date(tsRaw).toISOString()

  return { from_phone: phone, text, provider_message_id: msgId, timestamp }
}

function parseZApi(raw: unknown): NormalizedInbound | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>

  // Filtrar eventos que não são mensagens recebidas
  if (p.isGroup === true) return null
  // fromMe=true → mensagem enviada por nós (ACK/status de entrega) → ignorar
  if (p.fromMe === true) return null
  // Evento de notificação de sistema (ex: CHAT_LABEL_ASSOCIATION) → ignorar
  if (p.notification !== undefined) return null
  // type presente mas não é ReceivedCallback → ignorar (DeliveryCallback, ReadCallback, etc.)
  if (p.type && p.type !== 'ReceivedCallback') return null

  // Remetente: campo 'phone' (número de quem enviou)
  const phone = typeof p.phone === 'string' ? normalizePhone(p.phone) : null
  if (!phone || phone.length < 12) return null

  // Texto: Z-API envia text.message (objeto aninhado) ou text direto (string)
  let text: string | null = null
  if (typeof p.text === 'string') text = p.text.trim()
  else if (p.text && typeof p.text === 'object')
    text = (((p.text as Record<string, unknown>).message as string) ?? '').trim() || null
  if (!text) return null

  return {
    from_phone:          phone,
    text,
    provider_message_id: (p.messageId as string | undefined) ?? '',
    // Z-API usa campo 'momment' (typo deles) em milissegundos
    timestamp:           new Date(typeof p.momment === 'number' ? p.momment : Date.now()).toISOString(),
  }
}

// ── Main ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS' || req.method === 'GET') return ok()
  if (req.method !== 'POST') return ok()

  const url      = new URL(req.url)
  const provider = url.searchParams.get('provider') ?? 'auto'
  const channelId = url.searchParams.get('channel_id') ?? null   // UUID direto (chatpro)
  const instanceId = url.searchParams.get('instance_id') ?? ''  // zapi legado

  const raw = await req.json().catch(() => null)

  // ── DEBUG TEMPORÁRIO: capturar formato real do ChatPro ────
  console.log('[webhook-receiver] FULL PAYLOAD:', JSON.stringify(raw))
  console.log('[webhook-receiver] HEADERS:', JSON.stringify({
    'content-type': req.headers.get('content-type'),
    'user-agent':   req.headers.get('user-agent'),
    'x-forwarded-for': req.headers.get('x-forwarded-for'),
  }))
  console.log('[webhook-receiver] URL:', req.url)
  // ── FIM DEBUG ─────────────────────────────────────────────

  // Responde 200 imediatamente (ChatPro não pode esperar timeout)
  void processInbound(raw, provider, channelId, instanceId)
  return ok()
})

// ── processInbound ─────────────────────────────────────────
async function processInbound(
  raw:        unknown,
  provider:   string,
  channelId:  string | null,
  instanceId: string,
): Promise<void> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    if (!raw) return

    // ── 1. Parse payload ──────────────────────────────────
    let normalized: NormalizedInbound | null = null
    let resolvedProvider = provider

    if (provider === 'chatpro') {
      normalized = parseChatPro(raw)
    } else if (provider === 'zapi' || provider === 'z-api') {
      normalized = parseZApi(raw)
      resolvedProvider = 'zapi'
    } else {
      // Auto-detect
      const p = raw as Record<string, unknown>
      // Array ["Msg", {...}] → ChatPro API v5
      if (Array.isArray(raw)) {
        normalized = parseChatPro(raw)
        resolvedProvider = 'chatpro'
      // Objeto com event=received_message → ChatPro Chat
      } else if (typeof p.event === 'string' && p.event === 'received_message') {
        normalized = parseChatPro(raw)
        resolvedProvider = 'chatpro'
      // Z-API: type=ReceivedCallback + phone (sem @suffix) + text
      } else if (typeof p.type === 'string' && p.type === 'ReceivedCallback') {
        normalized = parseZApi(raw)
        resolvedProvider = 'zapi'
      // Objeto com phone + body/message → ChatPro legado / flat
      } else if (typeof p.phone === 'string' && (typeof p.body === 'string' || typeof p.message === 'string')) {
        normalized = parseChatPro(raw)
        resolvedProvider = 'chatpro'
      } else {
        // Fallback: tentar Z-API (formato mais comum)
        normalized = parseZApi(raw)
        resolvedProvider = 'zapi'
      }
    }

    if (!normalized) {
      console.log(`[webhook-receiver] payload ignorado (provider=${resolvedProvider}):`, JSON.stringify(raw).slice(0, 200))
      return
    }

    console.log(`[webhook-receiver] inbound from=${normalized.from_phone} provider=${resolvedProvider}`)

    // ── 2. Identificar canal ──────────────────────────────
    let channel: { id: string; church_id: string; channel_type: string } | null = null

    if (channelId) {
      // Canal informado diretamente na URL
      const { data } = await sb
        .from('church_whatsapp_channels')
        .select('id, church_id, channel_type')
        .eq('id', channelId)
        .eq('active', true)
        .maybeSingle()
      channel = data
    } else if (resolvedProvider === 'zapi') {
      if (instanceId) {
        // Z-API com instance_id explícito na URL: busca precisa
        const { data } = await sb
          .from('church_whatsapp_channels')
          .select('id, church_id, channel_type')
          .eq('zapi_instance_id', instanceId)
          .eq('active', true)
          .maybeSingle()
        channel = data
      }
      if (!channel) {
        // Fallback: busca o canal zapi ativo (instância única por projeto nessa sprint)
        // Também tenta extrair instanceId do próprio payload Z-API
        const payloadInstanceId = raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>).instanceId as string | undefined
          : undefined
        const query = sb
          .from('church_whatsapp_channels')
          .select('id, church_id, channel_type')
          .eq('channel_type', 'zapi')
          .eq('active', true)
        if (payloadInstanceId) {
          const { data } = await query.eq('zapi_instance_id', payloadInstanceId).maybeSingle()
          channel = data
        }
        if (!channel) {
          const { data } = await sb
            .from('church_whatsapp_channels')
            .select('id, church_id, channel_type')
            .eq('channel_type', 'zapi')
            .eq('active', true)
            .limit(1)
            .maybeSingle()
          channel = data
        }
      }
    } else if (resolvedProvider === 'chatpro') {
      // ChatPro: busca canal chatpro ativo (um por projeto nessa sprint)
      const { data } = await sb
        .from('church_whatsapp_channels')
        .select('id, church_id, channel_type')
        .eq('channel_type', 'chatpro')
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      channel = data
    }

    if (!channel) {
      console.warn(`[webhook-receiver] canal não encontrado (provider=${resolvedProvider}, channel_id=${channelId}, instance_id=${instanceId})`)
      return
    }

    const { id: resolvedChannelId, church_id: churchId } = channel

    // ── 3. Deduplicar ─────────────────────────────────────
    if (normalized.provider_message_id) {
      const { count } = await sb
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('provider_message_id', normalized.provider_message_id)
      if ((count ?? 0) > 0) {
        console.log(`[webhook-receiver] duplicada, ignorando: ${normalized.provider_message_id}`)
        return
      }
    }

    // ── 4. Identificar / criar pessoa ─────────────────────
    let { data: person } = await sb
      .from('people')
      .select('id, first_name, last_name')
      .eq('church_id', churchId)
      .eq('phone', normalized.from_phone)
      .maybeSingle()

    if (!person) {
      const { data: newPerson, error: personErr } = await sb
        .from('people')
        .insert({
          church_id:    churchId,
          first_name:   'Contato',
          last_name:    normalized.from_phone.slice(-4),
          phone:        normalized.from_phone,
          person_stage: 'visitante',
          observacoes_pastorais: 'Cadastrado automaticamente via WhatsApp inbound',
        })
        .select('id, first_name, last_name')
        .single()

      if (personErr || !newPerson) {
        console.warn('[webhook-receiver] erro ao criar pessoa:', personErr?.message)
        // Continuar sem person_id em vez de abortar
      } else {
        person = newPerson
        console.log(`[webhook-receiver] nova pessoa criada: ${person.id}`)
      }
    }

    // ── 5. Upsert conversation ────────────────────────────
    const { data: conv, error: convErr } = await sb
      .from('conversations')
      .upsert(
        {
          church_id:            churchId,
          channel_id:           resolvedChannelId,
          contact_phone:        normalized.from_phone,
          person_id:            person?.id ?? null,
          status:               'open',
          ownership:            'agent',
          channel_type:         'whatsapp',
          last_message_at:      normalized.timestamp,
          last_message_preview: normalized.text.slice(0, 120),
        },
        { onConflict: 'church_id,channel_id,contact_phone', ignoreDuplicates: false }
      )
      .select('id, ownership, agent_slug, person_id')
      .single()

    if (convErr || !conv) {
      console.error('[webhook-receiver] erro upsert conversation:', convErr?.message)
      return
    }

    // Garantir person_id linkado (pode ter sido criado agora)
    if (person?.id && !conv.person_id) {
      await sb.from('conversations')
        .update({ person_id: person.id })
        .eq('id', conv.id)
    }

    // ── 6. INSERT mensagem inbound ────────────────────────
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
        status:              'delivered',
      })
      .select('id')
      .single()

    if (msgErr || !msg) {
      console.error('[webhook-receiver] erro INSERT message:', msgErr?.message)
      return
    }

    // ── 7. Atualizar preview + unread_count ───────────────
    // Fetch atual do unread_count para incrementar (não-atômico, mas ok para esta sprint)
    const { data: curConv } = await sb
      .from('conversations')
      .select('unread_count')
      .eq('id', conv.id)
      .maybeSingle()

    await sb.from('conversations').update({
      last_message_at:      normalized.timestamp,
      last_message_preview: normalized.text.slice(0, 120),
      unread_count:         (curConv?.unread_count ?? 0) + 1,
    }).eq('id', conv.id)

    console.log(`[webhook-receiver] ✅ inbound gravado: msg=${msg.id} conv=${conv.id} person=${person?.id ?? 'n/a'} from=${normalized.from_phone}`)

  } catch (err) {
    console.error('[webhook-receiver] unhandled error:', err)
  }
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}
