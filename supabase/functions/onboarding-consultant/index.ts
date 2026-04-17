// ============================================================
// Edge Function: onboarding-consultant v4 — deterministic flow
// O SISTEMA controla a sequência de perguntas. IA só gera
// frase de acolhimento. Zero chance de repetir ou pular.
//
// POST /onboarding-consultant
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, session_id?: string, plan_slug?: string }
// Returns: SSE stream
//   { type: 'token', content: '...' }
//   { type: 'done', session_id, question_number, total_questions,
//             answered_count, is_complete, question_id, widget?, config? }
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

const MODEL = 'claude-haiku-4-5-20251001'

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

// ── Types ──────────────────────────────────────────────────
interface Widget {
  type:    'select_one' | 'select_many'
  options: string[]
}
interface Question {
  id:         string
  text:       string
  widget:     Widget | null
  condition?: { question: string; answer: string }
}

// ── 20 perguntas fixas (sistema, não IA) ───────────────────
const QUESTIONS: Question[] = [
  {
    id: 'P1', text: 'Qual o nome completo da sua igreja?',
    widget: null,
  },
  {
    id: 'P2', text: 'Em qual cidade e estado vocês estão?',
    widget: null,
  },
  {
    id: 'P3', text: 'Quantas sedes ou congregações a igreja tem?',
    widget: { type: 'select_one', options: ['1 sede', '2 sedes', '3 a 5 sedes', 'Mais de 5 sedes'] },
  },
  {
    id: 'P4', text: 'Qual a faixa de membros ativos?',
    widget: { type: 'select_one', options: ['Até 50 membros', '50 a 150', '150 a 300', '300 a 500', '500 a 1.000', 'Mais de 1.000'] },
  },
  {
    id: 'P5', text: 'Vocês trabalham com células ou grupos pequenos?',
    widget: { type: 'select_one', options: ['Sim, temos células ativas', 'Não, mas queremos começar', 'Não trabalhamos com células'] },
  },
  {
    id: 'P6', text: 'Quantas células aproximadamente?',
    widget: { type: 'select_one', options: ['Até 5', '5 a 15', '15 a 30', 'Mais de 30'] },
    condition: { question: 'P5', answer: 'Sim, temos células ativas' },
  },
  {
    id: 'P7', text: 'Quais ministérios ou departamentos a igreja tem?',
    widget: { type: 'select_many', options: ['Louvor e Adoração', 'Mídia e Comunicação', 'Infantil', 'Jovens', 'Mulheres', 'Homens', 'Recepção', 'Escola Bíblica (EBD)', 'Ação Social', 'Missionário', 'Intercessão', 'Casais', 'Diaconia'] },
  },
  {
    id: 'P8', text: 'Como é organizada a liderança da sua igreja?',
    widget: { type: 'select_one', options: ['Pastor único lidera tudo', 'Pastor + conselho/presbitério', 'Pastor + pastores auxiliares', 'Equipe pastoral com áreas definidas'] },
  },
  {
    id: 'P9', text: 'Como funciona o caminho do visitante na sua igreja?',
    widget: { type: 'select_one', options: ['Visitante → Frequentador → Membro (informal)', 'Temos classe de integração/batismo', 'Não temos processo definido', 'Cada congregação tem seu processo'] },
  },
  {
    id: 'P10', text: 'Como vocês controlam a frequência dos membros hoje?',
    widget: { type: 'select_one', options: ['Planilha ou papel', 'Sistema ou aplicativo', 'Pelos líderes de célula', 'Não controlamos'] },
  },
  {
    id: 'P11', text: 'Como é feito o controle financeiro (dízimos e ofertas)?',
    widget: { type: 'select_one', options: ['Planilha Excel ou manual', 'Sistema financeiro', 'Contador externo', 'Não temos controle organizado'] },
  },
  {
    id: 'P12', text: 'Vocês têm escala de voluntários organizada?',
    widget: { type: 'select_one', options: ['Sim, por planilha ou WhatsApp', 'Sim, por sistema', 'Não temos escala organizada', 'Cada ministério organiza o seu'] },
  },
  {
    id: 'P13', text: 'Quais canais vocês usam para se comunicar com os membros?',
    widget: { type: 'select_many', options: ['WhatsApp (grupos)', 'Instagram', 'Facebook', 'YouTube', 'E-mail', 'Aplicativo próprio', 'Mural ou impresso', 'Nenhum de forma organizada'] },
  },
  {
    id: 'P14', text: 'Os membros afastados são acompanhados?',
    widget: { type: 'select_one', options: ['Sim, temos processo de acompanhamento', 'Tentamos mas não conseguimos manter', 'Não conseguimos acompanhar', 'Só percebemos quando já saíram'] },
  },
  {
    id: 'P15', text: 'Com que frequência a igreja se comunica com os membros?',
    widget: { type: 'select_one', options: ['Diariamente', 'Semanalmente', 'Só nos cultos', 'Raramente fora dos cultos'] },
  },
  {
    id: 'P16', text: 'Qual a MAIOR dor na gestão da sua igreja hoje?',
    widget: { type: 'select_one', options: ['Falta de controle de membros e visitantes', 'Dificuldade com escalas', 'Controle financeiro desorganizado', 'Comunicação ineficiente', 'Membros se afastando sem acompanhamento', 'Falta de dados e métricas', 'Tudo ao mesmo tempo'] },
  },
  {
    id: 'P17', text: 'O que vocês mais gostariam de automatizar?',
    widget: { type: 'select_many', options: ['Cadastro de visitantes e membros', 'Escalas de voluntários', 'Mensagens de boas-vindas', 'Acompanhamento de afastados', 'Relatórios financeiros', 'Comunicação pelo WhatsApp', 'Agenda pastoral'] },
  },
  {
    id: 'P18', text: 'Vocês já usaram algum sistema de gestão antes?',
    widget: { type: 'select_one', options: ['Nunca usamos nenhum sistema', 'Sim, mas não funcionou', 'Sim, e estamos migrando', 'Usamos planilhas apenas'] },
  },
  {
    id: 'P19', text: 'Quantos usuários vão acessar o sistema inicialmente?',
    widget: { type: 'select_one', options: ['Só eu (pastor)', '2 pessoas', '3 a 5 pessoas', 'Mais de 5 pessoas'] },
  },
  {
    id: 'P20', text: 'Tem mais alguma coisa que gostaria de nos contar sobre sua igreja? (opcional — pode pular digitando "não")',
    widget: null,
  },
]

const TOTAL_QUESTIONS = QUESTIONS.length // 20

// ── Engine determinístico ──────────────────────────────────
function getNextQuestion(answers: Record<string, string>): Question | null {
  for (const q of QUESTIONS) {
    if (q.id in answers) continue // já respondida
    if (q.condition) {
      const depAnswer = answers[q.condition.question]
      if (depAnswer !== q.condition.answer) continue // condição não atendida — pula
    }
    return q
  }
  return null // todas respondidas
}

// ── Config builder (determinístico, sem IA) ────────────────
function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function parseLocation(loc: string): [string, string] {
  const parts = loc.split(/[,/]/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) return [parts[0], parts[1]]
  return [parts[0] ?? loc, '']
}

function parseMultiAnswer(answer: string): string[] {
  return answer.split(',').map(s => s.trim()).filter(Boolean)
}

function parseCellCount(answer: string): number {
  if (answer.includes('Até 5'))      return 3
  if (answer.includes('5 a 15'))     return 10
  if (answer.includes('15 a 30'))    return 22
  if (answer.includes('Mais de 30')) return 40
  return 5
}

function buildConfigFromAnswers(answers: Record<string, string>, planSlug: string): unknown {
  const churchName      = (answers['P1'] ?? 'Minha Igreja').trim()
  const [city, state]   = parseLocation(answers['P2'] ?? '')
  const sedeAnswer      = answers['P3'] ?? '1 sede'
  const multiSite       = !sedeAnswer.startsWith('1')
  const hasCells        = answers['P5'] === 'Sim, temos células ativas'
  const wantCells       = answers['P5'] === 'Não, mas queremos começar'
  const totalCells      = hasCells ? parseCellCount(answers['P6'] ?? '') : 0
  const ministerios     = parseMultiAnswer(answers['P7'] ?? '')
  const canais          = parseMultiAnswer(answers['P13'] ?? '')
  const automatizar     = parseMultiAnswer(answers['P17'] ?? '')
  const maiorDor        = answers['P16'] ?? ''
  const visitanteFlow   = answers['P9'] ?? ''
  const sistemaAnterior = answers['P18'] ?? ''

  const pipelineStages = visitanteFlow.includes('classe')
    ? [
        { name: 'Novo Visitante',    sla_hours: 24,   type: 'entrada',     description: 'Primeiro contato com a igreja' },
        { name: 'Frequentador',      sla_hours: 168,  type: 'engajamento', description: 'Visitante que retornou' },
        { name: 'Em Integração',     sla_hours: 336,  type: 'discipulado', description: 'Participando da classe de integração' },
        { name: 'Membro',            sla_hours: null, type: 'conversao',   description: 'Membro batizado e integrado' },
        { name: 'Líder em Formação', sla_hours: null, type: 'maturidade',  description: 'Preparando para liderar' },
      ]
    : [
        { name: 'Visitante',    sla_hours: 48,   type: 'entrada',     description: 'Primeiro contato' },
        { name: 'Frequentador', sla_hours: 168,  type: 'engajamento', description: 'Visita regularmente' },
        { name: 'Discípulo',    sla_hours: 336,  type: 'discipulado', description: 'Em caminho de discipulado' },
        { name: 'Membro',       sla_hours: null, type: 'conversao',   description: 'Membro ativo' },
      ]

  const planMeta: Record<string, { price_cents: number; max_users: number; agents_count: number }> = {
    chamado:    { price_cents: 68990,  max_users: 3,  agents_count: 1 },
    missao:     { price_cents: 163990, max_users: 10, agents_count: 3 },
    avivamento: { price_cents: 246990, max_users: 25, agents_count: 7 },
  }
  const plan = planMeta[planSlug] ?? planMeta['chamado']

  const freeAgents     = ['agent-suporte']
  const includedAgents: string[] = []
  if (planSlug === 'missao' || planSlug === 'avivamento') {
    includedAgents.push('agent-celulas', 'agent-financeiro', 'agent-comunicacao')
  }
  if (planSlug === 'avivamento') {
    includedAgents.push('agent-escalas', 'agent-relatorios', 'agent-pipeline', 'agent-retencao')
  }

  const recommended: string[] = []
  if ((maiorDor.includes('escalas') || automatizar.some(a => a.includes('Escalas'))) && !includedAgents.includes('agent-escalas')) {
    recommended.push('agent-escalas')
  }
  if ((maiorDor.includes('financeiro') || automatizar.some(a => a.includes('financeiros'))) && !includedAgents.includes('agent-financeiro')) {
    recommended.push('agent-financeiro')
  }
  if ((maiorDor.includes('comunicação') || canais.some(c => c.includes('WhatsApp'))) && !includedAgents.includes('agent-comunicacao')) {
    recommended.push('agent-comunicacao')
  }
  if ((maiorDor.includes('afastados') || automatizar.some(a => a.includes('afastados'))) && !includedAgents.includes('agent-retencao')) {
    recommended.push('agent-retencao')
  }

  return {
    action: 'configure_tenant_full',
    tenant: {
      name:       churchName,
      slug:       slugify(churchName),
      city,
      state,
      timezone:   'America/Sao_Paulo',
      multi_site: multiSite,
      sites:      multiSite
        ? [{ name: 'Sede Principal', city, is_main: true }]
        : [{ name: churchName, city, is_main: true }],
    },
    subscription: {
      plan_slug:             planSlug,
      price_cents:           plan.price_cents,
      max_users:             plan.max_users,
      included_agents_count: plan.agents_count,
    },
    departments:  ministerios.map(m => ({ name: m })),
    cell_network: (hasCells || wantCells) ? {
      total_cells:          hasCells ? totalCells : 0,
      hierarchy:            ['Supervisor', 'Líder', 'Célula'],
      distribution_by_site: {},
    } : null,
    pipeline: {
      stages:       pipelineStages,
      loss_reasons: ['Mudou de cidade', 'Desinteresse', 'Conflito com a comunidade', 'Motivo desconhecido'],
    },
    channels: {
      whatsapp:  canais.some(c => c.includes('WhatsApp')) ? 'active' : null,
      instagram: canais.includes('Instagram') ? 'active' : null,
      email:     canais.includes('E-mail')    ? 'active' : null,
    },
    agents: {
      free:             freeAgents,
      included_in_plan: includedAgents,
      purchased:        [],
    },
    recommended_agents: [...new Set(recommended)],
    data_migration: {
      has_existing_data: !sistemaAnterior.includes('Nunca'),
      format:            sistemaAnterior.includes('planilhas') ? 'spreadsheet'
                       : sistemaAnterior.includes('migrando')  ? 'system'
                       : 'unknown',
    },
    raw_answers: answers,
  }
}

// ── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // ── Auth ───────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  // ── Body ───────────────────────────────────────────────
  let body: { message: string; session_id?: string; plan_slug?: string }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const { message, plan_slug } = body
  let { session_id } = body

  if (!message?.trim()) return jsonErr('message é obrigatório', 400)

  // ── Session: find or create ────────────────────────────
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
        answers:     {},
      })
      .select()
      .single()
    if (error) return jsonErr(`Erro ao criar sessão: ${error.message}`, 500)
    session    = data
    session_id = (data as { id: string }).id
  }

  // ── State from session ─────────────────────────────────
  const answers  = { ...((session.answers  as Record<string, string> | null) ?? {}) }
  const messages = [...((session.messages  as Array<{ role: string; content: string }> | null) ?? [])]
  const planSlug = (session.plan_slug as string | null) ?? plan_slug ?? 'chamado'

  // Qual pergunta o usuário está respondendo agora?
  const questionBeingAnswered = getNextQuestion(answers)
  if (questionBeingAnswered) {
    answers[questionBeingAnswered.id] = message.trim()
  }

  // Qual é a próxima pergunta?
  const nextQ          = getNextQuestion(answers)
  const isComplete     = nextQ === null
  const questionNumber = nextQ ? QUESTIONS.indexOf(nextQ) + 1 : TOTAL_QUESTIONS
  const answeredCount  = Object.keys(answers).length

  // Adiciona mensagem do usuário ao histórico
  messages.push({ role: 'user', content: message.trim() })

  // ── Salva answers + block_index ANTES do stream ────────
  // (fora do ReadableStream — erro aqui retorna 500 JSON, capturado pelo frontend)
  if (!isComplete) {
    console.log(`[consultant] pre-save: session=${session_id} answered=${questionBeingAnswered?.id} next=${nextQ?.id} answers_keys=${Object.keys(answers).join(',')}`)
    const { data: saved, error: preSaveError } = await supabase
      .from('onboarding_sessions')
      .update({ answers, block_index: questionNumber })
      .eq('id', session_id)
      .select('id, block_index')

    if (preSaveError) {
      console.error('[consultant] PRE-SAVE error:', preSaveError.message, preSaveError.code)
      return jsonErr(`Erro ao salvar: ${preSaveError.message} [${preSaveError.code}]`, 500)
    }
    if (!saved || saved.length === 0) {
      console.error('[consultant] PRE-SAVE 0 rows — session_id not found:', session_id, 'user_id:', user.id)
      return jsonErr(`Sessão não encontrada para salvar: ${session_id}`, 500)
    }
    console.log(`[consultant] pre-save OK: rows=${saved.length} block_index=${saved[0]?.block_index}`)
  }

  // ── SSE stream ─────────────────────────────────────────
  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantText = ''

      try {
        if (!isComplete && nextQ) {
          // ── 1. Haiku gera UMA frase de acolhimento (stream) ──
          const stream = anthropic.messages.stream({
            model:      MODEL,
            max_tokens: 60,
            system:     'Você é um consultor pastoral acolhedor da Ekthos. Gere EXATAMENTE UMA frase curta em português para acolher a resposta recebida. Máximo 12 palavras. Estilo caloroso e cristão. Apenas a frase — sem aspas, sem explicações.',
            messages:   [{ role: 'user', content: `Resposta do pastor: "${message.trim()}"` }],
          })

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const chunk = event.delta.text
              assistantText += chunk
              controller.enqueue(sseData({ type: 'token', content: chunk }))
            }
          }

          // ── 2. Injeta próxima pergunta hardcoded (sem IA) ──
          const questionChunk = `\n\n${nextQ.text}`
          assistantText += questionChunk
          controller.enqueue(sseData({ type: 'token', content: questionChunk }))

          // Atualiza messages (não-crítico — resposta já foi salva antes do stream)
          messages.push({ role: 'assistant', content: assistantText })
          await supabase.from('onboarding_sessions').update({ messages }).eq('id', session_id)

          controller.enqueue(sseData({
            type:            'done',
            session_id,
            question_number: questionNumber,
            total_questions: TOTAL_QUESTIONS,
            answered_count:  answeredCount,
            is_complete:     false,
            question_id:     nextQ.id,
            widget:          nextQ.widget,
          }))

        } else {
          // ── 3. Todas respondidas — config determinístico ──
          const configJson = buildConfigFromAnswers(answers, planSlug)
          const churchName = (answers['P1'] ?? 'sua igreja').trim()
          const completionMsg = `Que bênção conhecer a ${churchName}! Tenho tudo que preciso para configurar o CRM de vocês. Preparando agora... 🙏`

          assistantText = completionMsg
          controller.enqueue(sseData({ type: 'token', content: completionMsg }))

          messages.push({ role: 'assistant', content: assistantText })
          console.log(`[consultant] completing: answeredCount=${answeredCount} session=${session_id}`)
          const { error: completeError } = await supabase.from('onboarding_sessions').update({
            messages,
            answers,
            block_index:  TOTAL_QUESTIONS,
            config_json:  configJson,
            status:       'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', session_id)

          if (completeError) {
            console.error('[consultant] COMPLETE UPDATE failed:', completeError.message, completeError.code)
            throw new Error(`Erro ao finalizar sessão: ${completeError.message}`)
          }

          controller.enqueue(sseData({
            type:            'done',
            session_id,
            question_number: TOTAL_QUESTIONS,
            total_questions: TOTAL_QUESTIONS,
            answered_count:  answeredCount,
            is_complete:     true,
            question_id:     null,
            widget:          null,
            config:          configJson,
          }))
        }

      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[onboarding-consultant] error:', msg)
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
