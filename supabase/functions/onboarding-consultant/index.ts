// ============================================================
// Edge Function: onboarding-consultant v5 — deterministic flow
// O SISTEMA controla a sequência de perguntas. IA só gera
// frase de acolhimento. Zero chance de repetir ou pular.
//
// POST /onboarding-consultant
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, session_id?: string, plan_slug?: string }
// Returns: SSE stream
//   { type: 'token', content: '...' }
//   { type: 'done', session_id, question_number, total_questions,
//             answered_count, is_complete, question_id, widget?,
//             context?, config? }
//   { type: 'error', message: '...' }
//
// v5: +P2_LOGO (upload), +P2_CORES (paleta), +context per question,
//     +logo_url/primary_color/secondary_color/enabled_modules no config
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
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
interface ColorPaletteOption {
  label:     string
  primary:   string
  secondary: string
  emoji:     string
}

interface Widget {
  type:           'select_one' | 'select_many' | 'upload' | 'color_palette'
  options?:       string[]
  palettes?:      ColorPaletteOption[]
  accept?:        string
  optional?:      boolean
  skip_label?:    string
}

interface Question {
  id:        string
  text:      string
  context?:  string   // Frase pastoral de enquadramento exibida acima da pergunta
  widget:    Widget | null
  condition?: { question: string; answer: string }
  optional?: boolean
}

// ── 8 paletas de cores ─────────────────────────────────────
const COLOR_PALETTES: ColorPaletteOption[] = [
  { label: 'Fogo e Paixão',           primary: '#E13500', secondary: '#670000', emoji: '🔥' },
  { label: 'Céu e Mar',               primary: '#2563EB', secondary: '#1E3A5F', emoji: '🌊' },
  { label: 'Vida e Esperança',         primary: '#059669', secondary: '#064E3B', emoji: '🌿' },
  { label: 'Realeza e Unção',         primary: '#7C3AED', secondary: '#4C1D95', emoji: '👑' },
  { label: 'Glória e Terra',          primary: '#D97706', secondary: '#78350F', emoji: '✨' },
  { label: 'Águas Tranquilas',        primary: '#0891B2', secondary: '#155E75', emoji: '💧' },
  { label: 'Amor e Graça',            primary: '#DB2777', secondary: '#831843', emoji: '🌸' },
  { label: 'Elegância e Sobriedade',  primary: '#374151', secondary: '#111827', emoji: '🖤' },
]

// Encode da paleta selecionada como string "primary|secondary"
function encodePalette(primary: string, secondary: string): string {
  return `${primary}|${secondary}`
}

function decodePalette(encoded: string): { primary: string; secondary: string } | null {
  const parts = encoded.split('|')
  if (parts.length === 2) return { primary: parts[0], secondary: parts[1] }
  return null
}

// ── 22 perguntas fixas (sistema, não IA) ───────────────────
const QUESTIONS: Question[] = [
  {
    id: 'P1',
    text: 'Qual o nome completo da sua igreja?',
    widget: null,
  },
  {
    id: 'P2',
    text: 'Em qual cidade e estado vocês estão?',
    widget: null,
  },
  // ── Identidade visual ──────────────────────────────────
  {
    id: 'P2_LOGO',
    text: 'Vocês têm uma logo da igreja? Se sim, pode enviar agora — vamos usá-la no CRM.',
    context: 'Seu CRM terá a cara da sua igreja. Começamos pela identidade visual.',
    widget: {
      type:        'upload',
      accept:      '.png,.jpg,.jpeg,.svg,.webp',
      optional:    true,
      skip_label:  'Pular — não tenho logo agora',
    },
    optional: true,
  },
  {
    id: 'P2_CORES',
    text: 'Escolha a paleta de cores que mais combina com a identidade da sua igreja:',
    context: 'As cores definem a personalidade visual do seu CRM.',
    widget: {
      type:    'color_palette',
      palettes: COLOR_PALETTES,
    },
    // Só aparece quando não enviou logo (logo enviada = URL pública; pulada = 'sem_logo')
    condition: { question: 'P2_LOGO', answer: 'sem_logo' },
  },
  // ── Estrutura ─────────────────────────────────────────
  {
    id: 'P3',
    text: 'Quantas sedes ou congregações a igreja tem?',
    widget: { type: 'select_one', options: ['1 sede', '2 sedes', '3 a 5 sedes', 'Mais de 5 sedes'] },
  },
  {
    id: 'P4',
    text: 'Qual a faixa de membros ativos?',
    widget: { type: 'select_one', options: ['Até 50 membros', '50 a 150', '150 a 300', '300 a 500', '500 a 1.000', 'Mais de 1.000'] },
  },
  {
    id: 'P5',
    text: 'Vocês trabalham com células ou grupos pequenos?',
    context: 'Igrejas com células retêm 3× mais membros. Nos conte sobre as suas.',
    widget: { type: 'select_one', options: ['Sim, temos células ativas', 'Não, mas queremos começar', 'Não trabalhamos com células'] },
  },
  {
    id: 'P6',
    text: 'Quantas células aproximadamente?',
    widget: { type: 'select_one', options: ['Até 5', '5 a 15', '15 a 30', 'Mais de 30'] },
    condition: { question: 'P5', answer: 'Sim, temos células ativas' },
  },
  {
    id: 'P7',
    text: 'Quais ministérios ou departamentos a igreja tem?',
    context: 'Cada ministério terá sua área dedicada no CRM com equipe, escala e membros.',
    widget: { type: 'select_many', options: ['Louvor e Adoração', 'Mídia e Comunicação', 'Infantil', 'Jovens', 'Mulheres', 'Homens', 'Recepção', 'Escola Bíblica (EBD)', 'Ação Social', 'Missionário', 'Intercessão', 'Casais', 'Diaconia'] },
  },
  {
    id: 'P8',
    text: 'Como é organizada a liderança da sua igreja?',
    widget: { type: 'select_one', options: ['Pastor único lidera tudo', 'Pastor + conselho/presbitério', 'Pastor + pastores auxiliares', 'Equipe pastoral com áreas definidas'] },
  },
  {
    id: 'P9',
    text: 'Como funciona o caminho do visitante na sua igreja?',
    context: 'Vamos criar o caminho de discipulado ideal para a sua realidade pastoral.',
    widget: { type: 'select_one', options: ['Visitante → Frequentador → Membro (informal)', 'Temos classe de integração/batismo', 'Não temos processo definido', 'Cada congregação tem seu processo'] },
  },
  {
    id: 'P10',
    text: 'Como vocês controlam a frequência dos membros hoje?',
    widget: { type: 'select_one', options: ['Planilha ou papel', 'Sistema ou aplicativo', 'Pelos líderes de célula', 'Não controlamos'] },
  },
  {
    id: 'P11',
    text: 'Como é feito o controle financeiro (dízimos e ofertas)?',
    widget: { type: 'select_one', options: ['Planilha Excel ou manual', 'Sistema financeiro', 'Contador externo', 'Não temos controle organizado'] },
  },
  {
    id: 'P12',
    text: 'Vocês têm escala de voluntários organizada?',
    widget: { type: 'select_one', options: ['Sim, por planilha ou WhatsApp', 'Sim, por sistema', 'Não temos escala organizada', 'Cada ministério organiza o seu'] },
  },
  {
    id: 'P13',
    text: 'Quais canais vocês usam para se comunicar com os membros?',
    widget: { type: 'select_many', options: ['WhatsApp (grupos)', 'Instagram', 'Facebook', 'YouTube', 'E-mail', 'Aplicativo próprio', 'Mural ou impresso', 'Nenhum de forma organizada'] },
  },
  {
    id: 'P14',
    text: 'Os membros afastados são acompanhados?',
    widget: { type: 'select_one', options: ['Sim, temos processo de acompanhamento', 'Tentamos mas não conseguimos manter', 'Não conseguimos acompanhar', 'Só percebemos quando já saíram'] },
  },
  {
    id: 'P15',
    text: 'Com que frequência a igreja se comunica com os membros?',
    widget: { type: 'select_one', options: ['Diariamente', 'Semanalmente', 'Só nos cultos', 'Raramente fora dos cultos'] },
  },
  {
    id: 'P16',
    text: 'Qual a MAIOR dor na gestão da sua igreja hoje?',
    context: 'Identificar a maior dor nos ajuda a recomendar os agentes de IA certos para você.',
    widget: { type: 'select_one', options: ['Falta de controle de membros e visitantes', 'Dificuldade com escalas', 'Controle financeiro desorganizado', 'Comunicação ineficiente', 'Membros se afastando sem acompanhamento', 'Falta de dados e métricas', 'Tudo ao mesmo tempo'] },
  },
  {
    id: 'P17',
    text: 'O que vocês mais gostariam de automatizar?',
    widget: { type: 'select_many', options: ['Cadastro de visitantes e membros', 'Escalas de voluntários', 'Mensagens de boas-vindas', 'Acompanhamento de afastados', 'Relatórios financeiros', 'Comunicação pelo WhatsApp', 'Agenda pastoral'] },
  },
  {
    id: 'P18',
    text: 'Vocês já usaram algum sistema de gestão antes?',
    widget: { type: 'select_one', options: ['Nunca usamos nenhum sistema', 'Sim, mas não funcionou', 'Sim, e estamos migrando', 'Usamos planilhas apenas'] },
  },
  {
    id: 'P19',
    text: 'Quantos usuários vão acessar o sistema inicialmente?',
    widget: { type: 'select_one', options: ['Só eu (pastor)', '2 pessoas', '3 a 5 pessoas', 'Mais de 5 pessoas'] },
  },
  {
    id: 'P20',
    text: 'Tem mais alguma coisa que gostaria de nos contar sobre sua igreja? (opcional — pode pular digitando "não")',
    widget: null,
  },
]

// Total de perguntas pode variar: P2_CORES é condicional (só sem logo)
// P2_LOGO sempre aparece: +1 → base = 21
// P2_CORES aparece só se P2_LOGO = 'sem_logo': +1 → max = 22
const MIN_QUESTIONS = 21 // sem P2_CORES
const MAX_QUESTIONS = 22 // com P2_CORES

function getTotalQuestions(answers: Record<string, string>): number {
  const logoAnswer = answers['P2_LOGO']
  if (!logoAnswer) return MAX_QUESTIONS // ainda não respondeu P2_LOGO → mostra máximo
  return logoAnswer === 'sem_logo' ? MAX_QUESTIONS : MIN_QUESTIONS
}

// ── Engine determinístico ──────────────────────────────────
function getNextQuestion(answers: Record<string, string>): Question | null {
  for (const q of QUESTIONS) {
    if (q.id in answers) continue
    if (q.condition) {
      const depAnswer = answers[q.condition.question]
      if (depAnswer !== q.condition.answer) continue
    }
    return q
  }
  return null
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

function deriveEnabledModules(answers: Record<string, string>): Record<string, boolean> {
  const p4 = answers['P4'] ?? ''
  const p5 = answers['P5'] ?? ''
  const p12 = answers['P12'] ?? ''

  const hasCells   = p5 === 'Sim, temos células ativas' || p5 === 'Não, mas queremos começar'
  const hasEscalas = p12 !== 'Não temos escala organizada'
  const hasGabinete = ['300 a 500', '500 a 1.000', 'Mais de 1.000'].includes(p4)

  return {
    pessoas:     true,
    pipeline:    true,
    ministerios: true,
    financeiro:  true,
    agenda:      true,
    celulas:     hasCells,
    voluntarios: hasEscalas,
    escalas:     hasEscalas,
    gabinete:    hasGabinete,
  }
}

function deriveColors(answers: Record<string, string>): { primary: string; secondary: string } {
  // Se recebeu URL do logo via Canvas API no frontend → cores vêm embutidas na resposta
  // Formato especial: "logo_url|||#hex1|||#hex2"
  const logoAnswer = answers['P2_LOGO'] ?? ''
  if (logoAnswer.includes('|||')) {
    const parts = logoAnswer.split('|||')
    if (parts.length === 3) {
      return { primary: parts[1], secondary: parts[2] }
    }
  }

  // Se escolheu paleta manual (P2_CORES)
  const coresAnswer = answers['P2_CORES'] ?? ''
  const palette = decodePalette(coresAnswer)
  if (palette) return palette

  // Fallback: Ekthos padrão
  return { primary: '#E13500', secondary: '#670000' }
}

function deriveLogoUrl(answers: Record<string, string>): string | null {
  const logoAnswer = answers['P2_LOGO'] ?? ''
  if (!logoAnswer || logoAnswer === 'sem_logo') return null
  // Pode ser "url|||primary|||secondary" ou só a URL
  if (logoAnswer.includes('|||')) return logoAnswer.split('|||')[0]
  // Se for uma URL direta (https://...)
  if (logoAnswer.startsWith('https://')) return logoAnswer
  return null
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

  const colors   = deriveColors(answers)
  const logoUrl  = deriveLogoUrl(answers)
  const enabledModules = deriveEnabledModules(answers)

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
    chamado:    { price_cents: 68990,  max_users: 2,  agents_count: 2 },
    missao:     { price_cents: 163990, max_users: 4,  agents_count: 4 },
    avivamento: { price_cents: 246990, max_users: 4,  agents_count: 6 },
  }
  const plan = planMeta[planSlug] ?? planMeta['chamado']

  const freeAgents     = ['agent-suporte', 'agent-onboarding', 'agent-cadastro', 'agent-conteudo']
  const includedAgents: string[] = []
  if (planSlug === 'missao' || planSlug === 'avivamento') {
    includedAgents.push('agent-whatsapp', 'agent-financeiro', 'agent-reengajamento')
  }
  if (planSlug === 'avivamento') {
    includedAgents.push('agent-metricas', 'agent-agenda', 'agent-relatorios')
  }

  const recommended: string[] = []
  if ((maiorDor.includes('escalas') || automatizar.some(a => a.includes('Escalas'))) && !includedAgents.includes('agent-escalas')) {
    recommended.push('agent-escalas')
  }
  if ((maiorDor.includes('financeiro') || automatizar.some(a => a.includes('financeiros'))) && !includedAgents.includes('agent-financeiro')) {
    recommended.push('agent-financeiro')
  }
  if ((maiorDor.includes('Comunicação') || canais.some(c => c.includes('WhatsApp'))) && !includedAgents.includes('agent-whatsapp')) {
    recommended.push('agent-whatsapp')
  }
  if ((maiorDor.includes('afastados') || automatizar.some(a => a.includes('afastados'))) && !includedAgents.includes('agent-reengajamento')) {
    recommended.push('agent-reengajamento')
  }
  if (maiorDor.includes('métricas') || maiorDor.includes('dados')) {
    if (!includedAgents.includes('agent-metricas')) recommended.push('agent-metricas')
  }

  return {
    action: 'configure_tenant_full',
    tenant: {
      name:            churchName,
      slug:            slugify(churchName),
      city,
      state,
      timezone:        'America/Sao_Paulo',
      multi_site:      multiSite,
      logo_url:        logoUrl,
      primary_color:   colors.primary,
      secondary_color: colors.secondary,
      enabled_modules: enabledModules,
      sites: multiSite
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
      format: sistemaAnterior.includes('planilhas') ? 'spreadsheet'
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

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

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

  const answers  = { ...((session.answers  as Record<string, string> | null) ?? {}) }
  const messages = [...((session.messages  as Array<{ role: string; content: string }> | null) ?? [])]
  const planSlug = (session.plan_slug as string | null) ?? plan_slug ?? 'chamado'

  // Qual pergunta o usuário está respondendo agora?
  const questionBeingAnswered = getNextQuestion(answers)
  if (questionBeingAnswered) {
    answers[questionBeingAnswered.id] = message.trim()
  }

  const nextQ          = getNextQuestion(answers)
  const isComplete     = nextQ === null
  const totalQ         = getTotalQuestions(answers)
  const questionNumber = nextQ ? QUESTIONS.indexOf(nextQ) + 1 : totalQ
  const answeredCount  = Object.keys(answers).length

  messages.push({ role: 'user', content: message.trim() })

  if (!isComplete) {
    const { data: saved, error: preSaveError } = await supabase
      .from('onboarding_sessions')
      .update({ answers, block_index: questionNumber })
      .eq('id', session_id)
      .select('id, block_index')

    if (preSaveError) {
      console.error('[consultant v5] PRE-SAVE error:', preSaveError.message)
      return jsonErr(`Erro ao salvar: ${preSaveError.message} [${preSaveError.code}]`, 500)
    }
    if (!saved || saved.length === 0) {
      console.error('[consultant v5] PRE-SAVE 0 rows — session_id:', session_id)
      return jsonErr(`Sessão não encontrada: ${session_id}`, 500)
    }
  }

  // ── SSE stream ─────────────────────────────────────────
  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantText = ''

      try {
        if (!isComplete && nextQ) {
          // ── 1. Haiku gera frase de acolhimento (stream) ──
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

          // ── 2. Injeta contexto + próxima pergunta ──
          if (nextQ.context) {
            const contextChunk = `\n\n_${nextQ.context}_`
            assistantText += contextChunk
            controller.enqueue(sseData({ type: 'token', content: contextChunk }))
          }

          const questionChunk = `\n\n${nextQ.text}`
          assistantText += questionChunk
          controller.enqueue(sseData({ type: 'token', content: questionChunk }))

          messages.push({ role: 'assistant', content: assistantText })
          await supabase.from('onboarding_sessions').update({ messages }).eq('id', session_id)

          controller.enqueue(sseData({
            type:             'done',
            session_id,
            question_number:  questionNumber,
            total_questions:  totalQ,
            answered_count:   answeredCount,
            is_complete:      false,
            question_id:      nextQ.id,
            widget:           nextQ.widget,
            context:          nextQ.context ?? null,
          }))

        } else {
          // ── 3. Todas respondidas — config determinístico ──
          const configJson = buildConfigFromAnswers(answers, planSlug)
          const churchName = (answers['P1'] ?? 'sua igreja').trim()
          const completionMsg = `Que bênção conhecer a ${churchName}! Tenho tudo que preciso para configurar o CRM de vocês. Preparando agora... 🙏`

          assistantText = completionMsg
          controller.enqueue(sseData({ type: 'token', content: completionMsg }))

          messages.push({ role: 'assistant', content: assistantText })
          const { error: completeError } = await supabase.from('onboarding_sessions').update({
            messages,
            answers,
            block_index:  totalQ,
            config_json:  configJson,
            status:       'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', session_id)

          if (completeError) {
            console.error('[consultant v5] COMPLETE UPDATE failed:', completeError.message)
            throw new Error(`Erro ao finalizar sessão: ${completeError.message}`)
          }

          controller.enqueue(sseData({
            type:            'done',
            session_id,
            question_number: totalQ,
            total_questions: totalQ,
            answered_count:  answeredCount,
            is_complete:     true,
            question_id:     null,
            widget:          null,
            config:          configJson,
          }))
        }

      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[onboarding-consultant v5] error:', msg)
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
