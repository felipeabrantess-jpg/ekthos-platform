// ============================================================
// Edge Function: provision-channel
// Provisiona um canal de comunicação via n8n (agnóstico de provider).
//
// POST /provision-channel  body: { channel_id: UUID }
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
//
// Fluxo:
// 1. Valida JWT → confirma is_ekthos_admin
// 2. Busca canal em church_channels pelo channel_id
// 3. Valida church existe
// 4. Seta status = 'provisioning'
// 5. Resolve webhook n8n por provider (env var por provider):
//    - zapi       → N8N_PROVISIONING_ZAPI_URL
//    - meta_cloud → N8N_PROVISIONING_META_CLOUD_URL
//    - instagram  → N8N_PROVISIONING_INSTAGRAM_URL
//    - telegram   → N8N_PROVISIONING_TELEGRAM_URL
//    - whatsapp_cloud → N8N_PROVISIONING_WHATSAPP_CLOUD_URL
//
// Se env do provider não existe (fallback seguro):
//    status='pending', error_message='n8n_webhook_not_configured: <provider>'
//    Retornar 200 (não é erro fatal — estrutura ok, webhook pendente)
//
// Se webhook existe:
//    POST com timeout 10s + Authorization: Bearer N8N_PROVISIONING_SECRET
//    2xx → status 'provisioning' (n8n callback atualiza depois)
//    erro/timeout → status='error', error_message='n8n_provisioning_failed: ...'
//
// NUNCA logar token. NUNCA logar webhook URL completa.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

// Mapeamento provider → env var do webhook n8n
const PROVISIONING_WEBHOOK_ENVS: Record<string, string> = {
  zapi:           'N8N_PROVISIONING_ZAPI_URL',
  meta_cloud:     'N8N_PROVISIONING_META_CLOUD_URL',
  instagram:      'N8N_PROVISIONING_INSTAGRAM_URL',
  telegram:       'N8N_PROVISIONING_TELEGRAM_URL',
  whatsapp_cloud: 'N8N_PROVISIONING_WHATSAPP_CLOUD_URL',
}

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
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
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

  const channelId = body?.channel_id as string | undefined
  if (!channelId) return json({ error: 'channel_id é obrigatório' }, 400)

  // ── Buscar canal em church_channels ───────────────────────────────────────

  const { data: channel, error: channelError } = await supabase
    .from('church_channels')
    .select('id, church_id, provider, provider_instance_id, phone_number, display_name, agent_slugs, metadata, status')
    .eq('id', channelId)
    .single()

  if (channelError || !channel) {
    return json({ error: 'Canal não encontrado em church_channels' }, 404)
  }

  // ── Validar church existe ─────────────────────────────────────────────────

  const { data: church } = await supabase
    .from('churches')
    .select('id, name')
    .eq('id', channel.church_id)
    .single()

  if (!church) return json({ error: 'Igreja não encontrada' }, 404)

  // ── Setar provisioning ────────────────────────────────────────────────────

  await supabase
    .from('church_channels')
    .update({ status: 'provisioning', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', channelId)

  // ── Resolver webhook n8n por provider ────────────────────────────────────

  const webhookEnvName = PROVISIONING_WEBHOOK_ENVS[channel.provider]
  const webhookUrl     = webhookEnvName ? Deno.env.get(webhookEnvName) : undefined
  const n8nSecret      = Deno.env.get('N8N_PROVISIONING_SECRET') ?? ''
  const hasWebhook     = !!webhookUrl

  let finalStatus       = 'provisioning'
  let finalErrorMessage: string | null = null

  if (!hasWebhook) {
    // CASO B — webhook do provider não configurado: fallback seguro (não é erro fatal)
    finalStatus       = 'pending'
    finalErrorMessage = `n8n_webhook_not_configured: ${channel.provider}`
  } else {
    // CASO A — POST pro webhook n8n do provider
    const callbackUrl = `${SUPABASE_URL}/functions/v1/channel-provisioning-callback`

    const payload = {
      church_id:            channel.church_id,
      channel_id:           channelId,
      provider:             channel.provider,
      provider_instance_id: channel.provider_instance_id,
      phone_number:         channel.phone_number,
      display_name:         channel.display_name,
      agent_slugs:          channel.agent_slugs,
      metadata:             channel.metadata,
      callback_url:         callbackUrl,
      // NÃO incluir token/secret no payload
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const n8nResponse = await fetch(webhookUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${n8nSecret}`,
        },
        body:   JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!n8nResponse.ok) {
        const errText = await n8nResponse.text().catch(() => `HTTP ${n8nResponse.status}`)
        finalStatus       = 'error'
        finalErrorMessage = `n8n_provisioning_failed: ${n8nResponse.status} ${errText.slice(0, 200)}`
      }
      // 2xx: finalStatus permanece 'provisioning' — n8n callback vai atualizar
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'fetch_error'
      finalStatus       = 'error'
      finalErrorMessage = `n8n_provisioning_failed: ${msg}`
    }
  }

  // ── Atualizar status final (somente se diferente de 'provisioning') ────────

  if (finalStatus !== 'provisioning') {
    await supabase
      .from('church_channels')
      .update({ status: finalStatus, error_message: finalErrorMessage, updated_at: new Date().toISOString() })
      .eq('id', channelId)
  }

  // ── Log estruturado — NUNCA logar token ou webhook URL ───────────────────

  const webhookEnvExists = hasWebhook ? `${webhookEnvName} configurado` : `${webhookEnvName ?? 'env'} ausente`
  console.log('[provision-channel]', {
    channel_id:      channelId,
    church_id:       channel.church_id,
    provider:        channel.provider,
    webhook_env:     webhookEnvExists,
    result:          finalStatus,
    error_message:   finalErrorMessage,
  })

  return json({
    channel_id:    channelId,
    status:        finalStatus,
    ...(finalErrorMessage ? { error_message: finalErrorMessage } : {}),
  })
})
