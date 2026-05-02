// ============================================================
// Edge Function: chatpro-send
// Envio direto de mensagem WhatsApp via API ChatPro
//
// POST /functions/v1/chatpro-send
// verify_jwt = false — chamada interna entre EFs (service_role)
//
// Body: { to_phone: string, message: string }
//
// Variáveis de ambiente necessárias:
//   CHATPRO_INSTANCE_ID  — ex: chatpro-xi70lpoh5q
//   CHATPRO_TOKEN        — token do painel ChatPro
//   CHATPRO_BASE_URL     — ex: https://v5.chatpro.com.br/chatpro-xi70lpoh5q
//                          (derivado de INSTANCE_ID se não setado)
//
// ChatPro API ref: https://chatpro.readme.io/reference/send_message
// Endpoint: POST {BASE_URL}/api/v1/send_message
// Body:      { number: string (só dígitos), message: string }
// Auth:      Authorization: {CHATPRO_TOKEN}  ← sem "Bearer"
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // ── Credenciais ─────────────────────────────────────────────
  const CHATPRO_INSTANCE_ID = Deno.env.get('CHATPRO_INSTANCE_ID') ?? ''
  const CHATPRO_TOKEN       = Deno.env.get('CHATPRO_TOKEN')        ?? ''
  const CHATPRO_BASE_URL    = Deno.env.get('CHATPRO_BASE_URL')
    ?? `https://v5.chatpro.com.br/${CHATPRO_INSTANCE_ID}`

  if (!CHATPRO_TOKEN || !CHATPRO_INSTANCE_ID) {
    console.error('[chatpro-send] CHATPRO_TOKEN ou CHATPRO_INSTANCE_ID não configurados')
    return json({ ok: false, error: 'chatpro_credentials_missing' }, 503)
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
  // ChatPro espera apenas dígitos (sem +, sem espaços, sem hífens)
  // Brasil: 5521999999999 (sem o +)
  const cleanPhone = to_phone.replace(/\D/g, '')

  if (cleanPhone.length < 10) {
    return json({ ok: false, error: 'invalid_phone', phone: cleanPhone }, 400)
  }

  console.log(`[chatpro-send] Enviando para ${cleanPhone} via ${CHATPRO_BASE_URL}`)

  // ── Chamada ChatPro ──────────────────────────────────────────
  const endpoint = `${CHATPRO_BASE_URL}/api/v1/send_message`

  try {
    const chatproRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': CHATPRO_TOKEN,  // ChatPro usa token direto, sem "Bearer"
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        number:  cleanPhone,
        message: message,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    let result: unknown
    try {
      result = await chatproRes.json()
    } catch {
      result = { raw: await chatproRes.text().catch(() => '') }
    }

    console.log(`[chatpro-send] ChatPro status=${chatproRes.status}`, JSON.stringify(result))

    if (chatproRes.ok) {
      return json({
        ok:         true,
        message_id: (result as Record<string, unknown>)?.id ?? null,
        chatpro:    result,
      })
    }

    // Erros conhecidos ChatPro
    const statusMap: Record<number, string> = {
      400: 'chatpro_bad_request',
      401: 'chatpro_unauthorized',
      403: 'chatpro_forbidden',
      404: 'chatpro_instance_not_found',
      429: 'chatpro_rate_limited',
      500: 'chatpro_server_error',
    }
    const errorCode = statusMap[chatproRes.status] ?? `chatpro_error_${chatproRes.status}`

    return json({
      ok:          false,
      error:       errorCode,
      http_status: chatproRes.status,
      chatpro:     result,
    }, 502)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('timed out') || msg.includes('timeout')

    console.error(`[chatpro-send] Fetch error: ${msg}`)
    return json({
      ok:    false,
      error: isTimeout ? 'chatpro_timeout' : 'chatpro_network_error',
      detail: msg,
    }, 503)
  }
})
