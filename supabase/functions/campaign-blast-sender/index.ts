// ============================================================
// Edge Function: campaign-blast-sender  v1
// Envia UMA mensagem (texto + vídeo opcional) via Z-API
// e registra o resultado em campaign_blast_sends.
//
// Input (POST JSON):
//   blast_id       uuid       — id da campanha em campaign_blasts
//   phone          string     — número normalizado (+5521...)
//   person_id      string?    — uuid da pessoa (pode ser null)
//   person_name    string?    — nome para o log
//
// Output:
//   { ok: boolean, message_id?: string, error?: string }
//
// Segurança:
//   - verify_jwt: false (frontend chama com anon key)
//   - Lê instance_id/token do banco (campaign_blasts) — não do body
//   - Client-Token lido do secret ZAPI_CLIENT_TOKEN
//   - Não toca EFs blindadas nem channel_dispatch_queue
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN') ?? ''
const ZAPI_BASE         = 'https://api.z-api.io/instances'

// ── Helpers ───────────────────────────────────────────────────────────────────

function resp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/** Normaliza telefone: só dígitos, garante prefixo 55 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

/**
 * Converte link Google Drive /view para URL de download direto.
 * drive.usercontent.google.com funciona para arquivos públicos grandes
 * sem a página de confirmação de vírus.
 */
function normalizeVideoUrl(url: string): string {
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (driveMatch) {
    return `https://drive.usercontent.google.com/download?id=${driveMatch[1]}&export=download&authuser=0`
  }
  return url
}

// ── Z-API calls ───────────────────────────────────────────────────────────────

interface SendResult { ok: boolean; message_id?: string; error?: string }

async function zapiSendVideo(
  instanceId: string, token: string, phone: string,
  videoUrl: string, caption: string,
): Promise<SendResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN

  try {
    const res = await fetch(
      `${ZAPI_BASE}/${instanceId}/token/${token}/send-video`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, video: normalizeVideoUrl(videoUrl), caption }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (res.ok) {
      return {
        ok: true,
        message_id: (body.messageId ?? body.zaapId ?? body.id ?? '') as string,
      }
    }
    return { ok: false, error: `Z-API ${res.status}: ${JSON.stringify(body)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function zapiSendText(
  instanceId: string, token: string, phone: string, message: string,
): Promise<SendResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN

  try {
    const res = await fetch(
      `${ZAPI_BASE}/${instanceId}/token/${token}/send-text`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (res.ok) {
      return {
        ok: true,
        message_id: (body.messageId ?? body.zaapId ?? body.id ?? '') as string,
      }
    }
    return { ok: false, error: `Z-API ${res.status}: ${JSON.stringify(body)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resp({ ok: true }, 204)
  if (req.method !== 'POST')   return resp({ ok: false, error: 'method_not_allowed' }, 405)

  let body: {
    blast_id:    string
    phone:       string
    person_id?:  string | null
    person_name?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return resp({ ok: false, error: 'invalid_json' }, 400)
  }

  const { blast_id, phone, person_id, person_name } = body

  if (!blast_id || !phone) {
    return resp({ ok: false, error: 'blast_id e phone são obrigatórios' }, 400)
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Busca credenciais e configurações da campanha
  const { data: blast, error: blastErr } = await sb
    .from('campaign_blasts')
    .select('id, church_id, instance_id, instance_token, message_text, video_url, status')
    .eq('id', blast_id)
    .single()

  if (blastErr || !blast) {
    return resp({ ok: false, error: 'campanha não encontrada' }, 404)
  }

  if (blast.status === 'cancelled') {
    return resp({ ok: false, error: 'campanha cancelada' }, 409)
  }

  // Cria o registro de envio (pending) antes de chamar Z-API
  const { data: sendRow, error: insertErr } = await sb
    .from('campaign_blast_sends')
    .insert({
      blast_id,
      church_id:   blast.church_id,
      person_id:   person_id ?? null,
      phone,
      person_name: person_name ?? null,
      status:      'pending',
    })
    .select('id')
    .single()

  if (insertErr || !sendRow) {
    console.error('[campaign-blast-sender] insert send row error:', insertErr)
    return resp({ ok: false, error: 'erro ao registrar envio' }, 500)
  }

  const normalizedPhone = normalizePhone(phone)
  const now             = new Date().toISOString()

  // Chama Z-API: vídeo se tiver video_url, texto puro caso contrário
  let result: SendResult
  if (blast.video_url && blast.video_url.trim()) {
    result = await zapiSendVideo(
      blast.instance_id,
      blast.instance_token,
      normalizedPhone,
      blast.video_url.trim(),
      blast.message_text ?? '',
    )
  } else {
    result = await zapiSendText(
      blast.instance_id,
      blast.instance_token,
      normalizedPhone,
      blast.message_text ?? '',
    )
  }

  // Atualiza o registro com resultado
  await sb
    .from('campaign_blast_sends')
    .update({
      status:          result.ok ? 'sent' : 'failed',
      zapi_message_id: result.ok ? result.message_id : null,
      error_msg:       result.ok ? null : result.error,
      sent_at:         now,
    })
    .eq('id', sendRow.id)

  // Atualiza contadores da campanha
  if (result.ok) {
    await sb.rpc('increment_blast_sent',   { p_blast_id: blast_id })
  } else {
    await sb.rpc('increment_blast_failed', { p_blast_id: blast_id })
  }

  const masked = normalizedPhone.replace(/(\d{4})\d+(\d{4})/, '$1****$2')
  console.log(
    `[campaign-blast-sender] blast=${blast_id.slice(0,8)} → ${masked} `
    + `${result.ok ? `✓ ${result.message_id}` : `✗ ${result.error}`}`
  )

  return resp({ ok: result.ok, message_id: result.message_id, error: result.error })
})
