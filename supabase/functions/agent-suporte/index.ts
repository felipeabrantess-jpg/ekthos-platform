// ============================================================
// Edge Function: agent-suporte
// Agente de Suporte 24h — Claude Haiku (free para todas as igrejas)
//
// POST /agent-suporte
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, clear_history?: boolean }
// Returns: SSE stream com tokens da resposta
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic         from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

// ── Env ────────────────────────────────────────────────────

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1024
const HISTORY_LIMIT = 16  // últimas 8 trocas (user+assistant)

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

// ── System prompt ──────────────────────────────────────────

function buildSystemPrompt(churchName: string, modulesEnabled: Record<string, boolean>): string {
  const modules = Object.entries(modulesEnabled)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ')

  return `Você é o assistente pastoral do Ekthos CRM da igreja **${churchName}**.

Seu papel:
- Responder dúvidas sobre como usar o sistema Ekthos CRM em português
- Orientar líderes, secretários e membros da equipe no dia a dia
- Informar sobre funcionalidades disponíveis de forma clara e prática
- Encaminhar para atendimento humano quando não conseguir resolver

Módulos ativos nesta conta: ${modules || 'crm'}

Funcionalidades do Ekthos que você conhece:
- **Dashboard**: visão geral de métricas pastorais (membros, células, visitantes, dízimos)
- **Pessoas**: cadastro completo de membros, visitantes e contatos com filtros avançados
- **Pipeline**: caminho de discipulado com etapas configuráveis (visitante → membro → líder)
- **Células**: gestão de grupos, presença, relatórios de reunião e crescimento
- **Ministérios**: departamentos da igreja com escalas e membros
- **Voluntários**: gestão de voluntários com disponibilidade e histórico
- **Escalas**: geração automática de escalas por departamento
- **Financeiro**: dízimos, ofertas, contribuições por membro e relatórios
- **Agenda**: eventos, compromissos pastorais e lembretes
- **Gabinete**: espaço confidencial do pastor (acesso restrito)
- **Agentes IA**: marketplace de agentes disponíveis para ativar
- **Configurações**: perfil, plano, usuários extras e integrações

Como ajudar:
- Responda de forma direta e prática — "Para registrar presença: vá em Células → [nome da célula] → Registrar Presença"
- Se a dúvida for sobre algo que outro agente faz melhor, mencione qual agente pode ajudar
- NUNCA invente informações sobre a igreja específica que não foram fornecidas
- Se não souber, diga claramente e sugira contactar o suporte Ekthos pelo email suporte@ekthosai.net

Tom: fraterno, pastoral, direto. Evite jargões técnicos. Fale como um colega que conhece bem o sistema.`
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

  const churchId =
    (user.app_metadata?.church_id as string | undefined) ??
    (user.user_metadata?.church_id as string | undefined) ?? null

  if (!churchId) return jsonErr('church_id não encontrado no token', 400)

  // ── Body ────────────────────────────────────────────────
  let body: { message?: string; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  // ── Contexto da church ──────────────────────────────────
  const { data: settingsRow } = await supabase
    .from('church_settings')
    .select('modules_enabled')
    .eq('church_id', churchId)
    .maybeSingle()

  const { data: churchRow } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()

  const churchName     = churchRow?.name ?? 'sua igreja'
  const modulesEnabled = (settingsRow?.modules_enabled ?? {}) as Record<string, boolean>

  // ── Limpa histórico se solicitado ───────────────────────
  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', 'agent-suporte')
  }

  // ── Histórico de conversa ───────────────────────────────
  const { data: historyRows } = await supabase
    .from('agent_conversations')
    .select('role, content')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('agent_slug', 'agent-suporte')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const history: Array<{ role: 'user' | 'assistant'; content: string }> =
    (historyRows ?? []).reverse().map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Salva mensagem do usuário no histórico
  await supabase.from('agent_conversations').insert({
    church_id:  churchId,
    user_id:    user.id,
    agent_slug: 'agent-suporte',
    role:       'user',
    content:    message,
  })

  // ── Streaming SSE com Anthropic ─────────────────────────
  const startedAt = Date.now()

  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantReply  = ''
      let inputTokens     = 0
      let outputTokens    = 0

      try {
        const stream = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     buildSystemPrompt(churchName, modulesEnabled),
          messages:   [...history, { role: 'user', content: message }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text
            assistantReply += chunk
            controller.enqueue(sseData({ type: 'token', content: chunk }))
          }
        }

        const finalMsg  = await stream.finalMessage()
        inputTokens  = finalMsg.usage.input_tokens
        outputTokens = finalMsg.usage.output_tokens

        // Salva resposta no histórico
        await supabase.from('agent_conversations').insert({
          church_id:   churchId,
          user_id:     user.id,
          agent_slug:  'agent-suporte',
          role:        'assistant',
          content:     assistantReply,
          tokens_used: outputTokens,
        })

        // Loga execução
        await supabase.from('agent_executions').insert({
          church_id:     churchId,
          agent_slug:    'agent-suporte',
          user_id:       user.id,
          model:         MODEL,
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
          duration_ms:   Date.now() - startedAt,
          success:       true,
        })

        controller.enqueue(sseData({
          type:          'done',
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[agent-suporte] stream error:', msg)

        await supabase.from('agent_executions').insert({
          church_id:     churchId,
          agent_slug:    'agent-suporte',
          user_id:       user.id,
          model:         MODEL,
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
          duration_ms:   Date.now() - startedAt,
          success:       false,
          error:         msg,
        })

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
