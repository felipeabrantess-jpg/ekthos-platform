// ============================================================
// Edge Function: agent-haiku-triagem  v5 — Fase 6.3
//
// POST /functions/v1/agent-haiku-triagem
// verify_jwt = false — chamada interna via webhook-receiver
//
// Recebe:
//   { conversation_id, message_id, church_id, ownership,
//     agent_slug, person_id, inbound_text }
//
// Responsabilidades:
//   1. Classificar mensagens inbound com Haiku 4.5 (barato, rápido)
//   2. Rotear:
//      - ownership='human'     → notificar liderança, não processar
//      - category=handoff_humano → transferir, notificar, confirmar ao membro
//      - escalate_to_sonnet    → R-PREMIUM-GUARD → agent-acolhimento
//      - trivial/informativa   → responder diretamente via Haiku
//   3. Salvar classificação em conversation_messages.metadata
//   4. Notificar via internal_notifications quando necessário
//
// MUDANÇAS v5 (2026-05-30 — R-PREMIUM-GUARD §10 D7):
//   - hasAcolhimentoContract(): verifica agent_grants OU subscription_agents
//     antes de qualquer escalation para agent-acolhimento.
//   - escalateToSonnet() refatorada para async com guard inline.
//   - NÃO usa _shared/agent-guard.ts (campo legado .active vs activation_status).
//
// MUDANÇAS v4 (Fase 6.3 — Observabilidade):
//   - Importa logAgentExecution de _shared/log-agent-execution.ts
//   - classifyMessage retorna { classification, usage }
//   - Handler envolto em try/finally → logAgentExecution
//     com trigger_type='inbound_message' e tokens acumulados
//
// Modelo: claude-haiku-4-5-20251001 (via ANTHROPIC_HAIKU_MODEL env)
// Cache: 3 system blocks com cache_control:ephemeral
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic        from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { logAgentExecution } from '../_shared/log-agent-execution.ts'
import { guardAgent }        from '../_shared/agent-guard.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const HAIKU_MODEL       = Deno.env.get('ANTHROPIC_HAIKU_MODEL') ?? 'claude-haiku-4-5-20251001'
const AGENT_SLUG        = 'agent-haiku-triagem'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InboundPayload {
  conversation_id: string
  message_id:      string
  church_id:       string
  ownership:       string
  agent_slug:      string | null
  person_id:       string | null
  inbound_text:    string
}

interface HaikuClassification {
  category:           'trivial' | 'informativa' | 'pastoral' | 'handoff_humano'
  sentiment:          'positive' | 'neutral' | 'negative' | 'distressed'
  intent:             'saudacao' | 'duvida_agenda' | 'pedido_oracao' | 'crise_emocional' | 'informacao' | 'handoff_request' | 'agradecimento' | 'outro'
  confidence:         number
  escalate_to_sonnet: boolean
  haiku_response:     string | null
  reasoning:          string
}

// v4: token usage da classificação
interface UsageTotals {
  input_tokens:          number
  output_tokens:         number
  cache_read_tokens:     number
  cache_creation_tokens: number
}

// ─── System blocks (cached) ───────────────────────────────────────────────────

const SYSTEM_BLOCK_A = {
  type: 'text' as const,
  text: `Você é o agente de triagem da Ekthos Church — um CRM pastoral para igrejas evangélicas brasileiras. Seu papel é classificar mensagens recebidas via WhatsApp de membros e visitantes, e decidir o roteamento mais adequado. Você opera com latência mínima; seja preciso, eficiente e pastoral.`.trim(),
  cache_control: { type: 'ephemeral' as const },
}

const SYSTEM_BLOCK_B = {
  type: 'text' as const,
  text: `## Regras de Classificação

### Categorias (escolha exatamente 1)
- **trivial**: saudações curtas, "ok", "obrigado", confirmações simples ("sim", "não"), emojis isolados, respostas de uma palavra
- **informativa**: dúvidas sobre horários, endereço, eventos, datas, programação, pedidos de informação factual sobre a igreja
- **pastoral**: pedidos de oração, aconselhamento, relatos de dificuldades espirituais, busca por Deus, perguntas de fé, desabafos de tristeza, relatos de problemas familiares
- **handoff_humano**: pedido explícito de falar com um humano ("quero falar com alguém", "pode me passar para o pastor?", "preciso de uma pessoa", "fala comigo você", "não quero falar com robô")

### Sentimento (escolha exatamente 1)
- **positive**: alegria, gratidão, entusiasmo, fé afirmativa, celebração
- **neutral**: tom informativo, neutro, sem carga emocional clara
- **negative**: frustração, decepção, reclamação, tristeza comum, desânimo
- **distressed**: angústia intensa, crise emocional aguda, desespero, menção a suicídio, pensamentos de desistir da vida, trauma agudo, abandono extremo, pânico

### Intent (escolha exatamente 1)
- **saudacao**: oi, olá, bom dia, boa tarde, boa noite, tudo bem?
- **duvida_agenda**: horário de culto, datas de eventos, programação da semana
- **pedido_oracao**: pedir intercessão, oração por situação específica
- **crise_emocional**: sofrimento intenso, crise existencial, desespero declarado
- **informacao**: dados factuais sobre a igreja (endereço, pastor, atividades)
- **handoff_request**: quer falar com humano explicitamente
- **agradecimento**: obrigado, grato, que Deus abençoe, gratidão
- **outro**: não se encaixa claramente em nenhuma categoria acima

### Regras de escalamento para Sonnet (escalate_to_sonnet)
Defina **escalate_to_sonnet: true** quando QUALQUER das condições abaixo for verdadeira:
1. category = "pastoral" OU category = "handoff_humano"
2. sentiment = "distressed"
3. confidence < 0.70 (incerteza alta sobre a classificação)

### haiku_response
- Para **trivial** ou **informativa** com confidence ≥ 0.70: gere uma resposta curta (máximo 3 frases), calorosa e pastoral em português brasileiro. Sem markdown, sem emojis excessivos. Tom de quem cuida da pessoa.
- Para todos os outros casos (escalate_to_sonnet = true): defina **haiku_response: null**. O Sonnet responderá.`.trim(),
  cache_control: { type: 'ephemeral' as const },
}

const SYSTEM_BLOCK_C = {
  type: 'text' as const,
  text: `## Formato de Saída Obrigatório

Responda APENAS com JSON válido, sem blocos markdown, sem texto antes ou depois:

{"category":"trivial|informativa|pastoral|handoff_humano","sentiment":"positive|neutral|negative|distressed","intent":"saudacao|duvida_agenda|pedido_oracao|crise_emocional|informacao|handoff_request|agradecimento|outro","confidence":0.95,"escalate_to_sonnet":false,"haiku_response":"Texto da resposta aqui, ou null","reasoning":"Motivo breve em 1 frase"}

Não inclua nada além do JSON. Não use aspas simples. Não use comentários.`.trim(),
  cache_control: { type: 'ephemeral' as const },
}

// ─── Classificação Haiku  (v4 — retorna { classification, usage }) ─────────────

async function classifyMessage(
  anthropic: Anthropic,
  inboundText: string,
): Promise<{ classification: HaikuClassification; usage: UsageTotals }> {
  const response = await anthropic.messages.create({
    model:     HAIKU_MODEL,
    max_tokens: 512,
    system:    [SYSTEM_BLOCK_A, SYSTEM_BLOCK_B, SYSTEM_BLOCK_C],
    messages:  [
      {
        role:    'user',
        content: `Mensagem recebida via WhatsApp:\n\n"${inboundText.slice(0, 2000)}"\n\nClassifique e decida o roteamento.`,
      },
    ],
  })

  const u = response.usage as Record<string, number>
  const usage: UsageTotals = {
    input_tokens:          u.input_tokens                ?? 0,
    output_tokens:         u.output_tokens               ?? 0,
    cache_read_tokens:     u.cache_read_input_tokens     ?? 0,
    cache_creation_tokens: u.cache_creation_input_tokens ?? 0,
  }

  console.log(`[${AGENT_SLUG}] usage: input=${usage.input_tokens} output=${usage.output_tokens} cache_write=${usage.cache_creation_tokens} cache_read=${usage.cache_read_tokens}`)

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const raw = rawText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  try {
    return { classification: JSON.parse(raw) as HaikuClassification, usage }
  } catch {
    console.error(`[${AGENT_SLUG}] JSON parse error — raw: ${raw.slice(0, 300)}`)
    return {
      classification: {
        category:           'pastoral',
        sentiment:          'neutral',
        intent:             'outro',
        confidence:         0.0,
        escalate_to_sonnet: true,
        haiku_response:     null,
        reasoning:          `Parse error — escalando para Sonnet. Raw: ${raw.slice(0, 100)}`,
      },
      usage,
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enqueueOutboundMessage(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  churchId: string,
  text: string,
): Promise<void> {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('channel_id, contact_phone')
    .eq('id', conversationId)
    .maybeSingle()

  if (convErr || !conv) {
    console.error(`[${AGENT_SLUG}] enqueueOutbound: conversa não encontrada`, convErr?.message)
    return
  }

  const { data: msg, error: msgErr } = await supabase
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      church_id:       churchId,
      direction:       'outbound',
      sender_type:     'agent',
      sender_id:       AGENT_SLUG,
      content:         text,
      content_type:    'text',
      status:          'pending',
    })
    .select('id')
    .single()

  if (msgErr || !msg) {
    console.error(`[${AGENT_SLUG}] enqueueOutbound: insert conversation_messages falhou`, msgErr?.message)
    return
  }

  const { error: qErr } = await supabase
    .from('channel_dispatch_queue')
    .insert({
      message_id:      msg.id,
      conversation_id: conversationId,
      church_id:       churchId,
      channel_id:      conv.channel_id,
      to_phone:        conv.contact_phone,
      content:         text,
      status:          'pending',
      scheduled_at:    new Date().toISOString(),
    })

  if (qErr) {
    console.error(`[${AGENT_SLUG}] enqueueOutbound: insert channel_dispatch_queue falhou`, qErr.message)
    await supabase
      .from('conversation_messages')
      .update({ status: 'failed', error_detail: qErr.message })
      .eq('id', msg.id)
    return
  }

  await supabase
    .from('conversations')
    .update({
      last_message_at:      new Date().toISOString(),
      last_message_preview: text.slice(0, 120),
    })
    .eq('id', conversationId)

  console.log(`[${AGENT_SLUG}] enqueueOutbound: msg=${msg.id} conv=${conversationId}`)
}

async function notifyInternal(
  supabase: ReturnType<typeof createClient>,
  churchId: string,
  conversationId: string,
  title: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from('internal_notifications')
    .insert({
      notification_type: 'general',
      church_id:         churchId,
      agent_slug:        AGENT_SLUG,
      title,
      message,
      metadata:          { conversation_id: conversationId },
      status:            'pending',
    })

  if (error) {
    console.error(`[${AGENT_SLUG}] notifyInternal error:`, error.message)
  }
}

// ═══════════════════════════════════════════════════════════
// R-PREMIUM-GUARD v5 — verifica contratação ativa de
// agent-acolhimento antes de qualquer escalation.
// canon §10 D7 inegociável.
// NÃO usa _shared/agent-guard.ts (campo legado .active).
// ═══════════════════════════════════════════════════════════

async function hasAcolhimentoContract(
  supabase: ReturnType<typeof createClient>,
  churchId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString()

  const { data: grantRow } = await supabase
    .from('agent_grants')
    .select('id')
    .eq('church_id', churchId)
    .eq('agent_slug', 'agent-acolhimento')
    .is('revoked_at', null)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle()

  if (grantRow) return true

  const { data: subRow } = await supabase
    .from('subscription_agents')
    .select('id, subscriptions!inner(church_id)')
    .eq('agent_slug', 'agent-acolhimento')
    .eq('activation_status', 'active')
    .eq('subscriptions.church_id', churchId)
    .limit(1)
    .maybeSingle()

  return !!subRow
}

async function escalateToSonnet(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  messageId: string,
  churchId: string,
  inboundText: string,
  haiku_response_fallback?: string | null,
): Promise<void> {
  // R-PREMIUM-GUARD: verifica contrato antes de chamar agent-acolhimento
  const hasContract = await hasAcolhimentoContract(supabase, churchId)
  if (!hasContract) {
    console.log(`[guard] no_active_contract church_id=${churchId} agent=agent-acolhimento`)
    await supabase.from('audit_logs').insert({
      church_id,
      entity_type: 'conversation',
      entity_id:   conversationId,
      action:      'haiku_escalation_skipped',
      actor_type:  'system',
      actor_id:    'agent-haiku-triagem',
      payload: {
        reason:      'no_active_contract',
        agent_slug:  'agent-acolhimento',
        conversation_id: conversationId,
      },
      model_used:  null,
      tokens_used: 0,
    }).catch((e: unknown) => console.warn('[agent-haiku-triagem] audit_log falhou (não crítico):', e))

    // Fallback: envia resposta haiku se disponível, senão resposta genérica
    const fallback = haiku_response_fallback ?? 'Recebemos sua mensagem. Nossa equipe pastoral retornará em breve. 🙏'
    await enqueueOutboundMessage(supabase, conversationId, churchId, fallback)
    return
  }

  const url = `${SUPABASE_URL}/functions/v1/agent-acolhimento`
  fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      message_id:      messageId,
      church_id:       churchId,
      inbound_text:    inboundText,
      trigger_type:    'inbound_message',
    }),
    signal: AbortSignal.timeout(3_000),
  }).catch(err => console.error(`[${AGENT_SLUG}] escalateToSonnet error:`, err?.message))
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── Handler principal  (v4 — try/finally com logAgentExecution) ──────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: InboundPayload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { conversation_id, message_id, church_id, ownership, inbound_text } = body

  if (!conversation_id || !message_id || !church_id || !inbound_text) {
    return json({ error: 'Missing required fields: conversation_id, message_id, church_id, inbound_text' }, 400)
  }

  const supabase  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  // ── Guard: validação de ownership (cross-tenant protection) ──────────────────
  // F2 correto: SELECT com filtro church_id explícito no banco
  const { data: convOwner } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversation_id)
    .eq('church_id', church_id)
    .maybeSingle()
  if (!convOwner) {
    return json({ error: 'Conversation not found or church mismatch' }, 403)
  }

  // ── Guard: verificação de grant (agente ativado para a church) ────────────────
  const grant = await guardAgent(church_id, AGENT_SLUG)
  if (!grant.allowed) {
    return json({ error: grant.reason ?? 'Agente não autorizado para esta conta' }, 403)
  }

  console.log(`[${AGENT_SLUG}] inbound conv=${conversation_id} ownership=${ownership} len=${inbound_text.length}`)

  const t0 = Date.now()

  // ── 1. Roteamento por ownership ──────────────────────────────────────────────
  if (ownership === 'human') {
    await notifyInternal(
      supabase,
      church_id,
      conversation_id,
      '💬 Nova mensagem (conversa humana)',
      `Nova mensagem em conversa atribuída a humano: "${inbound_text.slice(0, 100)}"`,
    )
    console.log(`[${AGENT_SLUG}] routed=human (skip classification)`)
    // Ownership human: skipped sem custo de tokens — não logar (sem chamada Anthropic)
    return json({ ok: true, routed: 'human' })
  }

  // v4: acumulador de tokens (pode haver chamadas adicionais no roteamento)
  let totalUsage: UsageTotals = {
    input_tokens: 0, output_tokens: 0,
    cache_read_tokens: 0, cache_creation_tokens: 0,
  }
  let logStatus = 'success'
  let logError:  string | undefined

  try {

    // ── 2. Classificação com Haiku ─────────────────────────────────────────────
    let classification: HaikuClassification
    try {
      const result = await classifyMessage(anthropic, inbound_text)
      classification = result.classification
      totalUsage     = result.usage
    } catch (err) {
      console.error(`[${AGENT_SLUG}] classifyMessage threw:`, err)
      await escalateToSonnet(supabase, conversation_id, message_id, church_id, inbound_text)
      logStatus = 'error'
      logError  = String(err)
      return json({ ok: true, routed: 'sonnet_fallback', error: 'classification_failed' })
    }

    console.log(`[${AGENT_SLUG}] classification:`, JSON.stringify({
      category:    classification.category,
      sentiment:   classification.sentiment,
      confidence:  classification.confidence,
      escalate:    classification.escalate_to_sonnet,
    }))

    // ── 3. Persistir classificação em conversation_messages.metadata ──────────
    await supabase
      .from('conversation_messages')
      .update({ metadata: { haiku_classification: classification } })
      .eq('id', message_id)
      .then(({ error }) => {
        if (error) console.error(`[${AGENT_SLUG}] metadata update error:`, error.message)
      })

    // ── 4. Roteamento ─────────────────────────────────────────────────────────

    const { category, sentiment, escalate_to_sonnet, haiku_response } = classification

    // 4a. Handoff para humano
    if (category === 'handoff_humano') {
      await supabase
        .from('conversations')
        .update({ ownership: 'human' })
        .eq('id', conversation_id)

      await notifyInternal(
        supabase,
        church_id,
        conversation_id,
        '🤝 Membro pediu falar com humano',
        `Um membro solicitou atendimento humano. Motivo: ${classification.reasoning}`,
      )

      await enqueueOutboundMessage(
        supabase,
        conversation_id,
        church_id,
        'Entendido! Vou chamar alguém da nossa equipe para continuar essa conversa com você. Um momento! 🙏',
      )

      console.log(`[${AGENT_SLUG}] routed=handoff_humano`)
      return json({ ok: true, routed: 'handoff_humano', classification })
    }

    // 4b. Escalate para Sonnet (R-PREMIUM-GUARD v5 inside escalateToSonnet)
    if (escalate_to_sonnet || sentiment === 'distressed') {
      await escalateToSonnet(supabase, conversation_id, message_id, church_id, inbound_text)
      console.log(`[${AGENT_SLUG}] routed=sonnet (escalate=${escalate_to_sonnet} distressed=${sentiment === 'distressed'})`)
      return json({ ok: true, routed: 'sonnet', classification })
    }

    // 4c. Haiku responde diretamente
    if (haiku_response) {
      await enqueueOutboundMessage(supabase, conversation_id, church_id, haiku_response)
      console.log(`[${AGENT_SLUG}] routed=haiku (direct response, confidence=${classification.confidence})`)
      return json({ ok: true, routed: 'haiku', classification })
    }

    // Fallback (R-PREMIUM-GUARD v5 inside escalateToSonnet)
    await escalateToSonnet(supabase, conversation_id, message_id, church_id, inbound_text)
    console.log(`[${AGENT_SLUG}] routed=sonnet_fallback (haiku_response null without escalate flag)`)
    return json({ ok: true, routed: 'sonnet_fallback', classification })

  } catch (err) {
    console.error(`[${AGENT_SLUG}] handler error:`, err)
    logStatus = 'error'
    logError  = String(err)
    return json({ ok: false, error: String(err) }, 500)

  } finally {
    // v4: logar apenas se houve chamada Anthropic (tokens > 0)
    if (totalUsage.input_tokens > 0) {
      await logAgentExecution(supabase, {
        church_id:             church_id,
        agent_slug:            AGENT_SLUG,
        model:                 HAIKU_MODEL,
        trigger_type:          'inbound_message',
        status:                logStatus,
        duration_ms:           Date.now() - t0,
        input_tokens:          totalUsage.input_tokens,
        output_tokens:         totalUsage.output_tokens,
        cache_read_tokens:     totalUsage.cache_read_tokens,
        cache_creation_tokens: totalUsage.cache_creation_tokens,
        error:                 logError,
      })
    }
  }
})
