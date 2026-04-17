// ============================================================
// Edge Function: agent-missoes
// Agente de Missões e Projetos Sociais — Claude Haiku
// Organiza, documenta e comunica o impacto das missões e
// projetos sociais da igreja.
//
// POST /agent-missoes
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
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MODEL         = 'claude-haiku-4-5-20251001'
const MAX_TOKENS    = 1024
const HISTORY_LIMIT = 12
const AGENT_SLUG    = 'agent-missoes'

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

// ── Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // ── Auth ────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
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

  // ── Dados de missões e projetos sociais ─────────────────
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: missionGroups },
    { data: missionDonations },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('groups').select('id, name, type, member_count, is_active')
      .eq('church_id', churchId)
      .in('type', ['missoes', 'missões', 'social', 'acao_social', 'projeto_social', 'missions', 'missao'])
      .order('is_active', { ascending: false }).limit(15),
    supabase.from('donations').select('amount_cents, type, created_at')
      .eq('church_id', churchId)
      .in('type', ['missoes', 'campanha', 'projeto', 'social'])
      .gte('created_at', since90).limit(30),
    supabase.from('churches').select('name, denomination').eq('id', churchId).maybeSingle(),
  ])

  const activeProjects = (missionGroups ?? []).filter(g => g.is_active)
  const projectsContext = activeProjects.length > 0
    ? activeProjects.map(p => `  • ${p.name as string} (${(p.member_count as number) ?? 0} voluntários)`).join('\n')
    : '  Nenhum projeto cadastrado ainda.'

  const donationsTotal = (missionDonations ?? []).reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100
  const donationsBRL   = donationsTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ── System prompt ───────────────────────────────────────
  const systemPrompt = `Você é o Assistente de Missões e Projetos Sociais da ${churchRow?.name ?? 'igreja'}.

PROJETOS ATIVOS (${activeProjects.length}):
${projectsContext}

ARRECADAÇÃO PARA MISSÕES (últimos 90 dias): ${donationsBRL}

MISSÃO:
Organizar, documentar e comunicar o impacto das missões e projetos sociais.

GESTÃO:
• Status e progresso por projeto
• Controle de voluntários e recursos
• Metas de impacto (famílias atendidas, kits, atendimentos)

PRESTAÇÃO DE CONTAS (relatórios por público):
1. Conselho — trimestral: recursos + impacto + próximas etapas
2. Doadores — mensal: histórias + números concretos
3. Parceiros/fundações — semestral: formalizado com indicadores
4. Assembleia — anual: visão geral + planos

ANÁLISE DE IMPACTO:
• Custo por família atendida
• Projetos com maior alcance por real investido
• Voluntários-hora (horas × voluntários)

Tom: apaixonado pela missão, rigoroso nos dados. O dinheiro das missões é sagrado.
Língua: português brasileiro.`

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
      let assistantReply        = ''
      let inputTokens           = 0
      let outputTokens          = 0
      let cacheReadTokens       = 0
      let cacheCreationTokens   = 0

      try {
        const stream = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
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

        const finalMsg            = await stream.finalMessage()
        inputTokens               = finalMsg.usage.input_tokens
        outputTokens              = finalMsg.usage.output_tokens
        const cacheUsage          = finalMsg.usage as Record<string, number | undefined>
        cacheReadTokens           = cacheUsage.cache_read_input_tokens    ?? 0
        cacheCreationTokens       = cacheUsage.cache_creation_input_tokens ?? 0

        await supabase.from('agent_conversations').insert({
          church_id:   churchId,
          user_id:     user.id,
          agent_slug:  AGENT_SLUG,
          role:        'assistant',
          content:     assistantReply,
          tokens_used: outputTokens,
        })

        await supabase.from('agent_executions').insert({
          church_id:              churchId,
          agent_slug:             AGENT_SLUG,
          user_id:                user.id,
          model:                  MODEL,
          input_tokens:           inputTokens,
          output_tokens:          outputTokens,
          cache_read_tokens:      cacheReadTokens,
          cache_creation_tokens:  cacheCreationTokens,
          duration_ms:            Date.now() - startedAt,
          success:                true,
        })

        controller.enqueue(sseData({
          type:          'done',
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[agent-missoes] stream error:', msg)

        await supabase.from('agent_executions').insert({
          church_id:              churchId,
          agent_slug:             AGENT_SLUG,
          user_id:                user.id,
          model:                  MODEL,
          input_tokens:           inputTokens,
          output_tokens:          outputTokens,
          cache_read_tokens:      cacheReadTokens,
          cache_creation_tokens:  cacheCreationTokens,
          duration_ms:            Date.now() - startedAt,
          success:                false,
          error:                  msg,
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
