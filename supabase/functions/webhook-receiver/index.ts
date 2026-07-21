// ============================================================
// Edge Function: webhook-receiver  v30b
// Único ponto de entrada para mensagens inbound de qualquer provider.
//
// POST /functions/v1/webhook-receiver
// verify_jwt = false
//
// Query params:
//   ?provider=chatpro&channel_id=UUID  → ChatPro (preferido)
//   ?provider=chatpro                  → ChatPro, busca canal ativo
//   ?provider=meta_cloud               → Meta Cloud API
//   (sem params)                       → auto-detect pelo payload
//
// v30 (Z-API descontinuada — instância morta):
//   ✅ GET hub.challenge handler (META_WEBHOOK_VERIFY_TOKEN)
//   ✅ parseMeta(): parser para payload Meta Cloud API
//   ✅ auto-detect: Meta Cloud + ChatPro apenas (Z-API removido por completo)
//   ✅ canal lookup: meta_phone_number_id (multi-tenant seguro)
//   ✅ HMAC-SHA256 signature validation (WA_APP_SECRET) — fail-open se ausente
//   ✅ payload não reconhecido → 200 + log "ignorado" (sem 500)
//
// v30b — FASE 1B (correções code-review):
//   ✅ Achado 1: instanceId removido (código morto pós-Z-API)
//   ✅ Achado 2: branch explícito provider='meta_cloud' em processInbound
//   ✅ Achado 3: parseMeta retorna NormalizedInbound[] — suporte a lote Meta
//   ✅ Achado 4: ownership='human' → mensagem gravada, triagem suprimida
//   ✅ Sugestão 5: log quando raw=null (body não é JSON válido)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// v30: HMAC-SHA256 validation para Meta Cloud (x-hub-signature-256)
// fail-open: se WA_APP_SECRET ausente, caller não invoca esta função
async function validateMetaSignature(rawBody: string, signature: string, appSecret: string): Promise<boolean> {
  if (!signature.startsWith('sha256=')) return false
  const receivedHash = signature.slice(7)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const computedHash = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  if (computedHash.length !== receivedHash.length) return false
  let mismatch = 0
  for (let i = 0; i < computedHash.length; i++) {
    mismatch |= computedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i)
  }
  return mismatch === 0
}

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

// v30: parser Meta Cloud API — retorna TODAS as mensagens de texto do lote
// Payload: { object:"whatsapp_business_account", entry:[{ changes:[{ field:"messages",
//   value:{ metadata:{phone_number_id}, messages:[{id,from,timestamp,type,text:{body}}] } }] }] }
// Achado 3 fix: suporte a lote — itera entry[].changes[].value.messages[].
// Mensagens não-texto: ignoradas com log. Retorna [] se nada processável.
function parseMeta(raw: unknown): NormalizedInbound[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const results: NormalizedInbound[] = []
  try {
    const p = raw as Record<string, unknown>
    if (p.object !== 'whatsapp_business_account') return []

    const entries = (p.entry as Array<Record<string, unknown>> | undefined) ?? []

    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>> | undefined) ?? []
      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined
        if (!value) continue

        const messages = value.messages as Array<Record<string, unknown>> | undefined
        if (!messages || messages.length === 0) {
          console.log('[webhook-receiver] Meta event sem messages (status update?):', change.field)
          continue
        }

        for (const msg of messages) {
          if (msg.type !== 'text') {
            console.log('[webhook-receiver] Meta message type não suportado no MVP:', msg.type)
            continue
          }

          const fromPhone = typeof msg.from === 'string' ? normalizePhone(msg.from) : null
          if (!fromPhone || fromPhone.length < 10) continue

          const textObj = msg.text as Record<string, unknown> | undefined
          const text    = typeof textObj?.body === 'string' ? textObj.body.trim() : null
          if (!text) continue

          const wamid = typeof msg.id === 'string' ? msg.id : ''

          // Meta Cloud: timestamp é STRING em segundos Unix
          const tsRaw = typeof msg.timestamp === 'string'
            ? parseInt(msg.timestamp, 10) * 1000
            : Date.now()

          results.push({
            from_phone:          fromPhone,
            text,
            provider_message_id: wamid,
            timestamp:           new Date(tsRaw).toISOString(),
          })
        }
      }
    }
  } catch (err) {
    console.warn('[webhook-receiver] parseMeta error:', err)
  }
  return results
}

// ── Main ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()

  // v30: GET hub.challenge — Meta Cloud webhook verification
  if (req.method === 'GET') {
    const url         = new URL(req.url)
    const mode        = url.searchParams.get('hub.mode')
    const token       = url.searchParams.get('hub.verify_token')
    const challenge   = url.searchParams.get('hub.challenge')
    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? ''
    if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
      console.log('[webhook-receiver] Meta hub.challenge verificado')
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return ok()
  }

  if (req.method !== 'POST') return ok()

  const url       = new URL(req.url)
  const provider  = url.searchParams.get('provider') ?? 'auto'
  const channelId = url.searchParams.get('channel_id') ?? null

  // v30: ler corpo como texto para preservar bytes crus (necessário para HMAC meta_cloud)
  const rawBody = await req.text().catch(() => '')
  const raw = rawBody
    ? (() => { try { return JSON.parse(rawBody) } catch { return null } })()
    : null

  // v30: Meta Cloud signature validation (HMAC-SHA256, x-hub-signature-256)
  // fail-open: se WA_APP_SECRET não configurado, loga aviso e continua
  const isMetaPayload = provider === 'meta_cloud'
    || (provider === 'auto'
        && raw && typeof raw === 'object' && !Array.isArray(raw)
        && (raw as Record<string, unknown>).object === 'whatsapp_business_account')

  if (isMetaPayload) {
    const appSecret = Deno.env.get('WA_APP_SECRET') ?? ''
    if (!appSecret) {
      console.warn('[webhook-receiver] WA_APP_SECRET ausente — meta signature check pulado (fail-open MVP)')
    } else {
      const signature = req.headers.get('x-hub-signature-256') ?? ''
      const valid = await validateMetaSignature(rawBody, signature, appSecret)
      if (!valid) {
        console.warn('[webhook-receiver] meta signature mismatch — 401')
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
  }

  // Responde 200 imediatamente (Meta/ChatPro não podem esperar timeout)
  void processInbound(raw, provider, channelId)
  return ok()
})

// ── processInbound ─────────────────────────────────────────
async function processInbound(
  raw:       unknown,
  provider:  string,
  channelId: string | null,
): Promise<void> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Sugestão 5: log explícito quando body não é JSON válido
    if (!raw) {
      console.warn('[webhook-receiver] body não é JSON válido — ignorado')
      return
    }

    // ── 1. Parse payload ──────────────────────────────────
    let normalized: NormalizedInbound | null = null
    let resolvedProvider = provider

    if (provider === 'chatpro') {
      normalized = parseChatPro(raw)
    } else if (provider === 'meta_cloud') {
      // Achado 2 fix: branch explícito simétrico ao chatpro — parsed abaixo como array
      resolvedProvider = 'meta_cloud'
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
      // Objeto com phone + body/message → ChatPro legado / flat
      } else if (typeof p.phone === 'string' && (typeof p.body === 'string' || typeof p.message === 'string')) {
        normalized = parseChatPro(raw)
        resolvedProvider = 'chatpro'
      // v30: Meta Cloud — objeto com object='whatsapp_business_account'
      } else if (typeof p.object === 'string' && p.object === 'whatsapp_business_account') {
        resolvedProvider = 'meta_cloud'
        // parsed abaixo como array (suporte a lote Meta)
      } else {
        // Payload não reconhecido como Meta Cloud nem ChatPro — ignorar
        console.log('[webhook-receiver] payload não reconhecido — ignorado:', JSON.stringify(raw).slice(0, 120))
        return
      }
    }

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
    } else if (resolvedProvider === 'meta_cloud') {
      // v30: identifica canal pelo meta_phone_number_id do payload
      // Multi-tenant seguro: phone_number_id é único por número/WABA
      const phoneNumberId = (() => {
        try {
          const p = raw as Record<string, unknown>
          const value = ((p.entry as Array<Record<string, unknown>>)?.[0]
            ?.changes as Array<Record<string, unknown>>)?.[0]
            ?.value as Record<string, unknown> | undefined
          return (value?.metadata as Record<string, unknown> | undefined)
            ?.phone_number_id as string | undefined
        } catch { return undefined }
      })()

      if (phoneNumberId) {
        const { data } = await sb
          .from('church_whatsapp_channels')
          .select('id, church_id, channel_type')
          .eq('meta_phone_number_id', phoneNumberId)
          .eq('active', true)
          .maybeSingle()
        channel = data
        if (!channel) {
          console.warn(`[webhook-receiver] meta_cloud: canal não encontrado para phone_number_id=${phoneNumberId}`)
        }
      } else {
        console.warn('[webhook-receiver] meta_cloud: phone_number_id ausente no payload')
      }
    } else if (resolvedProvider === 'chatpro') {
      // ChatPro: canal deve ser resolvido pelo channelId na URL (isolamento multi-tenant)
      // R10: removido fallback .limit(1) sem church_id — risco cross-tenant crítico
    }

    if (!channel) {
      console.warn(`[webhook-receiver] canal não encontrado (provider=${resolvedProvider}, channel_id=${channelId})`)
      return
    }

    const { id: resolvedChannelId, church_id: churchId } = channel

    // ── Meta Cloud: processar TODAS as mensagens do lote ──────────
    // Achado 3 fix: parseMeta agora retorna NormalizedInbound[] — loop sobre cada mensagem.
    // Dedup por provider_message_id (wamid) protege contra duplicatas em redelivery.
    if (resolvedProvider === 'meta_cloud') {
      const allMessages = parseMeta(raw)
      if (allMessages.length === 0) {
        console.log('[webhook-receiver] meta_cloud: nenhuma mensagem de texto processável no webhook')
        return
      }
      for (const nm of allMessages) {
        await processNormalizedOne(sb, nm, resolvedProvider, resolvedChannelId, churchId)
      }
      return
    }

    // ── ChatPro: mensagem única ────────────────────────────────────
    if (!normalized) {
      console.log(`[webhook-receiver] payload ignorado (provider=${resolvedProvider}):`, JSON.stringify(raw).slice(0, 200))
      return
    }
    console.log(`[webhook-receiver] inbound from=${normalized.from_phone} provider=${resolvedProvider}`)
    await processNormalizedOne(sb, normalized, resolvedProvider, resolvedChannelId, churchId)

  } catch (err) {
    console.error('[webhook-receiver] unhandled error:', err)
  }
}

// ── processNormalizedOne ────────────────────────────────────
// Etapas 3-8: dedup → pessoa → conversa → mensagem → triagem.
// Reutilizado por ChatPro (1 msg) e Meta Cloud (N msgs em lote — Achado 3).
// Achado 4: ownership='human' → mensagem gravada, triagem SUPRIMIDA.
async function processNormalizedOne(
  sb:                ReturnType<typeof createClient>,
  normalized:        NormalizedInbound,
  resolvedProvider:  string,
  resolvedChannelId: string,
  churchId:          string,
): Promise<void> {
  // ── 3. Deduplicar ─────────────────────────────────────
  if (!normalized.provider_message_id?.trim()) {
    console.warn('[webhook-receiver] rejeitado — provider_message_id vazio', {
      from_phone: normalized.from_phone,
      provider:   resolvedProvider,
    })
    return
  }
  const { count } = await sb
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('provider_message_id', normalized.provider_message_id)
  if ((count ?? 0) > 0) {
    console.log(`[webhook-receiver] duplicada, ignorando: ${normalized.provider_message_id}`)
    return
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
        // LGPD: base legal = legítimo interesse (Art. 7º, IX, LGPD).
        lgpd_consent:    false,
        lgpd_consent_at: null,
      })
      .select('id, first_name, last_name')
      .single()

    if (personErr || !newPerson) {
      console.warn('[webhook-receiver] erro ao criar pessoa:', personErr?.message)
    } else {
      person = newPerson
      console.log(`[webhook-receiver] nova pessoa criada: ${person.id}`)

      // C2 gap fix: disparar jornada de acolhimento (fire-and-forget)
      const dispatchUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-person-event`
      fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ person_id: newPerson.id, event: 'person_created' }),
        signal: AbortSignal.timeout(5_000),
      }).catch(e => console.warn('[webhook-receiver] dispatch-person-event falhou:', e))
    }
  }

  // ── 5. Conversa (preserva ownership='human') ──────────
  // Achado 4 fix: SELECT first para detectar se ownership='human' (pastor assumiu).
  // Se existente → atualizar só preview (NÃO sobrescrever ownership/status).
  // Se nova       → INSERT com ownership='agent'.
  const { data: existingConv } = await sb
    .from('conversations')
    .select('id, ownership, agent_slug, person_id')
    .eq('church_id', churchId)
    .eq('channel_id', resolvedChannelId)
    .eq('contact_phone', normalized.from_phone)
    .maybeSingle()

  let conv: { id: string; ownership: string; agent_slug: string | null; person_id: string | null } | null = null

  if (existingConv) {
    // Existente: preservar ownership; só atualizar campos de preview
    const { data: updated, error: updateErr } = await sb
      .from('conversations')
      .update({
        last_message_at:      normalized.timestamp,
        last_message_preview: normalized.text.slice(0, 120),
        ...(person?.id && !existingConv.person_id ? { person_id: person.id } : {}),
      })
      .eq('id', existingConv.id)
      .select('id, ownership, agent_slug, person_id')
      .single()

    if (updateErr || !updated) {
      console.error('[webhook-receiver] erro update conversation:', updateErr?.message)
      return
    }
    conv = updated
  } else {
    // Nova conversa: criar com ownership='agent'
    const { data: newConv, error: insertErr } = await sb
      .from('conversations')
      .insert({
        church_id:            churchId,
        channel_id:           resolvedChannelId,
        contact_phone:        normalized.from_phone,
        person_id:            person?.id ?? null,
        status:               'open',
        ownership:            'agent',
        channel_type:         'whatsapp',
        last_message_at:      normalized.timestamp,
        last_message_preview: normalized.text.slice(0, 120),
      })
      .select('id, ownership, agent_slug, person_id')
      .single()

    if (insertErr || !newConv) {
      console.error('[webhook-receiver] erro insert conversation:', insertErr?.message)
      return
    }
    conv = newConv
  }

  // ── 6. INSERT mensagem inbound ────────────────────────
  // Mensagem SEMPRE gravada — pastor precisa ver o histórico, mesmo em ownership='human'
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

  // ── 7. Incrementar unread_count ──────────────────────
  const { data: curConv } = await sb
    .from('conversations')
    .select('unread_count')
    .eq('id', conv.id)
    .maybeSingle()

  await sb.from('conversations').update({
    unread_count: (curConv?.unread_count ?? 0) + 1,
  }).eq('id', conv.id)

  console.log(`[webhook-receiver] ✅ inbound gravado: msg=${msg.id} conv=${conv.id} person=${person?.id ?? 'n/a'} from=${normalized.from_phone}`)

  // ── 8. Triagem ────────────────────────────────────────
  // Achado 4 fix: ownership='human' → robô em silêncio.
  // O pastor assumiu esta conversa; o agente não volta sozinho.
  if (conv.ownership === 'human') {
    console.log(`[webhook-receiver] ownership=human — triagem suprimida conv=${conv.id}`)
    return
  }

  fetch(`${SUPABASE_URL}/functions/v1/agent-haiku-triagem`, {
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
      agent_slug:      conv.agent_slug ?? null,
      person_id:       person?.id ?? null,
      inbound_text:    normalized.text,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(err => {
    console.warn('[webhook-receiver] agent-haiku-triagem call falhou (não crítico):', (err as Error).message)
  })
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}
