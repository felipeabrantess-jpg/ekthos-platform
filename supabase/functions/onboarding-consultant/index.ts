// ============================================================
// Edge Function: onboarding-consultant v2
// Consultor de Onboarding da Ekthos — SSE streaming
//
// POST /onboarding-consultant
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, session_id?: string, plan_slug?: string }
// Returns: SSE stream
//   { type: 'token', content: '...' }
//   { type: 'done', session_id, block_index, total_blocks, is_complete, config? }
//   { type: 'error', message: '...' }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic         from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

// ── Env ────────────────────────────────────────────────────
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 4096
const TOTAL_BLOCKS = 6

// ── CORS ───────────────────────────────────────────────────
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// ── Helpers ────────────────────────────────────────────────
function sseData(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── System Prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o Consultor de Onboarding da Ekthos. Especialista sênior em gestão eclesiástica com 20 anos de experiência com igrejas evangélicas de todos os tamanhos.

Seu conhecimento profundo inclui: consolidação de visitantes, rede de células, discipulado, departamentos e ministérios, escola bíblica (Escola da Fé), dízimos e ofertas, escalas de louvor/mídia/recepção, hierarquia pastoral (pastor geral > pastor de células > supervisor > líder), conferências, retiros, EBD, batismos, ação social e missões.

SUA MISSÃO: Conversar com o pastor de forma acolhedora e pastoral, extrair TODAS as informações da operação da igreja dele, e no final gerar um JSON completo de configuração do CRM via tool_use.

REGRAS ABSOLUTAS:
1. Você NÃO é um formulário. É uma conversa real e humana. Adapte as perguntas conforme as respostas.
2. Se o pastor revelar uma dor operacional, comente com empatia e sugira o agente que resolve aquela dor.
3. Use linguagem cristã natural: "membro" não "lead", "célula" não "grupo", "consolidação" não "follow-up", "caminho de discipulado" não "funil", "afastamento" não "churn".
4. Nunca use termos corporativos no texto: "KPI", "churn", "funil", "prospect", "pipeline", "revenue", "CEO".
5. Seja empático, respeitoso e pastoral. O pastor está confiando a operação da igreja dele a você.
6. Faça no máximo 2-3 perguntas por mensagem. Não sobrecarregue.
7. Quando terminar de coletar todas as informações dos 6 blocos, use a tool configure_tenant para gerar o JSON.

BLOCOS DE PERGUNTAS (conduza nessa ordem, mas adapte conforme a conversa):

BLOCO 1 — Identidade da Igreja:
- Nome completo da igreja e nome curto (apelido)
- Cidade, estado, e se tem mais de uma sede ou congregação
- Upload do logotipo (peça de forma gentil)
- Cores da marca (ou detectar do logo automaticamente)
- Horários dos cultos regulares e eventos semanais fixos

BLOCO 2 — Operação Pastoral:
- Quais departamentos e ministérios a igreja tem (louvor, mídia, recepção, EBD, jovens, infantil, mulheres, homens, ação social, etc.)
- Processo completo desde a primeira visita: como o visitante vira membro ativo e depois líder?
- Hierarquia pastoral: quem responde a quem? Quantos pastores, supervisores, líderes de célula?
- Quantidade de células e como estão distribuídas pelas sedes
- Motivos mais comuns de afastamento de membros
- Já usam alguma automação? (WhatsApp Bot, planilha, outro sistema de gestão?)

BLOCO 3 — Gestão de Dados:
- Quais informações coletam dos membros hoje (ficha de cadastro)
- Campos específicos importantes: dizimista, batizado nas águas, batizado no Espírito, dons/talentos, estado civil, curso teológico, profissão
- Categorias de segmentação que usam: por sede, por status, por departamento, por faixa etária
- Têm base de dados existente para importar? (planilha Excel, outro sistema)

BLOCO 4 — Equipe e Permissões:
- Quem vai usar o sistema? Peça nome, email e função de cada pessoa (máx 10)
- Permissões: quem precisa ver tudo? Quem vê só a própria célula? Quem acessa só o financeiro?
- Alertas automáticos: quem deve ser avisado de quê? (visitante novo → consolidador; membro sumiu → líder; queda de frequência → pastora)
- Metas pastorais para o próximo ano: crescimento de membros, células, batismos, taxa de consolidação

BLOCO 5 — Agentes de Inteligência:
- Qual é o MAIOR desafio operacional da igreja hoje? (use para sugerir agentes específicos)
- Apresente os agentes disponíveis conforme o plano contratado
- Que métricas o pastor quer ver no dashboard toda semana?
- Com que frequência quer receber relatórios e por qual canal (WhatsApp/email/PDF)?

BLOCO 6 — Canais e Integrações:
- Canais de comunicação que a igreja já usa (WhatsApp, Instagram, email, telefone, outros)
- Integrações necessárias (Google Agenda, Google Planilhas, outros sistemas)

QUANDO TIVER TUDO: Use a tool configure_tenant para gerar o JSON completo. Diga ao pastor algo como: "Perfeito, tenho tudo que preciso para configurar o seu CRM! Em instantes vou preparar tudo personalizadamente para a sua igreja." Então chame a tool.`

// ── Tool: configure_tenant ─────────────────────────────────
const CONFIGURE_TENANT_TOOL = {
  name: 'configure_tenant',
  description: 'Gera o JSON completo de configuração do CRM quando todas as informações foram coletadas nos 6 blocos da conversa. Chamar apenas quando tiver informações suficientes de todos os blocos.',
  input_schema: {
    type: 'object',
    properties: {
      action:    { type: 'string', enum: ['configure_tenant_full'] },
      tenant: {
        type: 'object',
        properties: {
          name:       { type: 'string' },
          slug:       { type: 'string', description: 'slug URL-safe gerado do nome' },
          city:       { type: 'string' },
          state:      { type: 'string' },
          timezone:   { type: 'string', default: 'America/Sao_Paulo' },
          logo_url:   { type: 'string' },
          branding:   { type: 'object', properties: { primary_color: { type: 'string' }, secondary_color: { type: 'string' } } },
          multi_site: { type: 'boolean' },
          sites:      { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, city: { type: 'string' }, is_main: { type: 'boolean' } } } },
        },
        required: ['name', 'slug'],
      },
      subscription: {
        type: 'object',
        properties: {
          plan_slug:             { type: 'string', enum: ['chamado', 'missao', 'avivamento'] },
          price_cents:           { type: 'integer' },
          max_users:             { type: 'integer' },
          included_agents_count: { type: 'integer' },
        },
        required: ['plan_slug'],
      },
      departments: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, leader: { type: 'string' }, site: { type: 'string' } } },
      },
      cell_network: {
        type: 'object',
        properties: {
          total_cells:          { type: 'integer' },
          hierarchy:            { type: 'array', items: { type: 'string' } },
          distribution_by_site: { type: 'object' },
        },
      },
      pipeline: {
        type: 'object',
        properties: {
          stages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:        { type: 'string' },
                sla_hours:   { type: 'integer' },
                type:        { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          loss_reasons: { type: 'array', items: { type: 'string' } },
        },
      },
      custom_fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:       { type: 'string' },
            label:      { type: 'string' },
            type:       { type: 'string', enum: ['text', 'boolean', 'select', 'date', 'number'] },
            options:    { type: 'array', items: { type: 'string' } },
            required:   { type: 'boolean' },
            group:      { type: 'string' },
            show_when:  { type: 'string' },
            visibility: { type: 'string' },
          },
        },
      },
      users: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:        { type: 'string' },
            email:       { type: 'string' },
            role:        { type: 'string', enum: ['admin', 'pastor', 'supervisor', 'leader', 'treasurer', 'secretary'] },
            permissions: { type: 'object' },
            alerts:      { type: 'array', items: { type: 'string' } },
            site:        { type: 'string' },
          },
        },
      },
      team_goals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string' },
            target: { type: 'number' },
            period: { type: 'string' },
          },
        },
      },
      agents: {
        type: 'object',
        properties: {
          free:             { type: 'array', items: { type: 'string' } },
          included_in_plan: { type: 'array', items: { type: 'string' } },
          purchased:        { type: 'array', items: { type: 'string' } },
        },
      },
      automations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            trigger:        { type: 'string' },
            trigger_config: { type: 'object' },
            action:         { type: 'string' },
            action_config:  { type: 'object' },
            priority:       { type: 'integer' },
          },
        },
      },
      dashboard: {
        type: 'object',
        properties: {
          widgets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type:       { type: 'string' },
                label:      { type: 'string' },
                query:      { type: 'string' },
                target:     { type: 'number' },
                position:   { type: 'integer' },
                visibility: { type: 'string' },
              },
            },
          },
        },
      },
      events_calendar: {
        type: 'object',
        properties: {
          recurring: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:      { type: 'string' },
                day:       { type: 'string' },
                time:      { type: 'string' },
                frequency: { type: 'string' },
              },
            },
          },
        },
      },
      channels: {
        type: 'object',
        properties: {
          whatsapp:  { type: 'string' },
          instagram: { type: 'string' },
          email:     { type: 'string' },
        },
      },
      reports: {
        type: 'object',
        properties: {
          weekly:  { type: 'object', properties: { enabled: { type: 'boolean' }, channel: { type: 'string' } } },
          monthly: { type: 'object', properties: { enabled: { type: 'boolean' }, format: { type: 'string' } } },
        },
      },
      data_migration: {
        type: 'object',
        properties: {
          has_existing_data:  { type: 'boolean' },
          format:             { type: 'string' },
          estimated_records:  { type: 'integer' },
          file_url:           { type: 'string' },
        },
      },
      message_templates: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['action', 'tenant', 'subscription'],
  },
}

// ── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // ── Auth ────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  // ── Body ────────────────────────────────────────────────
  let body: { message: string; session_id?: string; plan_slug?: string }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const { message, plan_slug } = body
  let { session_id } = body

  if (!message?.trim()) return jsonErr('message é obrigatório', 400)

  // ── Session: find or create ─────────────────────────────
  let session: Record<string, unknown> | null = null

  if (session_id) {
    const { data } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()
    session = data
  }

  if (!session) {
    const { data, error } = await supabase
      .from('onboarding_sessions')
      .insert({
        user_id:     user.id,
        plan_slug:   plan_slug ?? null,
        status:      'active',
        block_index: 1,
        messages:    [],
      })
      .select()
      .single()
    if (error) return jsonErr(`Erro ao criar sessão: ${error.message}`, 500)
    session    = data
    session_id = (data as { id: string }).id
  }

  // ── Monta histórico de mensagens ────────────────────────
  const messages = (session.messages as Array<{ role: string; content: string }>) ?? []
  messages.push({ role: 'user', content: message.trim() })

  // ── SSE streaming ───────────────────────────────────────
  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantText = ''
      let configJson: unknown = null
      let isComplete = false

      try {
        const stream = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     SYSTEM_PROMPT,
          tools:      [CONFIGURE_TENANT_TOOL as Parameters<typeof anthropic.messages.stream>[0]['tools'][0]],
          messages:   messages.map(m => ({
            role:    m.role as 'user' | 'assistant',
            content: m.content,
          })),
        })

        // Stream de tokens de texto
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text
            assistantText += chunk
            controller.enqueue(sseData({ type: 'token', content: chunk }))
          }
        }

        // Verifica tool_use na mensagem final
        const finalMsg = await stream.finalMessage()
        const toolBlock = finalMsg.content.find(
          (b): b is { type: 'tool_use'; name: string; input: unknown } =>
            b.type === 'tool_use' && (b as { name?: string }).name === 'configure_tenant'
        )

        if (toolBlock) {
          configJson = toolBlock.input
          isComplete = true
          // Se Claude não emitiu texto antes da tool_use, emite mensagem padrão
          if (!assistantText) {
            const fallback = 'Perfeito! Tenho tudo que preciso para configurar o seu CRM personalizado. Preparando tudo agora...'
            assistantText = fallback
            controller.enqueue(sseData({ type: 'token', content: fallback }))
          }
        }

        // Salva resposta do assistente no histórico
        messages.push({ role: 'assistant', content: assistantText })

        // Calcula block_index com base no número de trocas
        const msgCount  = messages.length
        const blockIndex = Math.min(Math.ceil(msgCount / 8) + 1, TOTAL_BLOCKS)

        // Atualiza sessão
        const updatePayload: Record<string, unknown> = {
          messages,
          block_index: blockIndex,
          updated_at:  new Date().toISOString(),
        }
        if (isComplete && configJson) {
          updatePayload.config_json   = configJson
          updatePayload.status        = 'completed'
          updatePayload.completed_at  = new Date().toISOString()
        }

        await supabase
          .from('onboarding_sessions')
          .update(updatePayload)
          .eq('id', session_id)

        // Evento done — frontend usa para atualizar progresso e detectar conclusão
        controller.enqueue(sseData({
          type:         'done',
          session_id,
          block_index:  blockIndex,
          total_blocks: TOTAL_BLOCKS,
          is_complete:  isComplete,
          ...(isComplete && configJson ? { config: configJson } : {}),
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[onboarding-consultant] stream error:', msg)
        controller.enqueue(sseData({ type: 'error', message: msg }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      ...CORS,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
})
