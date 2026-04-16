// ============================================================
// Edge Function: agent-onboarding
// Agente de Onboarding de Líderes — Claude Haiku
// Guia novos usuários no uso do CRM baseado no role deles.
//
// POST /agent-onboarding
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, clear_history?: boolean }
// Returns: SSE stream
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic         from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MODEL         = 'claude-haiku-4-5-20251001'
const MAX_TOKENS    = 1024
const HISTORY_LIMIT = 20
const AGENT_SLUG    = 'agent-onboarding'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function sseData(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── System prompt por role ──────────────────────────────────

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin:      'pastor/admin com acesso total ao sistema',
  pastor:     'pastor com acesso total ao sistema',
  lider:      'líder de célula que gerencia um grupo específico',
  secretario: 'secretário(a) que gerencia cadastros e presença',
  tesoureiro: 'tesoureiro(a) que gerencia finanças da igreja',
  supervisor: 'supervisor de células que acompanha vários grupos',
}

const ROLE_FOCUS: Record<string, string> = {
  admin: `Para você como pastor/admin, foque em:
- Dashboard: como ler as métricas pastorais
- Pipeline: como acompanhar o caminho de discipulado dos membros
- Pessoas: como usar filtros avançados para encontrar membros
- Relatórios: como gerar relatórios para o conselho
- Configurações: como adicionar usuários e configurar módulos
- Agentes IA: como ativar agentes para automatizar tarefas`,

  pastor: `Para você como pastor/admin, foque em:
- Dashboard: como ler as métricas pastorais
- Pipeline: como acompanhar o caminho de discipulado dos membros
- Pessoas: como usar filtros avançados para encontrar membros
- Relatórios: como gerar relatórios para o conselho
- Configurações: como adicionar usuários e configurar módulos
- Agentes IA: como ativar agentes para automatizar tarefas`,

  lider: `Para você como líder de célula, foque em:
- Células: como registrar presença da reunião de célula
- Células: como ver a lista de membros da sua célula
- Pessoas: como ver o perfil completo de um membro
- Pipeline: como mover um visitante de etapa
- Agenda: como ver os eventos da semana`,

  secretario: `Para você como secretário(a), foque em:
- Pessoas: como cadastrar um novo visitante
- Pessoas: como editar dados de um membro
- Presença: como registrar frequência nos cultos
- Eventos: como criar e gerenciar eventos
- Exportação: como exportar listas`,

  tesoureiro: `Para você como tesoureiro(a), foque em:
- Financeiro: como registrar dízimos e ofertas
- Financeiro: como gerar o relatório mensal
- Financeiro: como ver quem são os dizimistas regulares
- Contribuições: como registrar ofertas especiais e campanhas`,

  supervisor: `Para você como supervisor de células, foque em:
- Células: como ver todas as células que supervisiona
- Relatórios: como ver os relatórios de reunião das células
- Pipeline: como acompanhar visitantes das células
- Dashboard: como ler métricas de crescimento das células`,
}

function buildSystemPrompt(
  userName: string,
  role: string,
  churchName: string,
): string {
  const roleDesc  = ROLE_DESCRIPTIONS[role] ?? 'membro da equipe'
  const roleFocus = ROLE_FOCUS[role] ?? ROLE_FOCUS.admin

  return `Você é o guia de onboarding do Ekthos CRM para **${userName}**, que é ${roleDesc} na **${churchName}**.

Seu papel é guiar ${userName} no uso do sistema passo a passo, de forma prática e didática.

${roleFocus}

Como guiar:
- Seja específico: "Para registrar presença: vá em **Células** → clique na sua célula → botão **Registrar Presença**"
- Use passos numerados para ações que têm múltiplos cliques
- Comece com o mais importante para o role deles
- Pergunte se ficou claro antes de avançar
- Celebre quando o usuário completar uma tarefa

Primeiro contato: quando o usuário mandar a primeira mensagem, apresente-se e pergunte com o que ele precisa de ajuda OU ofereça um tour guiado pelo que é mais importante para o role dele.

Tom: amigável, paciente, encorajador. Como um colega experiente ajudando alguém novo.
Língua: sempre português brasileiro.`
}

// ── Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // ── Auth ────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  const churchId =
    (user.app_metadata?.church_id  as string | undefined) ??
    (user.user_metadata?.church_id as string | undefined) ?? null

  if (!churchId) return jsonErr('church_id não encontrado no token', 400)

  // ── Verifica se agente está ativado ─────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('church_id', churchId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sub) {
    const { data: sa } = await supabase
      .from('subscription_agents')
      .select('active')
      .eq('subscription_id', sub.id)
      .eq('agent_slug', AGENT_SLUG)
      .maybeSingle()

    if (!sa?.active) {
      return jsonErr('Agente não ativado para esta conta', 403)
    }
  }

  // ── Body ────────────────────────────────────────────────
  let body: { message?: string; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  // ── Contexto ────────────────────────────────────────────
  const [churchRes, roleRes] = await Promise.all([
    supabase
      .from('churches')
      .select('name')
      .eq('id', churchId)
      .maybeSingle(),

    supabase
      .from('user_roles')
      .select('role')
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const churchName = churchRes.data?.name ?? 'sua igreja'
  const userRole   = (roleRes.data?.role as string | undefined) ?? 'admin'
  const userName   =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name     as string | undefined) ??
    user.email?.split('@')[0] ?? 'usuário'

  // ── Limpa histórico se solicitado ───────────────────────
  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', AGENT_SLUG)
  }

  // ── Histórico ───────────────────────────────────────────
  const { data: histRows } = await supabase
    .from('agent_conversations')
    .select('role, content')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('agent_slug', AGENT_SLUG)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const history: Array<{ role: 'user' | 'assistant'; content: string }> =
    (histRows ?? []).reverse().map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Salva mensagem do usuário
  await supabase.from('agent_conversations').insert({
    church_id:  churchId,
    user_id:    user.id,
    agent_slug: AGENT_SLUG,
    role:       'user',
    content:    message,
  })

  // ── Streaming SSE ───────────────────────────────────────
  const startedAt = Date.now()

  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantReply = ''
      let inputTokens    = 0
      let outputTokens   = 0

      try {
        const stream = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     buildSystemPrompt(userName, userRole, churchName),
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

        await supabase.from('agent_conversations').insert({
          church_id:   churchId,
          user_id:     user.id,
          agent_slug:  AGENT_SLUG,
          role:        'assistant',
          content:     assistantReply,
          tokens_used: outputTokens,
        })

        await supabase.from('agent_executions').insert({
          church_id:     churchId,
          agent_slug:    AGENT_SLUG,
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
        console.error('[agent-onboarding] stream error:', msg)

        await supabase.from('agent_executions').insert({
          church_id:     churchId,
          agent_slug:    AGENT_SLUG,
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
