// ============================================================
// Edge Function: message-enqueue
// Frente M Fase 1 — Camada de transporte de mensagens.
//
// POST /functions/v1/message-enqueue
// verify_jwt = false — chamada interna via service_role Bearer
//
// Recebe pedido de enfileiramento, resolve driver a partir de
// messaging_config, insere em message_outbox com status='queued'.
//
// Retorna: { ok, message_id, driver, fallback_used }
//
// TODO FUTURO — quando Frente M Fase 2 acontecer:
// 1. Onboarding de igreja nova deve criar messaging_config default automaticamente
//    (atualmente só igrejas existentes em 28/04/2026 têm seed)
// 2. Driver wa_me_link real (gera link wa.me e marca pending_user_action)
// 3. Migrar painel /admin/comunicacao para /comunicacao (escopado por igreja via RLS)
//    quando entregar valor operacional para o pastor
// 4. Worker assíncrono para reprocessar status='queued' com next_attempt_at vencido
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
  'https://ekthosai.net',
  'https://www.ekthosai.net',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  }
}

// Canais e drivers permitidos (espelho dos CHECK constraints)
const VALID_CHANNELS = new Set(['whatsapp', 'sms', 'email', 'in_app'])

Deno.serve(async (req: Request) => {
  const origin  = req.headers.get('origin')
  const cors    = corsHeaders(origin)
  const jsonHdr = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHdr })
  }

  // ── Auth: apenas service_role ─────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (bearerToken !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHdr })
  }

  try {
    // ── 1. Parse e validação do payload ───────────────────
    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: jsonHdr })
    }

    const churchId       = typeof payload.church_id      === 'string' ? payload.church_id.trim()      : null
    const personId       = typeof payload.person_id      === 'string' ? payload.person_id.trim()      : null
    const channel        = typeof payload.channel        === 'string' ? payload.channel.trim()        : null
    const toAddress      = typeof payload.to_address     === 'string' ? payload.to_address.trim()     : null
    const bodyText       = typeof payload.body_text      === 'string' ? payload.body_text.trim()      : null
    const source         = typeof payload.source         === 'string' ? payload.source.trim()         : null
    const sourceEvent    = typeof payload.source_event   === 'string' ? payload.source_event.trim()   : null
    const sourceRefId    = typeof payload.source_ref_id  === 'string' ? payload.source_ref_id.trim()  : null
    const bodyTemplateId = typeof payload.body_template_id === 'string' ? payload.body_template_id.trim() : null
    const variables      = payload.variables && typeof payload.variables === 'object' && !Array.isArray(payload.variables)
      ? payload.variables as Record<string, unknown>
      : {}

    if (!churchId || !channel || !toAddress || !bodyText || !source) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: church_id, channel, to_address, body_text, source' }),
        { status: 400, headers: jsonHdr }
      )
    }

    if (!VALID_CHANNELS.has(channel)) {
      return new Response(
        JSON.stringify({ error: `Canal inválido: ${channel}. Aceitos: whatsapp, sms, email, in_app` }),
        { status: 400, headers: jsonHdr }
      )
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 2. Resolver driver via messaging_config ───────────
    let driver = 'mock_internal'
    let fallbackUsed = false

    const { data: config } = await sb
      .from('messaging_config')
      .select('driver')
      .eq('church_id', churchId)
      .eq('channel', channel)
      .eq('is_active', true)
      .maybeSingle()

    if (config?.driver) {
      driver = config.driver as string
    } else {
      fallbackUsed = true
      console.warn(
        `[message-enqueue] Sem messaging_config para church=${churchId} channel=${channel}. Usando fallback mock_internal.`
      )
    }

    // ── 3. INSERT em message_outbox ───────────────────────
    const { data: inserted, error: insertErr } = await sb
      .from('message_outbox')
      .insert({
        church_id:        churchId,
        person_id:        personId ?? null,
        channel,
        driver,
        to_address:       toAddress,
        body_text:        bodyText,
        body_template_id: bodyTemplateId ?? null,
        variables,
        source,
        source_event:     sourceEvent ?? null,
        source_ref_id:    sourceRefId ?? null,
        status:           'queued',
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      console.error('[message-enqueue] INSERT message_outbox falhou:', insertErr?.message)

      await sb.from('audit_logs').insert({
        church_id:   churchId,
        entity_type: 'message',
        action:      'message_enqueue_failed',
        actor_type:  'system',
        actor_id:    'message-enqueue',
        payload:     { channel, driver, source, error: insertErr?.message ?? 'unknown' },
        model_used:  null,
        tokens_used: 0,
      }).catch(() => {/* silencioso */})

      return new Response(
        JSON.stringify({ error: 'Erro interno ao enfileirar mensagem' }),
        { status: 500, headers: jsonHdr }
      )
    }

    const messageId = (inserted as { id: string }).id

    // ── 4. audit_log de sucesso ───────────────────────────
    await sb.from('audit_logs').insert({
      church_id:   churchId,
      entity_type: 'message',
      entity_id:   messageId,
      action:      'message_enqueued',
      actor_type:  'system',
      actor_id:    'message-enqueue',
      payload:     { message_id: messageId, channel, driver, fallback_used: fallbackUsed, source },
      model_used:  null,
      tokens_used: 0,
    }).catch(() => {/* falha de audit não bloqueia */})

    console.log(`[message-enqueue] OK message_id=${messageId} driver=${driver} fallback=${fallbackUsed}`)

    return new Response(
      JSON.stringify({ ok: true, message_id: messageId, driver, fallback_used: fallbackUsed }),
      { status: 200, headers: jsonHdr }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[message-enqueue] UNHANDLED:', msg)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: jsonHdr }
    )
  }
})
