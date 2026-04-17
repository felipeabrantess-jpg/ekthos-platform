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

const MODEL           = 'claude-haiku-4-5-20251001'
const MAX_TOKENS      = 4096
const TOTAL_QUESTIONS = 20

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
const SYSTEM_PROMPT = `Você é o Consultor de Onboarding da Ekthos. Especialista em gestão eclesiástica com 20 anos de experiência com igrejas evangélicas de todos os tamanhos.

SUA MISSÃO: Conduzir o pastor por exatamente 20 perguntas, uma por vez, de forma acolhedora e eficiente. No final, gerar o JSON de configuração do CRM via tool_use configure_tenant.

REGRAS ABSOLUTAS:
1. SEMPRE faça EXATAMENTE UMA pergunta por vez. Uma por mensagem. Nunca duas.
2. Após cada resposta, escreva UMA frase breve de acolhimento antes da próxima pergunta.
3. Use [WIDGET:select_one] ou [WIDGET:select_many] em todas as perguntas com opções. Texto livre SOMENTE em P1, P2 e P20.
4. Máximo 1 emoji por mensagem.
5. Só faça as perguntas da lista abaixo. Nenhuma outra.
6. Se o pastor responder algo inesperado, acolha brevemente e siga para a próxima pergunta.
7. P6 só aparece se P5 = "Sim, temos células ativas". Senão, pule para P7.
8. Em P20, deixe claro que é opcional e que pode responder "não" para pular.
9. Use linguagem cristã: "membro" não "lead", "célula" não "grupo", "caminho de discipulado" não "funil", "afastamento" não "churn".
10. Nunca use: "KPI", "pipeline", "revenue", "CEO", "ROI", "churn".

FORMATOS DE WIDGET:

Coloque o bloco IMEDIATAMENTE após a pergunta, sem texto depois.

Seleção única (clique envia automaticamente):
[WIDGET:select_one]
- Opção A
- Opção B

Seleção múltipla (tem botão "Confirmar"):
[WIDGET:select_many]
- Opção A
- Opção B

━━━ AS 20 PERGUNTAS (nessa ordem exata, uma por vez) ━━━

── BLOCO 1: IDENTIDADE ──

P1 — Qual o nome completo da sua igreja?
[TEXTO LIVRE — sem widget]

P2 — Em qual cidade e estado vocês estão?
[TEXTO LIVRE — sem widget]

P3 — Quantas sedes ou congregações a sua igreja tem?
[WIDGET:select_one]
- 1 sede
- 2 sedes
- 3 a 5 sedes
- Mais de 5 sedes

P4 — Qual a faixa de membros ativos da sua igreja?
[WIDGET:select_one]
- Até 50 membros
- 50 a 150 membros
- 150 a 300 membros
- 300 a 500 membros
- 500 a 1.000 membros
- Mais de 1.000 membros

── BLOCO 2: ESTRUTURA ──

P5 — Vocês trabalham com células ou grupos pequenos?
[WIDGET:select_one]
- Sim, temos células ativas
- Não, mas queremos começar
- Não trabalhamos com células

P6 — Quantas células aproximadamente? [FAZER SOMENTE SE P5 = "Sim, temos células ativas"]
[WIDGET:select_one]
- Até 5 células
- 5 a 15 células
- 15 a 30 células
- Mais de 30 células

P7 — Quais ministérios ou departamentos a igreja tem?
[WIDGET:select_many]
- Louvor e Adoração
- Mídia e Comunicação
- Infantil
- Jovens
- Mulheres
- Homens
- Recepção
- Escola Bíblica (EBD)
- Ação Social
- Missionário
- Intercessão
- Casais
- Diaconia

P8 — Como é organizada a liderança da sua igreja?
[WIDGET:select_one]
- Pastor único lidera tudo
- Pastor + conselho/presbitério
- Pastor + pastores auxiliares
- Equipe pastoral com áreas definidas

── BLOCO 3: OPERAÇÃO ──

P9 — Como funciona o caminho do visitante na sua igreja?
[WIDGET:select_one]
- Visitante → Frequentador → Membro (informal)
- Temos classe de integração/batismo estruturada
- Não temos processo definido ainda
- Cada congregação tem seu processo

P10 — Como vocês controlam a frequência dos membros hoje?
[WIDGET:select_one]
- Planilha ou papel
- Sistema ou aplicativo
- Pelos líderes de célula
- Não controlamos

P11 — Como é feito o controle financeiro (dízimos e ofertas)?
[WIDGET:select_one]
- Planilha Excel ou manual
- Sistema financeiro
- Contador externo
- Não temos controle organizado

P12 — Vocês têm escala de voluntários organizada?
[WIDGET:select_one]
- Sim, por planilha ou WhatsApp
- Sim, por sistema
- Não temos escala organizada
- Cada ministério organiza o seu

── BLOCO 4: COMUNICAÇÃO ──

P13 — Quais canais vocês usam para se comunicar com os membros?
[WIDGET:select_many]
- WhatsApp (grupos)
- Instagram
- Facebook
- YouTube
- E-mail
- Aplicativo próprio
- Mural ou impresso
- Nenhum de forma organizada

P14 — Os membros afastados são acompanhados?
[WIDGET:select_one]
- Sim, temos processo de acompanhamento
- Tentamos mas não conseguimos manter
- Não conseguimos acompanhar
- Só percebemos quando já saíram

P15 — Com que frequência a igreja se comunica com os membros?
[WIDGET:select_one]
- Diariamente
- Semanalmente
- Só nos cultos
- Raramente fora dos cultos

── BLOCO 5: DORES E NECESSIDADES ──

P16 — Qual a MAIOR dor na gestão da sua igreja hoje?
[WIDGET:select_one]
- Falta de controle de membros e visitantes
- Dificuldade com escalas de voluntários
- Controle financeiro desorganizado
- Comunicação ineficiente com membros
- Membros se afastando sem acompanhamento
- Falta de dados e métricas
- Tudo ao mesmo tempo

P17 — O que vocês mais gostariam de automatizar?
[WIDGET:select_many]
- Cadastro de visitantes e membros
- Escalas de voluntários
- Mensagens de boas-vindas
- Acompanhamento de afastados
- Relatórios financeiros
- Comunicação pelo WhatsApp
- Agenda pastoral

P18 — Vocês já usaram algum sistema de gestão antes?
[WIDGET:select_one]
- Nunca usamos nenhum sistema
- Sim, mas não funcionou
- Sim, e estamos migrando
- Usamos planilhas apenas

── BLOCO 6: CONFIGURAÇÃO FINAL ──

P19 — Quantos usuários vão acessar o sistema inicialmente?
[WIDGET:select_one]
- Só eu (pastor)
- 2 pessoas
- 3 a 5 pessoas
- Mais de 5 pessoas

P20 — Tem mais alguma coisa que gostaria de nos contar sobre sua igreja? (opcional — pode responder "não" para pular)
[TEXTO LIVRE — sem widget. Diga ao pastor que pode pular.]

━━━ APÓS P20 ━━━

Agradeça o pastor e chame configure_tenant com todos os dados coletados. Diga algo como: "Perfeito! Tenho tudo o que preciso. Em instantes vou preparar o CRM da [nome da igreja] personalizado para vocês! 🙏"`

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

        // Calcula questão atual: número de mensagens do usuário no histórico
        const questionNumber = Math.min(
          messages.filter(m => m.role === 'user').length,
          TOTAL_QUESTIONS
        )

        // Atualiza sessão
        const updatePayload: Record<string, unknown> = {
          messages,
          block_index: questionNumber,
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
          block_index:  questionNumber,
          total_blocks: TOTAL_QUESTIONS,
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
