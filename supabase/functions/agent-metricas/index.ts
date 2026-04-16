// ============================================================
// Edge Function: agent-metricas v3
// Intérprete de Métricas Pastorais — SSE streaming conversacional
//
// POST /agent-metricas
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

const MODEL         = 'claude-haiku-4-5-20251001'
const MAX_TOKENS    = 2048
const HISTORY_LIMIT = 16
const AGENT_SLUG    = 'agent-metricas'

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

  // ── Verifica subscription_agents ───────────────────────
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

    if (sa?.active !== true) return jsonErr('Agente não ativado para esta conta', 403)
  }

  // ── Body ────────────────────────────────────────────────
  let body: { message?: string; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  // ── Carrega métricas da church ─────────────────────────
  const now          = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonth    = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const firstOfMonth2 = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { count: totalMembers },
    { count: newThisMonth },
    { count: visitors },
    { count: activeCells },
    { data: donationsThisMonth },
    { data: donationsLastMonth },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'member'),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).gte('created_at', firstOfMonth),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'visitor'),
    supabase.from('groups').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('type', 'cell').eq('is_active', true),
    supabase.from('donations').select('amount_cents').eq('church_id', churchId).gte('created_at', firstOfMonth2),
    supabase.from('donations').select('amount_cents').eq('church_id', churchId).gte('created_at', lastMonth).lt('created_at', firstOfMonth),
    supabase.from('churches').select('name, denomination').eq('id', churchId).maybeSingle(),
  ])

  const sumCents = (arr: Array<{ amount_cents: unknown }> | null) =>
    (arr ?? []).reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0)

  const totalDonBRL     = (sumCents(donationsThisMonth) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const lastMonthDonBRL = (sumCents(donationsLastMonth) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const cellCoverage    = (activeCells && totalMembers) ? Math.round((totalMembers ?? 0) / Math.max(activeCells ?? 1, 1)) : 0
  const monthLabel      = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const systemPrompt = `Você é o Intérprete de Métricas Pastorais da ${churchRow?.name ?? 'igreja'} (${churchRow?.denomination ?? 'evangélica'}).

SNAPSHOT DE ${monthLabel.toUpperCase()}:
  Membros ativos:          ${totalMembers ?? 0}
  Visitantes:              ${visitors ?? 0}
  Novos cadastros no mês:  ${newThisMonth ?? 0}
  Células ativas:          ${activeCells ?? 0} (média: ${cellCoverage} membros/célula)
  Arrecadação do mês:      ${totalDonBRL}
  Arrecadação mês anterior: ${lastMonthDonBRL}

BENCHMARKS SAUDÁVEIS:
  - 1 célula para cada 10-15 membros
  - 30% dos membros como visitantes (funil saudável)
  - Crescimento orgânico: 5-10% ao mês

MISSÃO:
- Interpretar os dados pastorais com linguagem pastoral e analítica
- Identificar pontos de atenção, oportunidades e próximos passos
- Responder perguntas específicas sobre métricas com base nos dados acima
- Comparar com benchmarks e oferecer perspectiva estratégica

Tom: conselheiro pastoral experiente, analítico mas com coração.
Língua: português brasileiro.
Formato: use markdown quando gerar relatórios (cabeçalhos, listas, negrito).`

  // ── Limpa histórico se solicitado ─────────────────────
  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', AGENT_SLUG)
  }

  // ── Histórico de conversa ──────────────────────────────
  const { data: historyRows } = await supabase
    .from('agent_conversations')
    .select('role, content')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .eq('agent_slug', AGENT_SLUG)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const history: Array<{ role: 'user' | 'assistant'; content: string }> =
    (historyRows ?? []).reverse().map(m => ({
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

  // ── Streaming SSE ──────────────────────────────────────
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
          system:     systemPrompt,
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

        const finalMsg = await stream.finalMessage()
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

        controller.enqueue(sseData({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error(`[${AGENT_SLUG}] stream error:`, msg)

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
