// ============================================================
// Shared: whatsapp-api.ts
// Wrapper da WhatsApp Business API (Graph API v19)
// Tokens acessados via Supabase Vault — nunca hardcoded
// ============================================================

import { supabase } from './supabase-client.ts'

const WA_API_VERSION = 'v19.0'
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`

// ============================================================
// Recupera o token do Vault pelo vault_key
// ============================================================
async function getWhatsAppToken(vaultKey: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault.decrypted_secret', {
    name: vaultKey,
  })

  if (error || !data) {
    throw new Error(`[whatsapp-api] Falha ao obter token do Vault: ${vaultKey}`)
  }

  return data as string
}

// ============================================================
// Recupera o phone_number_id e vault_key da integração
// ============================================================
async function getWhatsAppConfig(
  churchId: string
): Promise<{ phoneNumberId: string; vaultKey: string }> {
  const { data, error } = await supabase
    .from('integrations')
    .select('config')
    .eq('church_id', churchId)
    .eq('type', 'whatsapp')
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    throw new Error(`[whatsapp-api] Integração WhatsApp não encontrada para church: ${churchId}`)
  }

  const config = data.config as { phone_number_id: string; vault_key: string }

  if (!config.phone_number_id || !config.vault_key) {
    throw new Error('[whatsapp-api] Configuração WhatsApp incompleta: phone_number_id ou vault_key ausente')
  }

  return {
    phoneNumberId: config.phone_number_id,
    vaultKey: config.vault_key,
  }
}

// ============================================================
// Envia mensagem de texto simples
// ============================================================
export async function sendTextMessage(
  churchId: string,
  toPhone: string,
  text: string
): Promise<{ messageId: string }> {
  const { phoneNumberId, vaultKey } = await getWhatsAppConfig(churchId)
  const token = await getWhatsAppToken(vaultKey)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { body: text, preview_url: false },
  }

  const response = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000), // timeout de 10s
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `[whatsapp-api] Falha ao enviar mensagem: ${response.status} — ${errorBody}`
    )
  }

  const result = await response.json()
  const messageId = result?.messages?.[0]?.id ?? 'unknown'

  return { messageId }
}

// ============================================================
// Marca mensagem como lida (melhora experiência do usuário)
// ============================================================
export async function markMessageAsRead(
  churchId: string,
  messageId: string
): Promise<void> {
  try {
    const { phoneNumberId, vaultKey } = await getWhatsAppConfig(churchId)
    const token = await getWhatsAppToken(vaultKey)

    await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch (err) {
    // Não crítico — não bloqueia o fluxo principal
    console.warn('[whatsapp-api] Falha ao marcar como lida (não crítico):', err)
  }
}

// ============================================================
// Valida a assinatura HMAC do webhook do WhatsApp
// Comparação em tempo constante para evitar timing attacks
// ============================================================
export async function validateWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) return false

  const receivedHash = signature.slice(7) // remove 'sha256='

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(rawBody)
  )

  const computedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparação byte a byte em tempo constante
  if (computedHash.length !== receivedHash.length) return false

  let mismatch = 0
  for (let i = 0; i < computedHash.length; i++) {
    mismatch |= computedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i)
  }

  return mismatch === 0
}
