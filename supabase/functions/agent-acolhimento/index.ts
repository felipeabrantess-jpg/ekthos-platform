// ============================================================
// Edge Function: agent-acolhimento  v1
// Agente de Acolhimento Pastoral — jornada 90 dias para visitantes
//
// POST /functions/v1/agent-acolhimento
// verify_jwt = false — chamada interna (cron / dispatch-person-event)
//
// Modos de operação:
//   trigger_type: 'cron'     → busca até 10 journeys pendentes e processa batch
//   trigger_type: 'journey'  → processa journey_id específica (+ church_id obrigatório)
//   trigger_type: 'internal' → alias de 'journey', usado por dispatch-person-event
//
// Modelo: claude-sonnet-4-6 (Sonnet premium pastoral)
// Cache: 2 blocos grandes (≥1024 tokens cada) — identidade+regras / perfil+tom
//
// Sprint 2 — 01/05/2026
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic        from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { AGENT_TOOLS, executeTool } from '../_shared/agent-tools.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic  = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const AGENT_SLUG = 'agent-acolhimento'
const MODEL      = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048
const BATCH_SIZE = 10  // máx journeys por execução de cron

// ── Anti-spam constants ────────────────────────────────────
const MAX_MSGS_PER_DAY  = 1
const MAX_TP_PER_WEEK   = 3
const SILENCE_START_H   = 21  // hora início silêncio (local da igreja)
const SILENCE_END_H     = 8   // hora fim silêncio

// ── CORS ───────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

// ─────────────────────────────────────────────────────────────
// BLOCOS DE SISTEMA — 2 blocos cacheados grandes (≥1024 tokens)
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
5. **send_whatsapp** — Enviar mensagem via WhatsApp (o canal principal)
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
6. Chame send_whatsapp com a mensagem
7. Chame update_acolhimento_journey para avançar o timer
8. Se a pessoa já está integrada (aparece em células, batismo confirmado): use "complete"

## Quando NÃO Enviar Mensagem

- Pessoa já respondeu positivamente e está em processo ativo de integração → apenas avance o timer
- Última interação foi há menos de 24h → pule este touchpoint
- Observações indicam luto, crise familiar, hospitalização → escalone para pastor humano
- Pessoa solicitou para não ser contatada → encerre a jornada com status "cancelled"
`.trim()

const SYSTEM_BLOCK_B_TEMPLATE = (
  churchName: string,
  denomination: string,
  formality: string,
  pastoralDepth: string,
  emojiUsage: string,
  preferredVerses: string[],
  sendWindow: Record<string, unknown> | null,
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

// ─────────────────────────────────────────────────────────────
// ANTI-SPAM
// ─────────────────────────────────────────────────────────────

async function checkAntiSpam(
  churchId: string,
  personId: string,
  churchTimezone: string
): Promise<{ allowed: boolean; reason?: string; delay_until?: string }> {

  // 1. Verificar janela de silêncio (horário local da igreja)
  const now = new Date()
  const localHour = parseInt(
    now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: churchTimezone || 'America/Sao_Paulo' })
  )
  if (localHour >= SILENCE_START_H || localHour < SILENCE_END_H) {
    // Calcular próximo horário permitido (8h local)
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(SILENCE_END_H, 0, 0, 0)
    return { allowed: false, reason: 'silence_window', delay_until: tomorrow.toISOString() }
  }

  // 2. Máx 1 mensagem por dia para esta pessoa
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const { count: msgsToday } = await supabaseAdmin
    .from('agent_pending_messages')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .contains('payload', { person_id: personId })
    .gte('created_at', todayStart.toISOString())
    .neq('status', 'failed')
    .neq('status', 'cancelled')

  if ((msgsToday ?? 0) >= MAX_MSGS_PER_DAY) {
    return { allowed: false, reason: 'daily_limit_reached' }
  }

  // 3. Máx 3 touchpoints por semana
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)
  const { count: msgsWeek } = await supabaseAdmin
    .from('agent_pending_messages')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .contains('payload', { person_id: personId })
    .gte('created_at', weekStart.toISOString())
    .neq('status', 'failed')
    .neq('status', 'cancelled')

  if ((msgsWeek ?? 0) >= MAX_TP_PER_WEEK) {
    return { allowed: false, reason: 'weekly_limit_reached' }
  }

  return { allowed: true }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAR UMA JOURNEY
// ─────────────────────────────────────────────────────────────

async function processJourney(
  journeyId: string,
  churchId: string
): Promise<{ ok: boolean; result?: string; error?: string }> {

  // 1. Lock atômico — evita race condition entre instâncias do cron
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
    // 2. Buscar configuração da igreja
    const [{ data: church }, { data: agentConfig }] = await Promise.all([
      supabaseAdmin
        .from('churches')
        .select('name, timezone, city')
        .eq('id', churchId)
        .maybeSingle(),
      supabaseAdmin
        .from('church_agent_config')
        .select('formality, denomination, preferred_verses, forbidden_topics, pastoral_depth, send_window, emoji_usage, custom_overrides')
        .eq('church_id', churchId)
        .eq('agent_slug', AGENT_SLUG)
        .maybeSingle(),
    ])

    const churchTimezone = church?.timezone || 'America/Sao_Paulo'

    // 3. Anti-spam check
    const spamCheck = await checkAntiSpam(churchId, personId, churchTimezone)
    if (!spamCheck.allowed) {
      // Reagenda pra depois da janela de silêncio se for esse o motivo
      const reschedule: Record<string, unknown> = { status: 'pending' }
      if (spamCheck.delay_until) {
        reschedule.next_touchpoint_at = spamCheck.delay_until
      }
      await supabaseAdmin
        .from('acolhimento_journey')
        .update(reschedule)
        .eq('id', journeyId)
        .eq('church_id', churchId)

      return { ok: true, result: `skipped_anti_spam:${spamCheck.reason}` }
    }

    // 4. Montar prompt Bloco B com perfil da igreja
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

    // 5. Montar mensagem de usuário com contexto runtime (sem cache)
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
4. Se for enviar mensagem: use send_whatsapp com texto personalizado
5. Use update_acolhimento_journey para avançar o timer (ou "complete" se encerrar)
6. Retorne um resumo da ação tomada

Seja conciso, pastoral e humano.
`.trim()

    // 6. Tool loop com Sonnet — 2 blocos de sistema cacheados
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage }
    ]

    // Filtra as tools relevantes para acolhimento (exclui volunteers placeholder)
    const acolhimentoTools = AGENT_TOOLS.filter(t =>
      ['read_person', 'read_acolhimento_journey', 'create_acolhimento_journey',
       'update_acolhimento_journey', 'send_whatsapp', 'update_pipeline_stage',
       'read_church_schedule'].includes(t.name)
    )

    let finalResult = 'no_action'
    let iterations = 0
    const MAX_ITERATIONS = 10

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const response = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          // Bloco A: Identidade + Regras (≥1024 tokens, cacheado)
          {
            type:          'text',
            text:          SYSTEM_BLOCK_A,
            cache_control: { type: 'ephemeral' }
          } as Anthropic.TextBlockParam & { cache_control: { type: 'ephemeral' } },
          // Bloco B: Perfil da Igreja + Tom (≥1024 tokens, cacheado)
          {
            type:          'text',
            text:          systemBlockB,
            cache_control: { type: 'ephemeral' }
          } as Anthropic.TextBlockParam & { cache_control: { type: 'ephemeral' } },
        ],
        tools:    acolhimentoTools as Anthropic.Tool[],
        messages,
      })

      // Adiciona resposta do assistente ao histórico
      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        // Sonnet terminou — extrai texto final
        const textBlock = response.content.find(b => b.type === 'text')
        finalResult = textBlock && 'text' in textBlock ? textBlock.text : 'completed'
        break
      }

      if (response.stop_reason === 'tool_use') {
        // Processar tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            churchId,
            AGENT_SLUG
          )

          toolResults.push({
            type:       'tool_result',
            tool_use_id: block.id,
            content:    JSON.stringify(result),
          })
        }

        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // stop_reason inesperado
      break
    }

    // 7. Se journey ainda está 'processing' (Sonnet não chamou update_acolhimento_journey),
    //    reverter para 'pending' como safety net
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

    // 8. Debitar créditos
    try {
      await supabaseAdmin.rpc('debit_agent_credits', {
        p_church_id:        churchId,
        p_agent_slug:       AGENT_SLUG,
        p_credits:          1,
        p_operation_type:   'touchpoint',
        p_related_entity_id: journeyId,
        p_description:      `Touchpoint ${locked.current_touchpoint} — ${personId}`,
      })
    } catch (creditErr) {
      console.warn('[agent-acolhimento] debit_agent_credits falhou (não crítico):', creditErr)
    }

    return { ok: true, result: finalResult }

  } catch (err) {
    console.error('[agent-acolhimento] processJourney error:', err)

    // Safety: reverter status de 'processing' para 'pending' em caso de erro
    await supabaseAdmin
      .from('acolhimento_journey')
      .update({ status: 'pending' })
      .eq('id', journeyId)
      .eq('church_id', churchId)
      .eq('status', 'processing')

    return { ok: false, error: String(err) }
  }
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const triggerType = (body.trigger_type as string) || 'cron'

  // ── MODO BATCH (cron) ──────────────────────────────────
  if (triggerType === 'cron') {
    const { data: journeys } = await supabaseAdmin
      .from('acolhimento_journey')
      .select('id, church_id')
      .eq('status', 'pending')
      .lte('next_touchpoint_at', new Date().toISOString())
      .limit(BATCH_SIZE)

    if (!journeys || journeys.length === 0) {
      return json({ ok: true, processed: 0, message: 'no_pending_journeys' })
    }

    const results = await Promise.allSettled(
      journeys.map(j => processJourney(j.id, j.church_id))
    )

    const summary = results.map((r, i) => ({
      journey_id: journeys[i].id,
      status:     r.status,
      result:     r.status === 'fulfilled' ? r.value : String(r.reason),
    }))

    return json({ ok: true, processed: journeys.length, summary })
  }

  // ── MODO SINGLE JOURNEY (journey / internal) ───────────
  if (triggerType === 'journey' || triggerType === 'internal') {
    const journeyId = body.journey_id as string
    const churchId  = body.church_id  as string

    if (!journeyId || !churchId) {
      return json({ ok: false, error: 'journey_id e church_id obrigatórios para trigger journey/internal' }, 400)
    }

    const result = await processJourney(journeyId, churchId)
    return json(result)
  }

  return json({ ok: false, error: `trigger_type inválido: ${triggerType}` }, 400)
})
