// ============================================================
// _shared/channel-adapter.ts
// Abstração de provider de canal de mensagens.
//
// Qualquer EF que precise enviar ou parsear inbound importa daqui.
// Trocar Z-API por Meta Cloud API ou Evolution = implementar
// ChannelAdapter e atualizar resolveAdapter(). Zero mudança no resto.
//
// Providers implementados:
//   ZApiAdapter   — https://z-api.io (Sprint 3)
//   MetaAdapter   — Meta Cloud API (Sprint futuro — stub)
// ============================================================

// ── Tipos públicos ───────────────────────────────────────────

export interface NormalizedInbound {
  from_phone:          string   // E.164 sem '+': "5521999999999"
  text:                string
  provider_message_id: string
  timestamp:           string   // ISO 8601
  instance_id:         string   // identifica o canal/número
}

export interface SendResult {
  ok:          boolean
  message_id?: string   // provider's ID para tracking
  error?:      string
}

export interface ChannelAdapter {
  send(params: {
    instance_id: string
    token:       string
    to_phone:    string
    text:        string
  }): Promise<SendResult>

  parseWebhook(raw: unknown): NormalizedInbound | null
}

// ── ZApiAdapter ──────────────────────────────────────────────
//
// Endpoints Z-API usados:
//   POST /instances/{INSTANCE_ID}/token/{TOKEN}/send-text
//     body: { phone: string (só dígitos), message: string }
//     200 ok: { zaapId, messageId, ... }
//
//   Webhook inbound (Z-API → nosso webhook-receiver):
//     { phone, text: { message }, messageId, instanceId, ... }
//
// Docs: https://developer.z-api.io/

export const ZApiAdapter: ChannelAdapter = {
  async send({ instance_id, token, to_phone, text }) {
    // Z-API rejeita '+' e traços — só dígitos
    const phone = to_phone.replace(/\D/g, '')

    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${instance_id}/token/${token}/send-text`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone, message: text }),
          signal:  AbortSignal.timeout(10_000),
        }
      )

      const body = await res.json().catch(() => ({})) as Record<string, unknown>

      if (res.ok) {
        // Z-API retorna zaapId (id interno) e messageId (id WhatsApp)
        const messageId = (body.zaapId ?? body.messageId ?? '') as string
        return { ok: true, message_id: messageId }
      }

      return {
        ok:    false,
        error: `Z-API ${res.status}: ${JSON.stringify(body)}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  },

  parseWebhook(raw) {
    // Z-API webhook payload shape (mensagens recebidas):
    // {
    //   phone:       "5521999999999",
    //   text:        { message: "Olá" },   ← OU string simples
    //   messageId:   "ABC123",
    //   instanceId:  "INST456",
    //   momment:     1714000000000,        ← timestamp ms
    //   type:        "ReceivedCallback",
    //   isGroup:     false,
    //   ...
    // }
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>

    // Ignora mensagens de grupos e callbacks que não são mensagens recebidas
    if (p.isGroup === true) return null
    if (p.type && p.type !== 'ReceivedCallback') return null

    const phone = typeof p.phone === 'string' ? p.phone.replace(/\D/g, '') : null
    if (!phone) return null

    // Texto pode vir como objeto { message } ou string direta
    let text: string | null = null
    if (typeof p.text === 'string') {
      text = p.text
    } else if (p.text && typeof p.text === 'object') {
      text = ((p.text as Record<string, unknown>).message as string) ?? null
    }
    if (!text) return null

    const messageId   = (p.messageId  as string | undefined) ?? ''
    const instanceId  = (p.instanceId as string | undefined) ?? ''
    const momentMs    = typeof p.momment === 'number' ? p.momment : Date.now()

    return {
      from_phone:          phone,
      text,
      provider_message_id: messageId,
      timestamp:           new Date(momentMs).toISOString(),
      instance_id:         instanceId,
    }
  },
}

// ── MetaAdapter (stub — Sprint futuro) ───────────────────────
export const MetaAdapter: ChannelAdapter = {
  async send() {
    return { ok: false, error: 'MetaAdapter not implemented yet' }
  },
  parseWebhook() {
    return null
  },
}

// ── resolveAdapter ───────────────────────────────────────────
// Mapeia channel_type do banco para o adapter correto.
// Sprint 3: só zapi. Sprint futuro: meta_cloud, evolution.

export function resolveAdapter(channelType: string): ChannelAdapter {
  switch (channelType) {
    case 'zapi':
    case 'z-api':
      return ZApiAdapter
    case 'meta_cloud':
      return MetaAdapter
    default:
      // Fallback seguro: tenta Z-API e loga aviso
      console.warn(`[channel-adapter] channelType desconhecido: ${channelType} — usando ZApiAdapter`)
      return ZApiAdapter
  }
}
