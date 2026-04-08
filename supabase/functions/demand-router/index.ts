// ============================================================
// Edge Function: demand-router
// Classifica a intenção de uma mensagem e decide a ação
//
// Estratégia de custo:
//   1. Regras por palavras-chave  → $0 (cobre ~60% dos casos)
//   2. Haiku como fallback        → ~$0.00036/mensagem
//
// Sempre prioriza a opção mais barata que resolve o problema
// ============================================================

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { supabase, writeAuditLog, errorResponse, successResponse } from '../_shared/supabase-client.ts'
import { sendTextMessage } from '../_shared/whatsapp-api.ts'
import { TenantContext } from '../_shared/tenant-loader.ts'

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
})

// ──────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────
type Intent =
  | 'INFO_CULTO'
  | 'DONACAO'
  | 'ORACAO'
  | 'INTERESSE_GRUPO'
  | 'VISITANTE_NOVO'
  | 'SUPORTE_GERAL'
  | 'FORA_ESCOPO'

type Action = 'TEMPLATE' | 'ESCALATE' | 'DONATION_AGENT' | 'ATTENDANT'
type ModelUsed = 'rule' | 'haiku' | 'template'

interface ClassificationResult {
  intent: Intent
  confidence: number
  action: Action
  modelUsed: ModelUsed
  tokensUsed: number
}

interface RouterRequest {
  churchId: string
  personId: string
  personName: string | null
  fromPhone: string
  messageId: string
  text: string
  tenantContext: TenantContext
  isFirstContact?: boolean
}

// ──────────────────────────────────────────────────────────
// Palavras-chave por intenção (sem LLM)
// Expandir conforme feedback de produção
// ──────────────────────────────────────────────────────────
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  ORACAO: [
    'oração', 'ore por', 'preciso de oração', 'orar', 'pedido de oração',
    'estou mal', 'precisando de ajuda', 'momento difícil', 'luto', 'doente',
  ],
  DONACAO: [
    'dízimo', 'dizimo', 'oferta', 'pix', 'como contribuir', 'doação',
    'contribuição', 'quero dízimar', 'como dou', 'transferência',
  ],
  INFO_CULTO: [
    'culto', 'horário', 'que horas', 'domingo', 'sábado', 'sabado',
    'onde fica', 'endereço', 'programação', 'agenda', 'quando tem',
    'que dia', 'próximo culto', 'reunião',
  ],
  INTERESSE_GRUPO: [
    'grupo', 'célula', 'celula', 'gc', 'casa', 'quero participar',
    'comunidade', 'pequeno grupo', 'rede', 'quero me conectar',
  ],
  VISITANTE_NOVO: [], // detectado por ausência de histórico, não por keyword
  SUPORTE_GERAL: ['ajuda', 'dúvida', 'pergunta', 'informação', 'queria saber'],
  FORA_ESCOPO: [],
}

// ──────────────────────────────────────────────────────────
// Mapeamento intent → action
// ──────────────────────────────────────────────────────────
const INTENT_TO_ACTION: Record<Intent, Action> = {
  ORACAO: 'ESCALATE',
  DONACAO: 'DONATION_AGENT',
  INFO_CULTO: 'TEMPLATE',
  INTERESSE_GRUPO: 'ATTENDANT',
  VISITANTE_NOVO: 'ATTENDANT',
  SUPORTE_GERAL: 'ATTENDANT',
  FORA_ESCOPO: 'TEMPLATE',
}

// ──────────────────────────────────────────────────────────
// Handler principal
// ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido', 405)
  }

  let body: RouterRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Body inválido', 400)
  }

  const { churchId, personId, personName, fromPhone, text, tenantContext, isFirstContact } = body

  if (!churchId || !personId || !fromPhone || !text) {
    return errorResponse('Campos obrigatórios ausentes: churchId, personId, fromPhone, text', 400)
  }

  // ──────────────────────────────────────────────────────────
  // Verifica se está fora do horário de suporte
  // ──────────────────────────────────────────────────────────
  if (!tenantContext.isWithinSupportHours) {
    await sendTextMessage(
      churchId,
      fromPhone,
      tenantContext.settings.out_of_hours_message
    )
    await recordOutboundInteraction(churchId, personId, tenantContext.settings.out_of_hours_message, 'template')
    return successResponse({ action: 'OUT_OF_HOURS', intent: null })
  }

  // ──────────────────────────────────────────────────────────
  // Verifica se é primeiro contato (sem histórico de interações)
  // ──────────────────────────────────────────────────────────
  const firstContact = isFirstContact ?? await checkIsFirstContact(churchId, personId)

  // ──────────────────────────────────────────────────────────
  // ETAPA 1: Classificação por palavras-chave (custo = $0)
  // ──────────────────────────────────────────────────────────
  let classification = classifyByKeywords(text.toLowerCase(), firstContact)

  // ──────────────────────────────────────────────────────────
  // ETAPA 2: Fallback para Haiku se confiança < 0.70
  // ──────────────────────────────────────────────────────────
  if (classification.confidence < 0.70) {
    classification = await classifyWithHaiku(text, tenantContext)
  }

  // Registra uso de LLM em audit_logs
  await writeAuditLog({
    church_id: churchId,
    entity_type: 'interaction',
    entity_id: personId,
    action: 'INTENT_CLASSIFIED',
    actor_type: 'agent',
    actor_id: 'demand-router',
    payload: {
      intent: classification.intent,
      confidence: classification.confidence,
      action: classification.action,
      text_preview: text.slice(0, 100),
    },
    model_used: classification.modelUsed,
    tokens_used: classification.tokensUsed,
  })

  // ──────────────────────────────────────────────────────────
  // Executa a ação determinada
  // ──────────────────────────────────────────────────────────
  await executeAction(classification, {
    churchId,
    personId,
    personName,
    fromPhone,
    text,
    tenantContext,
    firstContact,
  })

  return successResponse({
    intent: classification.intent,
    action: classification.action,
    confidence: classification.confidence,
    model: classification.modelUsed,
  })
})

// ──────────────────────────────────────────────────────────
// Classifica por palavras-chave sem custo de LLM
// ──────────────────────────────────────────────────────────
function classifyByKeywords(
  text: string,
  isFirstContact: boolean
): ClassificationResult {
  // Oração tem prioridade máxima (sempre escala)
  for (const keyword of INTENT_KEYWORDS.ORACAO) {
    if (text.includes(keyword)) {
      return { intent: 'ORACAO', confidence: 0.95, action: 'ESCALATE', modelUsed: 'rule', tokensUsed: 0 }
    }
  }

  // Doação
  for (const keyword of INTENT_KEYWORDS.DONACAO) {
    if (text.includes(keyword)) {
      return { intent: 'DONACAO', confidence: 0.90, action: 'DONATION_AGENT', modelUsed: 'rule', tokensUsed: 0 }
    }
  }

  // Info sobre culto
  for (const keyword of INTENT_KEYWORDS.INFO_CULTO) {
    if (text.includes(keyword)) {
      return { intent: 'INFO_CULTO', confidence: 0.90, action: 'TEMPLATE', modelUsed: 'rule', tokensUsed: 0 }
    }
  }

  // Interesse em grupo
  for (const keyword of INTENT_KEYWORDS.INTERESSE_GRUPO) {
    if (text.includes(keyword)) {
      return { intent: 'INTERESSE_GRUPO', confidence: 0.85, action: 'ATTENDANT', modelUsed: 'rule', tokensUsed: 0 }
    }
  }

  // Visitante novo detectado por ausência de histórico
  if (isFirstContact) {
    return { intent: 'VISITANTE_NOVO', confidence: 0.80, action: 'ATTENDANT', modelUsed: 'rule', tokensUsed: 0 }
  }

  // Não classificado — fallback para Haiku
  return { intent: 'SUPORTE_GERAL', confidence: 0.40, action: 'ATTENDANT', modelUsed: 'rule', tokensUsed: 0 }
}

// ──────────────────────────────────────────────────────────
// Fallback: classifica com Haiku (custo mínimo)
// ──────────────────────────────────────────────────────────
async function classifyWithHaiku(
  text: string,
  ctx: TenantContext
): Promise<ClassificationResult> {
  const systemPrompt = `Você classifica mensagens enviadas para uma igreja chamada "${ctx.churchName}".
Responda APENAS com JSON válido, sem texto extra.
Categorias possíveis: INFO_CULTO, DONACAO, ORACAO, INTERESSE_GRUPO, VISITANTE_NOVO, SUPORTE_GERAL, FORA_ESCOPO`

  const userPrompt = `Mensagem: "${text}"
JSON esperado: {"intent": "CATEGORIA", "confidence": 0.0}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5',
      max_tokens: 60, // resposta JSON pequena
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Resposta inesperada do Haiku')

    const parsed = JSON.parse(content.text) as { intent: Intent; confidence: number }
    const intent = parsed.intent as Intent
    const confidence = parsed.confidence ?? 0.70
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

    return {
      intent,
      confidence,
      action: INTENT_TO_ACTION[intent] ?? 'ATTENDANT',
      modelUsed: 'haiku',
      tokensUsed,
    }
  } catch (err) {
    console.error('[demand-router] Falha na classificação Haiku:', err)
    // Fallback seguro: SUPORTE_GERAL → ATTENDANT
    return { intent: 'SUPORTE_GERAL', confidence: 0.50, action: 'ATTENDANT', modelUsed: 'haiku', tokensUsed: 0 }
  }
}

// ──────────────────────────────────────────────────────────
// Executa a ação com base na classificação
// ──────────────────────────────────────────────────────────
async function executeAction(
  classification: ClassificationResult,
  ctx: {
    churchId: string
    personId: string
    personName: string | null
    fromPhone: string
    text: string
    tenantContext: TenantContext
    firstContact: boolean
  }
): Promise<void> {
  const { action, intent } = classification
  const { churchId, personId, personName, fromPhone, tenantContext, firstContact } = ctx

  switch (action) {
    case 'ESCALATE': {
      // Notifica os contatos de escalada configurados
      const escalationMsg = formatEscalationMessage(tenantContext, fromPhone, personName, intent, ctx.text)
      for (const contact of tenantContext.settings.escalation_contacts) {
        if (contact.role === 'pastoral' || contact.role === 'geral') {
          await sendTextMessage(churchId, contact.whatsapp, escalationMsg)
        }
      }
      // Responde ao membro com mensagem de acolhimento
      const memberMsg = 'Recebemos sua mensagem com carinho. Vou chamar alguém da equipe para falar com você agora. 🙏'
      await sendTextMessage(churchId, fromPhone, memberMsg)
      await recordOutboundInteraction(churchId, personId, memberMsg, 'rule')
      break
    }

    case 'DONATION_AGENT': {
      // Chama a Edge Function donation-agent (futura) — por ora usa template simples
      const donationMsg = `Para dízimos e ofertas, acesse o link configurado pela ${tenantContext.churchName}. Em breve mais informações! 🙏`
      await sendTextMessage(churchId, fromPhone, donationMsg)
      await recordOutboundInteraction(churchId, personId, donationMsg, 'template')
      break
    }

    case 'TEMPLATE': {
      // Resposta baseada em template de church_settings
      const templateMsg = getTemplateResponse(intent, tenantContext)
      await sendTextMessage(churchId, fromPhone, templateMsg)
      await recordOutboundInteraction(churchId, personId, templateMsg, 'template')
      break
    }

    case 'ATTENDANT': {
      // Delega ao whatsapp-attendant para resposta personalizada
      const attendantUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-attendant`
      await fetch(attendantUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          churchId,
          personId,
          personName,
          fromPhone,
          text: ctx.text,
          intent,
          tenantContext,
          isFirstContact: firstContact,
        }),
        signal: AbortSignal.timeout(25_000),
      })
      break
    }
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

async function checkIsFirstContact(
  churchId: string,
  personId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('interactions')
    .select('*', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .eq('person_id', personId)
    .eq('type', 'whatsapp')

  return (count ?? 0) <= 1 // <= 1 pois a mensagem atual já foi inserida
}

function getTemplateResponse(intent: Intent, ctx: TenantContext): string {
  const name = ctx.churchName
  switch (intent) {
    case 'INFO_CULTO':
      return `Oi! 😊 Os cultos da ${name} acontecem toda semana. Para horários e endereço atualizados, acompanhe nossas redes sociais ou pergunte aqui!`
    case 'FORA_ESCOPO':
      return `Oi! Sou o assistente da ${name}. Posso te ajudar com informações sobre cultos, grupos e contribuições. Em que posso ajudar? 😊`
    default:
      return `Oi! Recebi sua mensagem e já estou te direcionando. Um momento! 🙏`
  }
}

function formatEscalationMessage(
  ctx: TenantContext,
  fromPhone: string,
  personName: string | null,
  intent: string,
  text: string
): string {
  return `[EKTHOS — ESCALADA]
Igreja: ${ctx.churchName}
Contato: ${personName ?? 'Não identificado'} | ${fromPhone}
Motivo: ${intent}
Mensagem: "${text.slice(0, 200)}"
Ação sugerida: Responder pessoalmente com urgência`
}

async function recordOutboundInteraction(
  churchId: string,
  personId: string,
  text: string,
  modelUsed: string
): Promise<void> {
  const { error } = await supabase.from('interactions').insert({
    church_id: churchId,
    person_id: personId,
    type: 'whatsapp',
    direction: 'outbound',
    content: { text },
    agent: 'demand-router',
    model_used: modelUsed,
    tokens_used: 0,
  })
  if (error) console.error('[demand-router] Erro ao registrar outbound:', error.message)
}
