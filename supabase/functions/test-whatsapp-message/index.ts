// ============================================================
// Edge Function: test-whatsapp-message
// Envio de mensagem de teste via Z-API direto (sem passar por n8n).
//
// POST /functions/v1/test-whatsapp-message
// verify_jwt = false — chamada interna via service_role Bearer
//
// Usado pelo botão "Enviar mensagem de teste" na tela /agentes/:slug/configurar.
// O canal precisa estar com session_status IN ('testing', 'active').
//
// Body: {
//   church_id: string (uuid)
//   to_phone:  string  — número de destino (ex: "+5521999999999")
//   message:   string  — texto livre
// }
//
// Fluxo:
//   1. Busca church_whatsapp_channels com session_status IN (testing, active)
//   2. Chama Z-API diretamente com zapi_instance_id + zapi_token
//   3. Retorna { ok, zapi_status, message_id? }
//
// Nunca afeta agent_pending_messages — caminho separado do fluxo de produção.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const ZAPI_BASE = 'https://api.z-api.io'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 200)
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const body = await req.json().catch(() => null)
    if (!body) return json({ ok: false, error: 'invalid_json' }, 400)

    const { church_id, to_phone, message } = body as Record<string, unknown>

    if (!church_id || typeof church_id !== 'string' ||
        !to_phone   || typeof to_phone   !== 'string' ||
        !message    || typeof message    !== 'string') {
      return json({
        ok: false,
        error: 'missing_fields',
        required: ['church_id', 'to_phone', 'message'],
      }, 400)
    }

    // 1. Busca canal ativo da igreja (testing ou active)
    const { data: channel, error: chErr } = await sb
      .from('church_whatsapp_channels')
      .select('id, phone_number, zapi_instance_id, zapi_token, session_status, context_type')
      .eq('church_id', church_id)
      .eq('active', true)
      .in('session_status', ['testing', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (chErr) {
      console.error('[test-whatsapp-message] DB error:', chErr.message)
      return json({ ok: false, error: 'db_error' }, 500)
    }

    if (!channel) {
      return json({
        ok: false,
        error: 'no_active_channel',
        detail: 'Nenhum canal WhatsApp conectado para esta igreja. Conecte um número primeiro.',
      }, 422)
    }

    if (!channel.zapi_instance_id || !channel.zapi_token) {
      return json({
        ok: false,
        error: 'channel_missing_credentials',
        detail: 'Canal encontrado mas sem credenciais Z-API configuradas.',
      }, 422)
    }

    // 2. Chama Z-API
    const zapiUrl = `${ZAPI_BASE}/instances/${channel.zapi_instance_id}/token/${channel.zapi_token}/send-text`

    // Z-API espera phone sem '+' e sem caracteres especiais (só dígitos)
    const phone = to_phone.replace(/\D/g, '')

    console.log(`[test-whatsapp-message] Enviando via Z-API instance=${channel.zapi_instance_id} → ${phone}`)

    const zapiRes = await fetch(zapiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, message }),
      signal:  AbortSignal.timeout(10_000),
    })

    const zapiBody = await zapiRes.json().catch(() => ({ raw: await zapiRes.text().catch(() => '') }))

    if (zapiRes.ok) {
      console.log(`[test-whatsapp-message] Z-API ok (${zapiRes.status}):`, JSON.stringify(zapiBody))
      return json({
        ok:          true,
        zapi_status: zapiRes.status,
        zapi_response: zapiBody,
        channel_id:  channel.id,
        from_number: channel.phone_number,
      })
    } else {
      console.warn(`[test-whatsapp-message] Z-API erro (${zapiRes.status}):`, JSON.stringify(zapiBody))
      return json({
        ok:          false,
        error:       'zapi_error',
        zapi_status: zapiRes.status,
        zapi_response: zapiBody,
      }, 422)
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[test-whatsapp-message] Unhandled error:', msg)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
