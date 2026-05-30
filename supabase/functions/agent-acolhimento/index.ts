// ============================================================
// Edge Function: agent-acolhimento  v21 — Fase 6.3
// Agente de Acolhimento Pastoral — jornada 90 dias para visitantes
//
// POST /functions/v1/agent-acolhimento
// verify_jwt = false — chamada interna (cron / conversation-router)
//
// Modos de operação:
//   trigger_type: 'cron'             → batch de journeys pendentes (proativo)
//   trigger_type: 'journey'          → processa journey_id específica
//   trigger_type: 'internal'         → alias de 'journey'
//   trigger_type: 'inbound_message'  → resposta reativa a mensagem recebida
//     body: { conversation_id, message_id, church_id, person_id?, inbound_text }
//
// MUDANÇAS v19 (Fase 6.3 — Observabilidade):
//   - Importa logAgentExecution de _shared/log-agent-execution.ts
//   - runToolLoop acumula token usage (UsageTotals) e retorna { result, usage }
//   - processJourney: t0 + try/finally → logAgentExecution em 3 saídas
//     (rate_limited, success, error)
//   - processInbound: t0 + try/finally → logAgentExecution em 3 saídas
//     (rate_limited, success, error)
//   - Handler passa triggerType ('cron'|'journey') para processJourney
//
// MUDANÇAS v21 (2026-05-30 — D4 MEGA-ONDA CIRÚRGICA):
//   - processInbound: debit_agent_credits (best-effort) após runToolLoop sucesso
//     p_operation_type='inbound_reply', p_credits=1, p_related_entity_id=conversationId
//
// MUDANÇAS v20 (2026-05-30 — R-PREMIUM-GUARD §10 D7):
//   - Modo cron: filtro por churches com contrato ativo antes de processar journeys.
//     Usa agent_grants (revoked_at IS NULL + ends_at null/future) OU
//     subscription_agents (activation_status='active'). NÃO usa church_agent_config.
//
// MUDANÇAS v3 (Passo 6 mínimo viável):
//   - fetchChurchConfig passa a chamar get_agent_prompt_resolved (RPC)
//   - resolved_prompt substitui SYSTEM_BLOCK_A + SYSTEM_BLOCK_B_TEMPLATE
//   - Fallback seguro: se RPC falhar, usa hardcoded (comportamento v2)
//   - Log estruturado: { used_template, template_version, has_custom_instructions }
//
// MUDANÇAS v2 (Sprint 3B):
//   - Usa enqueue_message (conversation_messages + channel_dispatch_queue)
//     ao invés de send_whatsapp → dispatch-message (pipeline legado)
//   - checkAntiSpam lê conversation_messages (não agent_pending_messages)
//   - Novo modo inbound_message: resposta contextual via histórico da conversa
//
// Modelo: claude-haiku-4-5-20251001
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic        from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { AGENT_TOOLS, executeTool, checkAntiSpam } from '../_shared/agent-tools.ts'
import { logAgentExecution } from '../_shared/log-agent-execution.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic  = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const AGENT_SLUG = 'agent-acolhimento'
const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048
const BATCH_SIZE = 10

// ── CORS ───────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// BLOCOS DE SISTEMA HARDCODED — mantidos como FALLBACK SEGURO
// Usados se get_agent_prompt_resolved falhar (RPC indisponível ou erro)
// NÃO DELETAR — garantem continuidade operacional mesmo sem DB
// ─────────────────────────────────────────────────────────────

const SYSTEM_BLOCK_A = `
Você é o Agente de Acolhimento Pastoral da plataforma Ekthos Church — um assistente de inteligência artificial criado especificamente para ajudar igrejas evangélicas a não perderem nenhum visitante nos primeiros 90 dias.

## Sua Identidade

Você não é um robô de marketing. Você é um instrumento pastoral digital. Cada mensagem que você envia representa a atenção e o cuidado da liderança da igreja para com uma pessoa que deu um passo de fé ao visitar pela primeira vez. Você escreve como um pastor gentil escreveria — com calor humano, sem pressão, com graça.

Você pertence à plataforma Ekthos, desenvolvida pela Ekthos AI (ekthosai.com / ekthosai.net). Sua função principal é acompanhar visitantes e membros novos na jornada de integração pastoral — desde o primeiro contato (D+0) até a consolidação como membro ativo (D+90).

## A Jornada 90 Dias

A jornada é estruturada em touchpoints progressivos:
- **D+0** (imediato): Mensagem de boas-vindas calorosa, reconhecendo a visita
- **D+3** (3 dias depois): Follow-up gentil, verificando como foi a experiência
- **D+7** (1 semana): Convidar para próxima atividade ou culto
- **D+14** (2 semanas): Apresentar células, grupos de vida ou ministérios
- **D+30** (1 mês): Verificar integração, oferecer acompanhamento pastoral
- **D+60** (2 meses): Checar progresso espiritual, convidar para servir
- **D+90** (3 meses): Avaliação final da jornada, transição para membro consolidado

## Suas Capacidades (Ferramentas)

Você tem acesso a ferramentas para:
1. **read_person** — Ler dados completos da pessoa (nome, telefone, estágio, observações)
2. **read_acolhimento_journey** — Ver histórico da jornada (o que foi enviado, respostas, notas)
3. **create_acolhimento_journey** — Criar nova jornada para pessoa que ainda não tem
4. **update_acolhimento_journey** — Avançar o timer e registrar o que aconteceu
5. **enqueue_message** — Enviar mensagem via WhatsApp (pipeline real de conversas)
6. **update_pipeline_stage** — Avançar o estágio do pipeline quando a pessoa integrar
7. **read_church_schedule** — Ver agenda da igreja para convidar para eventos reais

## Regras Absolutas de Comunicação

1. **NUNCA mencione que você é um agente de IA** — escreva como a equipe pastoral da igreja
2. **NUNCA use linguagem corporativa** — proibidas palavras como "engajamento", "conversão", "lead", "funil"
3. **NUNCA pressione** — se a pessoa não respondeu, respeite o silêncio com graça
4. **SEMPRE personalize** — use o nome da pessoa em toda mensagem
5. **NUNCA envie mais de 1 mensagem por dia** para a mesma pessoa
6. **Respeite o horário** — nunca envie mensagens entre 21h e 8h (horário local da igreja)
7. **Limite semanal** — máximo 3 touchpoints por semana por pessoa
8. **Sensibilidade espiritual** — se a pessoa mencionou luto, doença, crise — escalone para o pastor humano, não envie mensagem automática

## Como Decidir o Que Fazer

Ao ser chamado para processar um touchpoint:
1. Leia os dados da pessoa (read_person)
2. Leia o histórico da jornada (read_acolhimento_journey)
3. Avalie o contexto: o que foi enviado antes? Houve resposta? Qual é o tom?
4. Decida: enviar mensagem? Apenas avançar o timer? Encerrar a jornada?
5. Se decidir enviar: monte uma mensagem personalizada e natural
6. Chame enqueue_message com a mensagem e o person_id ou conversation_id
7. Chame update_acolhimento_journey para avançar o timer
8. Se a pessoa já está integrada (aparece em células, batismo confirmado): use "complete"

## Quando NÃO Enviar Mensagem

- Pessoa já respondeu positivamente e está em processo ativo de integração → apenas avance o timer
- Última interação foi há menos de 24h → pule este touchpoint
- Observações indicam luto, crise familiar, hospitalização → escalone para pastor humano
- Pessoa solicitou para não ser contatada → encerre a jornada com status "cancelled"
`.trim()

const SYSTEM_BLOCK_B_TEMPLATE = (
  churchName:      string,
  denomination:    string,
  formality:       string,
  pastoralDepth:   string,
  emojiUsage:      string,
  preferredVerses: string[],
  sendWindow:      Record<string, unknown> | null,
  customOverrides: Record<string, unknown> | null,
) => `
## Perfil da Igreja

**Nome:** ${churchName}
**Denominação / Tradição:** ${denomination || 'Evangélica não-denominacional'}
**Estilo de comunicação:** ${formality === 'formal' ? 'Formal — use "você" com reverência, linguagem mais cuidadosa' : formality === 'informal' ? 'Informal — use "vc", emojis com moderação, tom jovem e próximo' : 'Semi-formal — equilibrado, acolhedor mas respeitoso'}
**Profundidade pastoral:** ${pastoralDepth === 'deep' ? 'Alta — pode usar referências bíblicas e linguagem teológica' : pastoralDepth === 'light' ? 'Leve — foco no relacionamento, menos linguagem religiosa formal' : 'Moderada — equilibrada entre calor relacional e fundamento bíblico'}
**Uso de emojis:** ${emojiUsage === 'none' ? 'Não usar emojis' : emojiUsage === 'high' ? 'Usar emojis com frequência para humanizar' : 'Usar emojis com moderação (máx 2-3 por mensagem)'}
**Versículos preferidos da liderança:** ${preferredVerses.length > 0 ? preferredVerses.join(', ') : 'A critério do agente (use versículos de boas-vindas e encorajamento)'}
${sendWindow ? `**Janela de envio personalizada:** das ${(sendWindow as {start?: number}).start || 8}h às ${(sendWindow as {end?: number}).end || 21}h` : '**Janela de envio:** 8h–21h (padrão)'}
${customOverrides ? `**Instruções customizadas da liderança:** ${JSON.stringify(customOverrides)}` : ''}

## Tom e Voz

Você escreve mensagens como se fosse um membro da equipe pastoral desta igreja — alguém que genuinamente se importa com o visitante. Suas mensagens devem:

- Ser curtas (máx 3-4 parágrafos no WhatsApp) — mensagens longas não são lidas
- Começar com o nome da pessoa para criar conexão imediata
- Usar linguagem natural do dia a dia, não liturgia formal
- Terminar com uma ação clara e suave: um convite, uma pergunta aberta, um encorajamento
- Nunca parecer um template — cada mensagem deve soar escrita especificamente para aquela pessoa

## Exemplos de Tom (adapte sempre ao contexto real da pessoa)

**D+0 (boas-vindas):** "Oi [Nome]! Foi muito bom ter você conosco hoje 😊 A gente ficou feliz com sua presença. Se tiver qualquer dúvida ou quiser conversar mais sobre a nossa comunidade, é só falar. Esperamos te ver em breve!"

**D+7 (convite para evento):** "Oi [Nome]! A [nome da igreja] tem um encontro especial neste [dia] às [hora] — seria ótimo te ver por aqui de novo. É uma oportunidade de conhecer mais pessoas da nossa família. Consegue vir?"

**D+30 (integração):** "Oi [Nome]! Como você tem estado? Já faz um mês desde que você nos visitou e queríamos saber se há algo com que possamos ajudar na sua caminhada. Nossos grupos de célula estão abertos se você quiser conhecer de perto a nossa comunidade 🙏"
`.trim()

// ── Tools permitidas por modo ──────────────────────────────
// Modo proativo (jornada/cron): usa enqueue_message com person_id
// Modo reativo (inbound): usa enqueue_message com conversation_id
const TOOLS_PROATIVO = AGENT_TOOLS.filter(t =>
  ['read_person', 'read_acolhimento_journey', 'create_acolhimento_journey',
   'update_acolhimento_journey', 'enqueue_message', 'update_pipeline_stage',
   'read_church_schedule'].includes(t.name)
)

const TOOLS_INBOUND = AGENT_TOOLS.filter(t =>
  ['read_person', 'read_acolhimento_journey', 'update_acolhimento_journey',
   'enqueue_message', 'update_pipeline_stage'].includes(t.name)
)

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

interface ResolvedPrompt {
  resolved_prompt:      string
  template_version:     number
  has_custom_config:    boolean
  custom_instructions:  string | null
}

interface LegacyConfig {
  formality:        string | null
  denomination:     string | null
  preferred_verses: string[] | null
  pastoral_depth:   string | null
  send_window:      Record<string, unknown> | null
  emoji_usage:      string | null
  custom_overrides: Record<string, unknown> | null
}

// v19: token usage acumulado por execução
interface UsageTotals {
  input_tokens:          number
  output_tokens:         number
  cache_read_tokens:     number
  cache_creation_tokens: number
}

// ─────────────────────────────────────────────────────────────
// BUSCAR CONFIG DA IGREJA (v3 — via RPC get_agent_prompt_resolved)
// ─────────────────────────────────────────────────────────────

async function fetchChurchConfig(churchId: string): Promise<{
  church:      { name?: string; timezone?: string; city?: string } | null
  agentConfig: LegacyConfig | null
  resolved:    ResolvedPrompt | null
}> {
  const [{ data: church }, rpcResult] = await Promise.all([
    supabaseAdmin
      .from('churches')
      .select('name, timezone, city')
      .eq('id', churchId)
      .maybeSingle(),
    supabaseAdmin
      .rpc('get_agent_prompt_resolved', {
        p_church_id:  churchId,
        p_agent_slug: AGENT_SLUG,
      })
      .single(),
  ])

  // Fallback: se RPC falhar, buscamos config legada para o SYSTEM_BLOCK_B_TEMPLATE
  let agentConfig: LegacyConfig | null = null
  let resolved:    ResolvedPrompt | null = null

  if (rpcResult.error || !rpcResult.data) {
    console.warn('[agent-acolhimento] RPC get_agent_prompt_resolved falhou, usando fallback hardcoded:', rpcResult.error?.message)
    // Buscar config estruturada para o fallback
    const { data: cfg } = await supabaseAdmin
      .from('church_agent_config')
      .select('formality, denomination, preferred_verses, forbidden_topics, pastoral_depth, send_window, emoji_usage, custom_overrides')
      .eq('church_id', churchId)
      .eq('agent_slug', AGENT_SLUG)
      .maybeSingle()
    agentConfig = cfg as LegacyConfig | null
  } else {
    resolved = rpcResult.data as ResolvedPrompt
  }

  return { church, agentConfig, resolved }
}

// ─────────────────────────────────────────────────────────────
// MONTAR BLOCOS DE SISTEMA (v3)
// Usa resolved_prompt da RPC se disponível; cai no hardcoded se não
// ─────────────────────────────────────────────────────────────

function buildSystemBlocks(
  resolved:    ResolvedPrompt | null,
  church:      { name?: string } | null,
  agentConfig: LegacyConfig | null,
  churchId:    string,
): { text: string; cache: boolean }[] {

  if (resolved) {
    // Caminho principal: prompt resolvido pela RPC (Camada 1 + 2 + 3)
    console.log('[agent-acolhimento] prompt source', {
      church_id:               churchId,
      used_template:           true,
      template_version:        resolved.template_version,
      has_custom_config:       resolved.has_custom_config,
      has_custom_instructions: resolved.custom_instructions != null,
    })
    return [{ text: resolved.resolved_prompt, cache: true }]
  }

  // Fallback hardcoded (v2) — garante operação se RPC indisponível
  console.warn('[agent-acolhimento] prompt source', {
    church_id:     churchId,
    used_template: false,
    reason:        'rpc_failed_using_hardcoded_fallback',
  })
  const systemBlockB = SYSTEM_BLOCK_B_TEMPLATE(
    church?.name || 'Igreja',
    agentConfig?.denomination || '',
    agentConfig?.formality || 'semiformal',
    agentConfig?.pastoral_depth || 'moderate',
    agentConfig?.emoji_usage || 'moderate',
    agentConfig?.preferred_verses || [],
    (agentConfig?.send_window as Record<string, unknown>) || null,
    (agentConfig?.custom_overrides as Record<string, unknown>) || null,
  )
  return [
    { text: SYSTEM_BLOCK_A, cache: true },
    { text: systemBlockB,   cache: true },
  ]
}

// ─────────────────────────────────────────────────────────────
// TOOL LOOP GENÉRICO  (v19 — retorna { result, usage })
// ─────────────────────────────────────────────────────────────

async function runToolLoop(
  systemBlocks: Array<{ text: string; cache: boolean }>,
  userMessage:  string,
  tools:        typeof AGENT_TOOLS,
  churchId:     string,
): Promise<{ result: string; usage: UsageTotals }> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ]

  const system = systemBlocks.map(b => ({
    type:          'text' as const,
    text:          b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }))

  let finalResult = 'no_action'
  let iterations  = 0
  const MAX_IT    = 10

  // v19: acumulador de tokens
  const totalUsage: UsageTotals = {
    input_tokens:          0,
    output_tokens:         0,
    cache_read_tokens:     0,
    cache_creation_tokens: 0,
  }

  while (iterations < MAX_IT) {
    iterations++

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     system as Anthropic.TextBlockParam[],
      tools:      tools as Anthropic.Tool[],
      messages,
    })

    // v19: acumular tokens de cada iteração
    const u = response.usage as Record<string, number>
    totalUsage.input_tokens          += u.input_tokens                    ?? 0
    totalUsage.output_tokens         += u.output_tokens                   ?? 0
    totalUsage.cache_read_tokens     += u.cache_read_input_tokens         ?? 0
    totalUsage.cache_creation_tokens += u.cache_creation_input_tokens     ?? 0

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      finalResult = textBlock && 'text' in textBlock ? textBlock.text : 'completed'
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          churchId,
          AGENT_SLUG,
        )

        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        })
      }

      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break // stop_reason inesperado
  }

  return { result: finalResult, usage: totalUsage }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAR UMA JOURNEY (modo proativo)  (v19 — logAgentExecution)
// ─────────────────────────────────────────────────────────────

async function processJourney(
  journeyId:   string,
  churchId:    string,
  triggerType: string = 'cron',
): Promise<{ ok: boolean; result?: string; error?: string }> {

  const t0 = Date.now()

  // Lock atômico — evita race condition entre instâncias do cron
  const { data: locked } = await supabaseAdmin
    .from('acolhimento_journey')
    .update({ status: 'processing' })
    .eq('id', journeyId)
    .eq('church_id', churchId)
    .eq('status', 'pending')
    .lte('next_touchpoint_at', new Date().toISOString())
    .select('id, person_id, current_touchpoint')
    .maybeSingle()

  if (!locked) {
    return { ok: true, result: 'skipped_already_processing' }
  }

  const personId = locked.person_id

  try {
    const { church, agentConfig, resolved } = await fetchChurchConfig(churchId)
    const churchTimezone = church?.timezone || 'America/Sao_Paulo'

    // Anti-spam check (v2 — lê conversation_messages)
    const spamCheck = await checkAntiSpam(churchId, personId, churchTimezone)
    if (!spamCheck.allowed) {
      const reschedule: Record<string, unknown> = { status: 'pending' }
      if (spamCheck.delay_until) reschedule.next_touchpoint_at = spamCheck.delay_until
      await supabaseAdmin
        .from('acolhimento_journey')
        .update(reschedule)
        .eq('id', journeyId)
        .eq('church_id', churchId)

      // v19: log anti-spam como 'skipped'
      await logAgentExecution(supabaseAdmin, {
        church_id:    churchId,
        agent_slug:   AGENT_SLUG,
        model:        MODEL,
        trigger_type: triggerType,
        status:       'skipped',
        duration_ms:  Date.now() - t0,
        error:        `anti_spam:${spamCheck.reason}`,
      })

      return { ok: true, result: `skipped_anti_spam:${spamCheck.reason}` }
    }

    const systemBlocks = buildSystemBlocks(resolved, church, agentConfig, churchId)

    const userMessage = `
Processe o touchpoint atual da jornada de acolhimento.

Journey ID: ${journeyId}
Person ID: ${personId}
Church ID: ${churchId}
Touchpoint atual: ${locked.current_touchpoint}
Timestamp: ${new Date().toISOString()}

Passos:
1. Use read_person para obter os dados da pessoa
2. Use read_acolhimento_journey para ver o histórico completo
3. Decida a ação ideal para este momento da jornada
4. Se for enviar mensagem: use enqueue_message com person_id="${personId}" e o texto personalizado
5. Use update_acolhimento_journey para avançar o timer (ou "complete" se encerrar)
6. Retorne um resumo da ação tomada

Seja conciso, pastoral e humano.
`.trim()

    const { result: finalResult, usage } = await runToolLoop(
      systemBlocks,
      userMessage,
      TOOLS_PROATIVO,
      churchId,
    )

    // Safety: reverter 'processing' se o agente não chamou update_acolhimento_journey
    const { data: journeyAfter } = await supabaseAdmin
      .from('acolhimento_journey')
      .select('status')
      .eq('id', journeyId)
      .maybeSingle()

    if (journeyAfter?.status === 'processing') {
      await supabaseAdmin
        .from('acolhimento_journey')
        .update({ status: 'pending' })
        .eq('id', journeyId)
        .eq('church_id', churchId)
    }

    // Debitar créditos (best-effort)
    try {
      await supabaseAdmin.rpc('debit_agent_credits', {
        p_church_id:         churchId,
        p_agent_slug:        AGENT_SLUG,
        p_credits:           1,
        p_operation_type:    'touchpoint',
        p_related_entity_id: journeyId,
        p_description:       `Touchpoint ${locked.current_touchpoint} — ${personId}`,
      })
    } catch (creditErr) {
      console.warn('[agent-acolhimento] debit_agent_credits falhou (não crítico):', creditErr)
    }

    // v19: log sucesso
    await logAgentExecution(supabaseAdmin, {
      church_id:             churchId,
      agent_slug:            AGENT_SLUG,
      model:                 MODEL,
      trigger_type:          triggerType,
      status:                'success',
      duration_ms:           Date.now() - t0,
      input_tokens:          usage.input_tokens,
      output_tokens:         usage.output_tokens,
      cache_read_tokens:     usage.cache_read_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
    })

    return { ok: true, result: finalResult }

  } catch (err) {
    console.error('[agent-acolhimento] processJourney error:', err)

    // Safety: reverter 'processing' para 'pending'
    await supabaseAdmin
      .from('acolhimento_journey')
      .update({ status: 'pending' })
      .eq('id', journeyId)
      .eq('church_id', churchId)
      .eq('status', 'processing')

    // v19: log erro
    await logAgentExecution(supabaseAdmin, {
      church_id:    churchId,
      agent_slug:   AGENT_SLUG,
      model:        MODEL,
      trigger_type: triggerType,
      status:       'error',
      duration_ms:  Date.now() - t0,
      error:        String(err),
    })

    return { ok: false, error: String(err) }
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAR MENSAGEM INBOUND (modo reativo)  (v19 — logAgentExecution)
// Chamado pelo conversation-router quando ownership=agent
// ─────────────────────────────────────────────────────────────

async function processInbound(
  conversationId: string,
  _messageId:     string,
  churchId:       string,
  inboundText:    string,
): Promise<{ ok: boolean; result?: string; error?: string }> {

  const t0 = Date.now()

  // 1. Buscar dados da conversa — valida ownership e pega person_id
  // F2 v27: adicionado filtro church_id para defesa em profundidade (cross-tenant protection)
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('church_id, ownership, agent_slug, person_id, contact_phone')
    .eq('id', conversationId)
    .eq('church_id', churchId)
    .maybeSingle()

  if (!conv) {
    return { ok: false, error: 'conversation_not_found' }
  }

  // Isolamento cross-tenant: rejeitar conversas de outra church
  if (conv.church_id !== churchId) {
    console.warn(`[agent-acolhimento] FORBIDDEN conv=${conversationId} conv.church_id=${conv.church_id} req.church_id=${churchId}`)
    return { ok: false, error: 'forbidden: conversa de outra church' }
  }

  // Não responder se humano assumiu — conversation-router já filtra, mas dupla checagem
  if (conv.ownership !== 'agent') {
    console.log(`[agent-acolhimento] ${conversationId} ownership=${conv.ownership} — ignorando`)
    return { ok: true, result: 'skipped_not_agent_ownership' }
  }

  // Rate limit: máx 5 respostas automáticas por conversa em 5 minutos
  // DEVE ocorrer antes de qualquer chamada ao Claude Sonnet
  // NOTA: count: 'exact' com head:true retorna null no Deno runtime (bug supabase-js v2).
  //       Usamos select('id').limit(5) e medimos data.length — mais confiável.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recentMsgs } = await supabaseAdmin
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'agent')
    .gte('created_at', fiveMinAgo)
    .limit(5)

  const recentCount = recentMsgs?.length ?? 0

  if (recentCount >= 5) {
    console.warn(`[agent-acolhimento] RATE_LIMIT conv=${conversationId} outbound_agent_5min=${recentCount}`)
    // Notificar admins (best-effort)
    try {
      const { data: admins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('church_id', churchId)
        .in('role', ['admin', 'pastor_celulas'])
      for (const admin of admins ?? []) {
        await supabaseAdmin.from('notifications').insert({
          church_id:       churchId,
          user_id:         admin.user_id,
          title:           'Rate limit atingido — resposta automática pausada',
          body:            `A conversa atingiu 5 respostas automáticas em 5 minutos. Possível spam ou loop.`,
          type:            'warning',
          read:            false,
          link:            `/conversas/${conversationId}`,
          automation_name: 'inbound_rate_limit',
        })
      }
    } catch { /* não crítico */ }

    // v19: log rate_limited
    await logAgentExecution(supabaseAdmin, {
      church_id:    churchId,
      agent_slug:   AGENT_SLUG,
      model:        MODEL,
      trigger_type: 'inbound_message',
      status:       'rate_limited',
      duration_ms:  Date.now() - t0,
      error:        'max 5 respostas automáticas por conversa em 5 minutos',
    })

    return { ok: false, error: 'rate_limit_exceeded', result: 'max 5 respostas automáticas por conversa em 5 minutos' }
  }

  // 2. Buscar config da igreja (v3 — via RPC)
  const { church, agentConfig, resolved } = await fetchChurchConfig(churchId)

  // 3. Buscar histórico da conversa (últimas 20 mensagens, ordem cronológica)
  const { data: history } = await supabaseAdmin
    .from('conversation_messages')
    .select('direction, sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20)

  const historyStr = (history ?? [])
    .reverse()
    .map(m => {
      const label = m.sender_type === 'contact'
        ? 'Contato'
        : m.sender_type === 'human'
        ? 'Pastor/Staff'
        : 'Agente'
      return `[${label} · ${new Date(m.created_at as string).toLocaleString('pt-BR')}]: ${m.content}`
    })
    .join('\n')

  const systemBlocks = buildSystemBlocks(resolved, church, agentConfig, churchId)

  const personContext = conv.person_id
    ? `Person ID disponível: ${conv.person_id} (use read_person para obter os dados)`
    : `Contato não vinculado a uma pessoa cadastrada. Telefone: ${conv.contact_phone}`

  const userMessage = `
Você recebeu uma nova mensagem numa conversa de acolhimento pastoral.

conversation_id: ${conversationId}
${personContext}
Church ID: ${churchId}

== HISTÓRICO DA CONVERSA ==
${historyStr || '(Sem mensagens anteriores)'}

== NOVA MENSAGEM RECEBIDA ==
${inboundText}

Sua tarefa:
${conv.person_id
  ? `1. Use read_person para entender quem é essa pessoa
2. Use read_acolhimento_journey para ver o estágio da jornada (se existir)`
  : `1. Esta pessoa ainda não está cadastrada. Responda de forma pastoral e acolhedora.`
}
3. Responda de forma pastoral, natural e contextualizada com o histórico acima
4. Use enqueue_message com conversation_id="${conversationId}" para enviar sua resposta
5. Se a resposta da pessoa indicar integração, avanço ou crise: atualize a jornada ou o pipeline adequadamente

Responda como a equipe pastoral da igreja — com calor, sem pressão, sem revelar que é IA.
`.trim()

  try {
    const { result: finalResult, usage } = await runToolLoop(
      systemBlocks,
      userMessage,
      TOOLS_INBOUND,
      churchId,
    )

    // v21: Debitar créditos — inbound_reply (best-effort)
    try {
      await supabaseAdmin.rpc('debit_agent_credits', {
        p_church_id:         churchId,
        p_agent_slug:        AGENT_SLUG,
        p_credits:           1,
        p_operation_type:    'inbound_reply',
        p_related_entity_id: conversationId,
        p_description:       `Resposta inbound — conv=${conversationId}`,
      })
    } catch (creditErr) {
      console.warn('[agent-acolhimento] debit_agent_credits falhou (não crítico):', creditErr)
    }

    // v19: log sucesso inbound
    await logAgentExecution(supabaseAdmin, {
      church_id:             churchId,
      agent_slug:            AGENT_SLUG,
      model:                 MODEL,
      trigger_type:          'inbound_message',
      status:                'success',
      duration_ms:           Date.now() - t0,
      input_tokens:          usage.input_tokens,
      output_tokens:         usage.output_tokens,
      cache_read_tokens:     usage.cache_read_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
    })

    return { ok: true, result: finalResult }

  } catch (err) {
    console.error('[agent-acolhimento] processInbound error:', err)

    // v19: log erro inbound
    await logAgentExecution(supabaseAdmin, {
      church_id:    churchId,
      agent_slug:   AGENT_SLUG,
      model:        MODEL,
      trigger_type: 'inbound_message',
      status:       'error',
      duration_ms:  Date.now() - t0,
      error:        String(err),
    })

    return { ok: false, error: String(err) }
  }
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ ok: false, error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const triggerType = (body.trigger_type ?? body.trigger ?? 'cron') as string

  // ── MODO BATCH (cron) ─────────────────────────────────────
  if (triggerType === 'cron') {
    // ═══════════════════════════════════════════════════════
    // R-PREMIUM-GUARD v20 — filtra apenas churches com
    // agent-acolhimento contratado ativo antes de processar.
    // Evita executar jornadas para churches sem contrato.
    // ═══════════════════════════════════════════════════════
    const nowIso = new Date().toISOString()

    const [{ data: grantChurches }, { data: subChurches }] = await Promise.all([
      supabaseAdmin
        .from('agent_grants')
        .select('church_id')
        .eq('agent_slug', AGENT_SLUG)
        .is('revoked_at', null)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
      supabaseAdmin
        .from('subscription_agents')
        .select('subscriptions!inner(church_id)')
        .eq('agent_slug', AGENT_SLUG)
        .eq('activation_status', 'active'),
    ])

    const contractedIds = new Set<string>([
      ...(grantChurches?.map((r: { church_id: string }) => r.church_id) ?? []),
      ...(subChurches?.map((r: { subscriptions: { church_id: string } }) => r.subscriptions.church_id) ?? []),
    ])

    if (contractedIds.size === 0) {
      console.log('[agent-acolhimento] cron: no contracted churches with agent-acolhimento')
      return json({ ok: true, processed: 0, message: 'no_contracted_churches' })
    }

    console.log(`[agent-acolhimento] cron: ${contractedIds.size} contracted churches`)

    const { data: journeys } = await supabaseAdmin
      .from('acolhimento_journey')
      .select('id, church_id')
      .eq('status', 'pending')
      .lte('next_touchpoint_at', new Date().toISOString())
      .in('church_id', Array.from(contractedIds))
      .limit(BATCH_SIZE)

    if (!journeys || journeys.length === 0) {
      return json({ ok: true, processed: 0, message: 'no_pending_journeys' })
    }

    const results = await Promise.allSettled(
      journeys.map(j => processJourney(j.id, j.church_id, 'cron'))
    )

    const summary = results.map((r, i) => ({
      journey_id: journeys[i].id,
      status:     r.status,
      result:     r.status === 'fulfilled' ? r.value : String(r.reason),
    }))

    return json({ ok: true, processed: journeys.length, summary })
  }

  // ── MODO SINGLE JOURNEY (journey / internal) ─────────────
  if (triggerType === 'journey' || triggerType === 'internal') {
    const journeyId = body.journey_id as string
    const churchId  = body.church_id  as string

    if (!journeyId || !churchId) {
      return json({ ok: false, error: 'journey_id e church_id obrigatórios para trigger journey/internal' }, 400)
    }

    const result = await processJourney(journeyId, churchId, 'journey')
    return json(result)
  }

  // ── MODO INBOUND (chamado pelo conversation-router) ───────
  if (triggerType === 'inbound_message') {
    const conversationId = body.conversation_id as string
    const messageId      = body.message_id      as string
    const churchId       = body.church_id       as string
    const inboundText    = body.inbound_text    as string

    if (!conversationId || !churchId || !inboundText) {
      return json({
        ok: false,
        error: 'conversation_id, church_id e inbound_text obrigatórios para trigger inbound_message',
      }, 400)
    }

    const result = await processInbound(conversationId, messageId, churchId, inboundText)
    return json(result)
  }

  return json({ ok: false, error: `trigger_type inválido: ${triggerType}` }, 400)
})
