// ============================================================
// Edge Function: message-dispatch
// Frente M Fase 1 — Processa uma mensagem da outbox.
//
// POST /functions/v1/message-dispatch
// verify_jwt = false — chamada interna via service_role Bearer
//
// Body: { message_id: string }
//
// Lógica:
//   1. Busca mensagem com status queued|dispatching
//   2. Marca dispatching + incrementa attempts
//   3. Executa driver (switch interno)
//   4. Atualiza status final (sent / failed / pending_user_action)
//   5. audit_log
//
// Drivers implementados nesta fase:
//   mock_internal     — sempre retorna sent (mock para testes)
//   wa_me_link        — placeholder, retorna pending_user_action
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

// ── Tipo de resultado de driver ───────────────────────────────
interface DispatchResult {
  status: 'sent' | 'failed' | 'pending_user_action'
  driver_response?: Record<string, unknown>
  driver_message_id?: string
  error?: string
}

// ── Driver: mock_internal ─────────────────────────────────────
async function dispatch_mock_internal(message: {
  id: string
  to_address: string
  body_text: string
}): Promise<DispatchResult> {
  return {
    status: 'sent',
    driver_response: {
      mock:            true,
      timestamp:       new Date().toISOString(),
      message_preview: message.body_text.substring(0, 100),
      to:              message.to_address,
    },
    driver_message_id: `mock_${crypto.randomUUID()}`,
  }
}

// ── Driver: wa_me_link (placeholder Fase 2) ───────────────────
async function dispatch_wa_me_link_placeholder(_message: {
  id: string
  to_address: string
  body_text: string
}): Promise<DispatchResult> {
  return {
    status: 'pending_user_action',
    driver_response: {
      placeholder: true,
      note:        'Driver wa_me_link será implementado na Fase 2',
    },
  }
}

// ─────────────────────────────────────────────────────────────
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
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: jsonHdr })
    }

    const messageId = typeof body.message_id === 'string' ? body.message_id.trim() : null
    if (!messageId) {
      return new Response(JSON.stringify({ error: 'message_id obrigatório' }), { status: 400, headers: jsonHdr })
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 1. Buscar mensagem ────────────────────────────────
    const { data: message, error: fetchErr } = await sb
      .from('message_outbox')
      .select('id, church_id, to_address, body_text, driver, status, attempts, max_attempts')
      .eq('id', messageId)
      .maybeSingle()

    if (fetchErr || !message) {
      console.warn('[message-dispatch] Mensagem não encontrada:', messageId)
      return new Response(
        JSON.stringify({ ok: true, skipped: 'not_found' }),
        { status: 200, headers: jsonHdr }
      )
    }

    const msg = message as {
      id: string
      church_id: string
      to_address: string
      body_text: string
      driver: string
      status: string
      attempts: number
      max_attempts: number
    }

    // ── 2. Verificar status elegível ──────────────────────
    if (msg.status !== 'queued' && msg.status !== 'dispatching') {
      console.log('[message-dispatch] Status inelegível:', msg.status)
      return new Response(
        JSON.stringify({ ok: true, skipped: 'invalid_status', current_status: msg.status }),
        { status: 200, headers: jsonHdr }
      )
    }

    // ── 3. Marcar dispatching + incrementar attempts ──────
    await sb
      .from('message_outbox')
      .update({
        status:          'dispatching',
        last_attempt_at: new Date().toISOString(),
        attempts:        msg.attempts + 1,
      })
      .eq('id', messageId)

    // ── 4. Executar driver ────────────────────────────────
    let result: DispatchResult
    try {
      switch (msg.driver) {
        case 'mock_internal':
          result = await dispatch_mock_internal(msg)
          break
        case 'wa_me_link':
          result = await dispatch_wa_me_link_placeholder(msg)
          break
        default:
          throw new Error(`Driver não implementado: ${msg.driver}`)
      }
    } catch (driverErr: unknown) {
      const errMsg = driverErr instanceof Error ? driverErr.message : String(driverErr)
      result = { status: 'failed', error: errMsg, driver_response: {} }
    }

    // ── 5. Atualizar outbox com resultado ─────────────────
    const newAttempts = msg.attempts + 1
    const now = new Date().toISOString()

    if (result.status === 'sent') {
      await sb.from('message_outbox').update({
        status:            'sent',
        sent_at:           now,
        driver_response:   result.driver_response ?? {},
        driver_message_id: result.driver_message_id ?? null,
        error_message:     null,
      }).eq('id', messageId)

    } else if (result.status === 'pending_user_action') {
      await sb.from('message_outbox').update({
        status:          'pending_user_action',
        driver_response: result.driver_response ?? {},
      }).eq('id', messageId)

    } else {
      // failed
      if (newAttempts < msg.max_attempts) {
        // Reagendar para 5 minutos
        const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
        await sb.from('message_outbox').update({
          status:          'queued',
          next_attempt_at: retryAt,
          error_message:   result.error ?? 'dispatch failed',
          driver_response: result.driver_response ?? {},
        }).eq('id', messageId)
      } else {
        await sb.from('message_outbox').update({
          status:          'failed',
          failed_at:       now,
          error_message:   result.error ?? 'dispatch failed',
          driver_response: result.driver_response ?? {},
        }).eq('id', messageId)
      }
    }

    // ── 6. audit_log ──────────────────────────────────────
    const auditAction = result.status === 'sent' || result.status === 'pending_user_action'
      ? 'message_dispatched'
      : 'message_dispatch_failed'

    await sb.from('audit_logs').insert({
      church_id:   msg.church_id,
      entity_type: 'message',
      entity_id:   messageId,
      action:      auditAction,
      actor_type:  'system',
      actor_id:    'message-dispatch',
      payload:     {
        driver:        msg.driver,
        status:        result.status,
        attempts:      newAttempts,
        driver_msg_id: result.driver_message_id ?? null,
        error:         result.error ?? null,
      },
      model_used:  null,
      tokens_used: 0,
    }).catch(() => {/* audit falha silenciosa */})

    console.log(`[message-dispatch] ${messageId} → ${result.status} (driver=${msg.driver})`)

    return new Response(
      JSON.stringify({ ok: true, status: result.status, driver: msg.driver }),
      { status: 200, headers: jsonHdr }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[message-dispatch] UNHANDLED:', msg)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: jsonHdr }
    )
  }
})
