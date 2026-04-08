// ============================================================
// Edge Function: whatsapp-webhook
// Recebe webhooks da WhatsApp Business API
// Responsabilidades:
//   1. Validar assinatura HMAC (segurança)
//   2. Responder 200 OK imediatamente (WhatsApp exige < 5s)
//   3. Processar mensagem de forma assíncrona
//   4. Delegar ao demand-router para classificação
// ============================================================

import { validateWebhookSignature, markMessageAsRead } from '../_shared/whatsapp-api.ts'
import { supabase, writeAuditLog, errorResponse, successResponse } from '../_shared/supabase-client.ts'
import { getChurchIdByWhatsAppPhone, loadTenantContext } from '../_shared/tenant-loader.ts'

// Token de verificação do webhook (configurado no Meta Developer Portal)
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WA_WEBHOOK_VERIFY_TOKEN')
const WA_APP_SECRET = Deno.env.get('WA_APP_SECRET')

if (!WEBHOOK_VERIFY_TOKEN || !WA_APP_SECRET) {
  throw new Error('[whatsapp-webhook] WA_WEBHOOK_VERIFY_TOKEN ou WA_APP_SECRET não configurados')
}

Deno.serve(async (req: Request) => {
  // ──────────────────────────────────────────────────────────
  // GET: verificação do webhook pelo Meta Developer Portal
  // ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN && challenge) {
      console.log('[whatsapp-webhook] Webhook verificado com sucesso')
      return new Response(challenge, { status: 200 })
    }

    return errorResponse('Verificação de webhook inválida', 403)
  }

  // ──────────────────────────────────────────────────────────
  // POST: recebimento de mensagem
  // ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido', 405)
  }

  // Lê o body uma única vez (streams são consumidos)
  const rawBody = await req.text()

  // Valida assinatura HMAC antes de processar qualquer dado
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const isValid = await validateWebhookSignature(rawBody, signature, WA_APP_SECRET)

  if (!isValid) {
    console.error('[whatsapp-webhook] Assinatura HMAC inválida')
    await writeAuditLog({
      church_id: null,
      entity_type: 'webhook',
      entity_id: null,
      action: 'WEBHOOK_INVALID_SIGNATURE',
      actor_type: 'webhook',
      actor_id: 'whatsapp',
      payload: { signature_received: signature.slice(0, 20) + '...' },
      model_used: null,
      tokens_used: 0,
    })
    return errorResponse('Assinatura inválida', 401)
  }

  // ──────────────────────────────────────────────────────────
  // Responde 200 IMEDIATAMENTE — processamento ocorre abaixo
  // WhatsApp re-envia se não receber 200 em < 5s
  // ──────────────────────────────────────────────────────────
  const responsePromise = processWebhookPayload(rawBody)

  // Edge Function do Deno: podemos usar waitUntil-like pattern
  // Garante que o processamento completa mesmo após resposta enviada
  void responsePromise.catch((err) => {
    console.error('[whatsapp-webhook] Erro no processamento assíncrono:', err)
  })

  return successResponse({ status: 'received' }, 200)
})

// ============================================================
// Processa o payload do webhook após responder 200
// ============================================================
async function processWebhookPayload(rawBody: string): Promise<void> {
  let payload: WhatsAppWebhookPayload

  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('[whatsapp-webhook] Payload não é JSON válido')
    return
  }

  // Extrai a mensagem do payload aninhado do WhatsApp
  const entry = payload?.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value

  // Ignora eventos que não são mensagens (status updates, etc.)
  if (!value?.messages?.[0]) {
    console.log('[whatsapp-webhook] Evento ignorado (não é mensagem):', changes?.field)
    return
  }

  const message = value.messages[0]
  const phoneNumberId = value.metadata?.phone_number_id

  // Somente processa mensagens de texto por enquanto (MVP)
  if (message.type !== 'text') {
    console.log('[whatsapp-webhook] Tipo de mensagem não suportado no MVP:', message.type)
    return
  }

  const fromPhone = message.from
  const messageId = message.id
  const text = message.text?.body ?? ''

  if (!phoneNumberId || !fromPhone || !messageId || !text) {
    console.error('[whatsapp-webhook] Campos obrigatórios ausentes no payload')
    return
  }

  // ──────────────────────────────────────────────────────────
  // Identifica o tenant pelo phone_number_id
  // ──────────────────────────────────────────────────────────
  const churchId = await getChurchIdByWhatsAppPhone(phoneNumberId)
  if (!churchId) {
    console.warn('[whatsapp-webhook] Nenhum tenant encontrado para phone_number_id:', phoneNumberId)
    return
  }

  // Carrega contexto do tenant (valida módulo, onboarding, horário)
  const tenantCtx = await loadTenantContext(churchId)
  if (!tenantCtx) {
    console.warn('[whatsapp-webhook] Tenant inválido ou inativo:', churchId)
    return
  }

  // ──────────────────────────────────────────────────────────
  // Upsert da pessoa pelo telefone
  // ──────────────────────────────────────────────────────────
  const { data: person, error: personError } = await supabase
    .from('people')
    .upsert(
      {
        church_id: churchId,
        phone: fromPhone,
        source: 'whatsapp',
        last_contact_at: new Date().toISOString(),
      },
      {
        onConflict: 'church_id,phone',
        ignoreDuplicates: false,
      }
    )
    .select('id, name, optout')
    .single()

  if (personError || !person) {
    console.error('[whatsapp-webhook] Erro ao upsert pessoa:', personError?.message)
    return
  }

  // Pessoa optou por não receber mensagens
  if (person.optout) {
    console.log('[whatsapp-webhook] Pessoa com optout — mensagem ignorada:', person.id)
    return
  }

  // ──────────────────────────────────────────────────────────
  // Registra a interação inbound (com deduplicação)
  // ──────────────────────────────────────────────────────────
  const { error: interactionError } = await supabase
    .from('interactions')
    .insert({
      church_id: churchId,
      person_id: person.id,
      type: 'whatsapp',
      direction: 'inbound',
      content: { text, media_url: null },
      external_id: messageId,
      agent: 'whatsapp-webhook',
      model_used: 'none',
      tokens_used: 0,
    })

  if (interactionError) {
    // Código 23505 = violação de unique constraint (mensagem duplicada)
    if (interactionError.code === '23505') {
      console.log('[whatsapp-webhook] Mensagem duplicada ignorada:', messageId)
      return
    }
    console.error('[whatsapp-webhook] Erro ao registrar interação:', interactionError.message)
    return
  }

  // Marca como lida no WhatsApp (melhora UX)
  await markMessageAsRead(churchId, messageId)

  // ──────────────────────────────────────────────────────────
  // Delega ao demand-router para classificação e resposta
  // ──────────────────────────────────────────────────────────
  const routerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/demand-router`

  const routerResponse = await fetch(routerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      churchId,
      personId: person.id,
      personName: person.name,
      fromPhone,
      messageId,
      text,
      tenantContext: tenantCtx,
    }),
    signal: AbortSignal.timeout(30_000), // 30s para o router processar
  })

  if (!routerResponse.ok) {
    const errText = await routerResponse.text()
    console.error('[whatsapp-webhook] Demand router retornou erro:', routerResponse.status, errText)
  }
}

// ============================================================
// Tipos do payload do WhatsApp Business API
// ============================================================
interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      field: string
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: Array<{
          id: string
          from: string
          timestamp: string
          type: string
          text?: { body: string }
        }>
        statuses?: Array<{ id: string; status: string; timestamp: string }>
      }
    }>
  }>
}
