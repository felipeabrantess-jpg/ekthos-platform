// ============================================================
// Edge Function: agent-financeiro
// Agente Financeiro Pastoral — Claude Haiku
// Análise financeira em linguagem pastoral.
//
// POST /agent-financeiro
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
const HISTORY_LIMIT = 10
const AGENT_SLUG    = 'agent-financeiro'

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

  // ── Dados financeiros ────────────────────────────────────
  const now              = new Date()
  const firstOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

  const [
    { data: donationsThis },
    { data: donationsLast },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('donations').select('amount_cents, type, person_id').eq('church_id', churchId).gte('created_at', firstOfMonth),
    supabase.from('donations').select('amount_cents, type').eq('church_id', churchId).gte('created_at', firstOfLastMonth).lt('created_at', firstOfMonth),
    supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
  ])

  const sumThis      = (donationsThis  ?? []).reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100
  const sumLast      = (donationsLast  ?? []).reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100
  const titheThis    = (donationsThis  ?? []).filter(d => d.type === 'dizimo').reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100
  const ofertaThis   = (donationsThis  ?? []).filter(d => d.type === 'oferta').reduce((a, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100
  const uniqueGivers = new Set((donationsThis ?? []).map(d => d.person_id).filter(Boolean)).size
  const variacaoNum  = sumLast > 0 ? ((sumThis - sumLast) / sumLast * 100) : 0
  const variacao     = variacaoNum.toFixed(1)
  const arrow        = variacaoNum >= 0 ? '▲' : '▼'
  const fmt          = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ── System prompt ─────────────────────────────────────────
  const systemPrompt = `Você é o Assistente Financeiro Pastoral da ${churchRow?.name ?? 'igreja'}.

FINANÇAS DO MÊS ATUAL:
  Total arrecadado:   ${fmt(sumThis)}
  → Dízimos:         ${fmt(titheThis)}
  → Ofertas:         ${fmt(ofertaThis)}
  Contribuintes únicos: ${uniqueGivers}
  Mês anterior:      ${fmt(sumLast)}
  Variação:          ${variacao}% ${arrow}

MISSÃO:
Ajudar o pastor e tesoureiro a entender as finanças em linguagem pastoral.

COMO RESPONDER:
1. Interprete tendências com sensibilidade (queda pode ter explicação pastoral)
2. Calcule indicadores: ticket médio por contribuinte, % dízimos vs ofertas
3. PRIVACIDADE: nunca identifique doadores pelo nome — oriente a usar o módulo Financeiro
4. Compare com meses anteriores quando tiver dados disponíveis
5. Contextualize: arrecadação serve à missão, não é fim em si mesma

RESPOSTAS:
- No máximo 4 parágrafos diretos
- Tom: tesoureiro sábio e pastoral
- Use formatação BRL para todos os valores

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
          system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
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

        const usage = finalMsg.usage as Record<string, number | undefined>
        cacheReadTokens     = usage.cache_read_input_tokens     ?? 0
        cacheCreationTokens = usage.cache_creation_input_tokens ?? 0

        await supabase.from('agent_conversations').insert({
          church_id:   churchId,
          user_id:     user.id,
          agent_slug:  AGENT_SLUG,
          role:        'assistant',
          content:     assistantReply,
          tokens_used: outputTokens,
        })

        await supabase.from('agent_executions').insert({
          church_id:             churchId,
          agent_slug:            AGENT_SLUG,
          user_id:               user.id,
          model:                 MODEL,
          input_tokens:          inputTokens,
          output_tokens:         outputTokens,
          cache_read_tokens:     cacheReadTokens,
          cache_creation_tokens: cacheCreationTokens,
          duration_ms:           Date.now() - startedAt,
          success:               true,
        })

        controller.enqueue(sseData({
          type:                  'done',
          input_tokens:          inputTokens,
          output_tokens:         outputTokens,
          cache_read_tokens:     cacheReadTokens,
          cache_creation_tokens: cacheCreationTokens,
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[agent-financeiro] stream error:', msg)

        await supabase.from('agent_executions').insert({
          church_id:             churchId,
          agent_slug:            AGENT_SLUG,
          user_id:               user.id,
          model:                 MODEL,
          input_tokens:          inputTokens,
          output_tokens:         outputTokens,
          cache_read_tokens:     cacheReadTokens,
          cache_creation_tokens: cacheCreationTokens,
          duration_ms:           Date.now() - startedAt,
          success:               false,
          error:                 msg,
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
