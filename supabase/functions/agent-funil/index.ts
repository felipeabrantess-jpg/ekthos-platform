// ============================================================
// Edge Function: agent-funil
// Agente de Funil Pastoral — Claude Haiku
// Analisa o pipeline de discipulado e ajuda o pastor a
// identificar gargalos e mover pessoas de etapa.
//
// POST /agent-funil
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
const HISTORY_LIMIT = 12
const AGENT_SLUG    = 'agent-funil'

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

  // ── Contexto: pipeline stages e contagens ───────────────
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, order, max_days_sla')
    .eq('church_id', churchId)
    .order('order', { ascending: true })

  const stageStats: Array<{ name: string; count: number; sla?: number }> = []

  if (stages && stages.length > 0) {
    for (const stage of stages.slice(0, 12)) {
      const { count } = await supabase
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('pipeline_stage_id', stage.id)

      stageStats.push({
        name:  stage.name,
        count: count ?? 0,
        sla:   (stage as Record<string, unknown>).max_days_sla as number | undefined,
      })
    }
  }

  const { count: totalInPipeline } = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .not('pipeline_stage_id', 'is', null)

  const { data: churchRow } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()

  const stageLines = stageStats.length > 0
    ? stageStats.map(s => `  • ${s.name}: ${s.count} pessoa(s)${s.sla ? ` | SLA ${s.sla}d` : ''}`).join('\n')
    : '  (pipeline ainda não configurado)'

  // ── System prompt ───────────────────────────────────────
  const systemPrompt = `Você é o Agente de Funil Pastoral da ${churchRow?.name ?? 'igreja'}.

DADOS DO PIPELINE (tempo real):
${stageLines}
Total ativo no funil: ${totalInPipeline ?? 0} pessoas

MISSÃO:
Analisar o caminho de discipulado e ajudar o pastor a agir com mais eficácia.

COMO RESPONDER:
1. Identifique gargalos: etapas com muitas pessoas + SLA estourado
2. Priorize por urgência pastoral (quem precisa de atenção agora)
3. Sugira ação concreta: "Ligue para os 3 visitantes mais antigos de [etapa]"
4. Calcule taxas de conversão quando perguntado
5. Alerte quando etapa tiver 0 pessoas (pode indicar problema de cadastro)

FORMATO DAS RESPOSTAS:
- No máximo 4 parágrafos diretos
- Use **negrito** para números críticos e alertas
- Termine sempre com 1 ação concreta sugerida
- Tom pastoral, não corporativo

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
        cacheReadTokens     = usage.cache_read_input_tokens    ?? 0
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
        console.error('[agent-funil] stream error:', msg)

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
