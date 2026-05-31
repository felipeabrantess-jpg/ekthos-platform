// ============================================================
// Edge Function: zapi-send  v4
// Envio direto de mensagem WhatsApp via Z-API
//
// POST /functions/v1/zapi-send
// verify_jwt = false — chamada interna entre EFs (service_role)
//
// Body: { to_phone: string, message: string }
//
// Variáveis de ambiente necessárias:
//   ZAPI_INSTANCE_ID   — ex: 3F28840B3A853234BB5A463A5A856F80
//   ZAPI_TOKEN         — token do painel Z-API
//   ZAPI_BASE_URL      — ex: https://api.z-api.io (default se não setado)
//
// ZAPI_CLIENT_TOKEN lido do Supabase Vault (vault.decrypted_secrets)
//   Configurado via: SELECT vault.create_secret('<valor>', 'ZAPI_CLIENT_TOKEN', '...')
//   Fallback: Deno.env.get('ZAPI_CLIENT_TOKEN') para desenvolvimento local
//
// Z-API API ref: https://developer.z-api.io/en/message/send-message-text
// Endpoint: POST {BASE_URL}/instances/{INSTANCE}/token/{TOKEN}/send-text
// Body:      { phone: string (só dígitos, com 55), message: string }
// Auth:      Client-Token no header (obrigatório quando configurado no painel)
// Resposta:  { zaapId, messageId, id }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? 'https://mlqjywqnchilvgkbvicd.supabase.co'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ error: 'method_not_allowed' }, 405)
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // ── Auth interna (Bearer SERVICE_ROLE_KEY) ───────────────────
  if (!SERVICE_ROLE_KEY) {
    console.error('[zapi-send] SUPABASE_SERVICE_ROLE_KEY não configurado')
    return json({ ok: false, error: 'misconfigured' }, 500)
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  // ── Credenciais ─────────────────────────────────────────────
  const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID') ?? ''
  const ZAPI_TOKEN       = Deno.env.get('ZAPI_TOKEN')        ?? ''
  const ZAPI_BASE_URL    = Deno.env.get('ZAPI_BASE_URL')     ?? 'https://api.z-api.io'

  // ZAPI_CLIENT_TOKEN: lido do Vault (primário) com fallback em env (local dev)
  let ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN') ?? ''
  if (!ZAPI_CLIENT_TOKEN) {
    try {
      const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: vaultRow } = await supabaseAdmin
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('name', 'ZAPI_CLIENT_TOKEN')
        .maybeSingle()
      ZAPI_CLIENT_TOKEN = vaultRow?.decrypted_secret ?? ''
    } catch (e) {
      console.error('[zapi-send] Falha ao ler ZAPI_CLIENT_TOKEN do vault:', (e instanceof Error) ? e.message : 'unknown error')
    }
  }

  if (!ZAPI_TOKEN || !ZAPI_INSTANCE_ID) {
    console.error('[zapi-send] ZAPI_TOKEN ou ZAPI_INSTANCE_ID não configurados')
    return json({ ok: false, error: 'zapi_credentials_missing' }, 503)
  }

  if (!ZAPI_CLIENT_TOKEN) {
    console.error('[zapi-send] ZAPI_CLIENT_TOKEN não configurado (vault + env)')
    return json({ ok: false, error: 'ZAPI_CLIENT_TOKEN not configured' }, 500)
  }

  // ── Parse body ───────────────────────────────────────────────
  let to_phone: string, message: string
  try {
    const body = await req.json()
    to_phone = body.to_phone
    message  = body.message
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!to_phone || !message) {
    return json({ ok: false, error: 'missing_fields', required: ['to_phone', 'message'] }, 400)
  }

  // ── Normalizar número ────────────────────────────────────────
  // Z-API espera apenas dígitos com código de país (ex: 5521993092146)
  const cleanPhone = to_phone.replace(/\D/g, '')
  const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`

  if (phone.length < 12) {
    return json({ ok: false, error: 'invalid_phone', phone }, 400)
  }

  console.log(`[zapi-send] Enviando para ***${phone.slice(-4)} via ${ZAPI_BASE_URL}`)

  // ── Chamada Z-API ────────────────────────────────────────────
  const endpoint = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Client-Token': ZAPI_CLIENT_TOKEN,
  }

  try {
    const zapiRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message }),
      signal: AbortSignal.timeout(15_000),
    })

    let result: unknown
    try {
      result = await zapiRes.json()
    } catch {
      result = { raw: await zapiRes.text().catch(() => '') }
    }

    console.log(`[zapi-send] Z-API status=${zapiRes.status}`)

    if (zapiRes.ok) {
      const r = result as Record<string, unknown>
      return json({
        ok:         true,
        message_id: (r?.messageId ?? r?.zaapId ?? r?.id ?? null) as string | null,
        zapi:       result,
      })
    }

    // Erros conhecidos Z-API
    const statusMap: Record<number, string> = {
      400: 'zapi_bad_request',
      401: 'zapi_unauthorized',
      403: 'zapi_forbidden',
      404: 'zapi_instance_not_found',
      429: 'zapi_rate_limited',
      500: 'zapi_server_error',
    }
    const errorCode = statusMap[zapiRes.status] ?? `zapi_error_${zapiRes.status}`

    return json({
      ok:          false,
      error:       errorCode,
      http_status: zapiRes.status,
      zapi:        result,
    }, 502)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('timed out') || msg.includes('timeout')

    console.error(`[zapi-send] Fetch error: ${msg}`)
    return json({
      ok:     false,
      error:  isTimeout ? 'zapi_timeout' : 'zapi_network_error',
      detail: msg,
    }, 503)
  }
})
