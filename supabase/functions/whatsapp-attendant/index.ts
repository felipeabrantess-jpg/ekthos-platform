// ============================================================
// Edge Function: whatsapp-attendant
// Gera respostas personalizadas para visitantes e leads
// Modelo: claude-haiku-3-5 (máximo custo controlado)
// ============================================================

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { supabase, writeAuditLog, errorResponse, successResponse } from '../_shared/supabase-client.ts'
import { sendTextMessage } from '../_shared/whatsapp-api.ts'
import { TenantContext } from '../_shared/tenant-loader.ts'

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
})

// URL do webhook n8n para acionar follow-up
const N8N_FOLLOWUP_WEBHOOK = Deno.env.get('N8N_FOLLOWUP_WEBHOOK_URL')

interface AttendantRequest {
  churchId: string
  personId: string
  personName: string | null
  fromPhone: string
  text: string
  intent: string
  tenantContext: TenantContext
  isFirstContact: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido', 405)
  }

  let body: AttendantRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Body inválido', 400)
  }

  const {
    churchId, personId, personName, fromPhone,
    text, intent, tenantContext, isFirstContact,
  } = body

  if (!churchId || !personId || !fromPhone) {
    return errorResponse('Campos obrigatórios ausentes', 400)
  }

  // ──────────────────────────────────────────────────────────
  // Busca histórico recente (últimas 3 interações) para contexto
  // ──────────────────────────────────────────────────────────
  const { data: recentInteractions } = await supabase
    .from('interactions')
    .select('direction, content, created_at')
    .eq('church_id', churchId)
    .eq('person_id', personId)
    .eq('type', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(4) // 4 para excluir a mensagem atual

  const history = (recentInteractions ?? [])
    .slice(1) // exclui a mensagem atual (mais recente)
    .reverse()
    .map((i) => ({
      role: i.direction === 'inbound' ? 'user' : 'assistant',
      content: (i.content as { text?: string }).text ?? '',
    }))
    .filter((m) => m.content.length > 0)

  // ──────────────────────────────────────────────────────────
  // Monta o prompt do sistema (< 300 tokens)
  // ──────────────────────────────────────────────────────────
  const { labels } = tenantContext.settings
  const systemPrompt = buildSystemPrompt(tenantContext.churchName, labels, isFirstContact)

  // ──────────────────────────────────────────────────────────
  // Chama Haiku para gerar resposta personalizada
  // ──────────────────────────────────────────────────────────
  let responseText: string
  let tokensUsed = 0

  try {
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: text },
    ]

    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5',
      max_tokens: 200, // resposta curta para WhatsApp
      system: systemPrompt,
      messages,
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Resposta inesperada')

    responseText = content.text
    tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  } catch (err) {
    console.error('[whatsapp-attendant] Falha ao chamar Haiku:', err)
    responseText = `Oi! Recebi sua mensagem e em breve alguém da equipe da ${tenantContext.churchName} vai te responder. 🙏`
  }

  // ──────────────────────────────────────────────────────────
  // Envia a resposta via WhatsApp
  // ──────────────────────────────────────────────────────────
  try {
    await sendTextMessage(churchId, fromPhone, responseText)
  } catch (err) {
    console.error('[whatsapp-attendant] Falha ao enviar mensagem:', err)
    return errorResponse('Falha ao enviar mensagem WhatsApp', 500)
  }

  // ──────────────────────────────────────────────────────────
  // Registra interação outbound
  // ──────────────────────────────────────────────────────────
  await supabase.from('interactions').insert({
    church_id: churchId,
    person_id: personId,
    type: 'whatsapp',
    direction: 'outbound',
    content: { text: responseText, intent },
    agent: 'whatsapp-attendant',
    model_used: 'haiku',
    tokens_used: tokensUsed,
  })

  // ──────────────────────────────────────────────────────────
  // Se primeiro contato: cria no pipeline + aciona follow-up no n8n
  // ──────────────────────────────────────────────────────────
  if (isFirstContact && tenantContext.visitorStageId) {
    await supabase.from('person_pipeline').upsert(
      {
        church_id: churchId,
        person_id: personId,
        stage_id: tenantContext.visitorStageId,
        entered_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'church_id,person_id', ignoreDuplicates: false }
    )

    // Aciona workflow de follow-up no n8n (assíncrono, não-crítico)
    if (N8N_FOLLOWUP_WEBHOOK) {
      void triggerFollowUpWorkflow(churchId, personId, tenantContext.churchName)
    }
  }

  // ──────────────────────────────────────────────────────────
  // Registra em audit_logs
  // ──────────────────────────────────────────────────────────
  await writeAuditLog({
    church_id: churchId,
    entity_type: 'interaction',
    entity_id: personId,
    action: 'MESSAGE_SENT',
    actor_type: 'agent',
    actor_id: 'whatsapp-attendant',
    payload: {
      intent,
      is_first_contact: isFirstContact,
      response_preview: responseText.slice(0, 100),
    },
    model_used: 'haiku',
    tokens_used: tokensUsed,
  })

  return successResponse({ sent: true, tokens: tokensUsed })
})

// ──────────────────────────────────────────────────────────
// Monta o prompt de sistema da church (< 300 tokens)
// ──────────────────────────────────────────────────────────
function buildSystemPrompt(
  churchName: string,
  labels: TenantContext['settings']['labels'],
  isFirstContact: boolean
): string {
  const base = `Você é o assistente oficial da ${churchName}.
Tom: acolhedor, breve, sem enrolação. Máx 3 linhas por mensagem.
Use linguagem informal e amigável. Emojis com moderação.
Terminologia da igreja: grupos = "${labels.group}", membros = "${labels.member}".
NUNCA invente informações. NUNCA personifique o pastor.
Se não souber, diga que vai passar para a equipe.`

  if (isFirstContact) {
    return `${base}
Esta é a primeira mensagem desta pessoa. Seja especialmente acolhedor.
Pergunte o nome dela de forma natural ao final da resposta.`
  }

  return base
}

// ──────────────────────────────────────────────────────────
// Dispara webhook n8n para follow-up (não-crítico)
// ──────────────────────────────────────────────────────────
async function triggerFollowUpWorkflow(
  churchId: string,
  personId: string,
  churchName: string
): Promise<void> {
  try {
    await fetch(N8N_FOLLOWUP_WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ churchId, personId, churchName, triggeredAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(5_000),
    })
    console.log('[whatsapp-attendant] Follow-up n8n acionado para person:', personId)
  } catch (err) {
    // Não-crítico: falha no n8n não impede a resposta ao membro
    console.warn('[whatsapp-attendant] Falha ao acionar follow-up n8n (não crítico):', err)
  }
}
