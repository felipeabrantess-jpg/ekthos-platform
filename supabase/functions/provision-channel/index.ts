// ============================================================
// Edge Function: provision-channel  (v17 — F1 Opção C)
// Provisiona canal Z-API diretamente (sem n8n).
//
// POST /provision-channel
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
// Body: {
//   church_id:        UUID,
//   phone_number:     string,   ex: "+5511999999999"
//   zapi_instance_id: string,   ID da instância Z-API
//   zapi_token:       string,   token da instância Z-API
//   context_type?:    'pastoral' | 'operacional'  (default: 'pastoral')
//   display_name?:    string
// }
//
// Fluxo:
// 1. Valida JWT → confirma is_ekthos_admin
// 2. Valida parâmetros obrigatórios
// 3. Registra webhook na Z-API: PUT /instances/{id}/token/{t}/update-webhook-received
// 4. Upsert em church_whatsapp_channels ON CONFLICT (church_id, channel_type)
// 5. Registra audit event
//
// NUNCA logar zapi_token. NUNCA logar ZAPI_CLIENT_TOKEN.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const ZAPI_CLIENT_TOKEN         = Deno.env.get('ZAPI_CLIENT_TOKEN') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getAdmin(token: string) {
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) return null
  const isAdmin = user.app_metadata?.is_ekthos_admin === true
  return isAdmin ? user : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Auth ──────────────────────────────────────────────────────────────────

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const adminUser = await getAdmin(token)
  if (!adminUser) return json({ error: 'Forbidden — apenas admin Ekthos' }, 403)

  // ── Body ──────────────────────────────────────────────────────────────────

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Body inválido' }, 400) }

  const churchId       = body?.church_id       as string | undefined
  const phoneNumber    = body?.phone_number    as string | undefined
  const zapiInstanceId = body?.zapi_instance_id as string | undefined
  const zapiToken      = body?.zapi_token      as string | undefined
  const contextType    = (body?.context_type as string | undefined) ?? 'pastoral'
  const displayName    = body?.display_name    as string | undefined

  if (!churchId)       return json({ error: 'church_id é obrigatório' }, 400)
  if (!phoneNumber)    return json({ error: 'phone_number é obrigatório' }, 400)
  if (!zapiInstanceId) return json({ error: 'zapi_instance_id é obrigatório' }, 400)
  if (!zapiToken)      return json({ error: 'zapi_token é obrigatório' }, 400)

  if (!['pastoral', 'operacional'].includes(contextType)) {
    return json({ error: 'context_type deve ser pastoral ou operacional' }, 400)
  }

  // ── Validar church existe ─────────────────────────────────────────────────

  const { data: church } = await supabase
    .from('churches')
    .select('id, name')
    .eq('id', churchId)
    .single()

  if (!church) return json({ error: 'Igreja não encontrada' }, 404)

  // ── Registrar webhook na Z-API ────────────────────────────────────────────

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-receiver?provider=zapi&instance_id=${zapiInstanceId}`
  const zapiWebhookEndpoint = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/update-webhook-received`

  let zapiOk = false
  let zapiError: string | null = null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const zapiRes = await fetch(zapiWebhookEndpoint, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Client-Token':  ZAPI_CLIENT_TOKEN,
        // NÃO logar token — apenas header enviado
      },
      body:   JSON.stringify({ value: webhookUrl }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (zapiRes.ok) {
      zapiOk = true
    } else {
      const errText = await zapiRes.text().catch(() => `HTTP ${zapiRes.status}`)
      zapiError = `zapi_webhook_failed: ${zapiRes.status} ${errText.slice(0, 200)}`
      console.error('[provision-channel] Z-API webhook error:', zapiRes.status)
    }
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : 'fetch_error'
    zapiError = `zapi_webhook_failed: ${msg}`
    console.error('[provision-channel] Z-API fetch error:', msg)
  }

  // ── Upsert em church_whatsapp_channels ────────────────────────────────────
  // Gravar mesmo se Z-API falhou — permite retry manual

  const { data: channelData, error: upsertError } = await supabase
    .from('church_whatsapp_channels')
    .upsert(
      {
        church_id:        churchId,
        channel_type:     'zapi',
        provider:         'zapi',
        phone_number:     phoneNumber.trim(),
        display_name:     displayName?.trim() || `Z-API — ${church.name}`,
        instance_id:      zapiInstanceId,
        context_type:     contextType,
        status:           zapiOk ? 'connected' : 'error',
        session_status:   zapiOk ? 'active' : 'closed',
        error_message:    zapiError,
        updated_at:       new Date().toISOString(),
      },
      { onConflict: 'church_id,channel_type' }
    )
    .select('id')
    .single()

  if (upsertError) {
    console.error('[provision-channel] upsert error:', upsertError.message)
    return json({ ok: false, error: `db_error: ${upsertError.message}` }, 500)
  }

  const channelId = channelData?.id ?? null

  // ── Log estruturado — NUNCA logar tokens ─────────────────────────────────

  console.log('[provision-channel]', {
    church_id:    churchId,
    instance_id:  zapiInstanceId,
    phone_number: phoneNumber,
    webhook_ok:   zapiOk,
    zapi_error:   zapiError,
    channel_id:   channelId,
  })

  // ── Audit event ───────────────────────────────────────────────────────────

  const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
  const requestId = req.headers.get('x-request-id') ?? null

  const { error: auditErr } = await supabase.rpc('record_audit_event', {
    p_church_id:                churchId,
    p_admin_user_id:            adminUser.id,
    p_action:                   'channel.provision.zapi',
    p_before:                   { status: 'pending' },
    p_after:                    { status: zapiOk ? 'connected' : 'error', webhook_configured: zapiOk, zapi_error: zapiError },
    p_reason:                   `Provisioning Z-API direto — instance: ${zapiInstanceId.slice(0, 8)}…`,
    p_actor_email:              adminUser.email ?? null,
    p_actor_roles:              (adminUser.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'church_whatsapp_channels',
    p_resource_id:              channelId,
    p_status:                   zapiOk ? 'success' : 'failed',
    p_error_msg:                zapiError,
    p_impersonation_session_id: impersonationSessionId,
    p_impersonated_church_id:   churchId,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  })
  if (auditErr) console.error('[provision-channel] audit failed:', auditErr.message)

  // ── Response ──────────────────────────────────────────────────────────────

  return json({
    ok:                 zapiOk,
    channel_id:         channelId,
    webhook_configured: zapiOk,
    ...(zapiError ? { error: zapiError } : {}),
  }, zapiOk ? 200 : 207)
})
