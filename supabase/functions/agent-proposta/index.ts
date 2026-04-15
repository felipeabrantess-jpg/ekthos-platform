// ============================================================
// Edge Function: agent-proposta
// Estrategista de Eventos e Propostas — Claude Haiku
// Estrutura propostas de eventos pastorais e cria convites
// segmentados por perfil de membro (pipeline).
//
// POST /agent-proposta
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
const MAX_TOKENS    = 2048
const HISTORY_LIMIT = 10
const AGENT_SLUG    = 'agent-proposta'

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

  // ── Dados contextuais ───────────────────────────────────
  const now       = new Date()
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: events },
    { data: stages },
    { count: totalMembers },
    { count: visitors },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('events').select('id, title, starts_at, max_capacity')
      .eq('church_id', churchId).gte('starts_at', now.toISOString()).lte('starts_at', nextMonth)
      .order('starts_at', { ascending: true }).limit(8),
    supabase.from('pipeline_stages').select('name, order').eq('church_id', churchId)
      .order('order', { ascending: true }).limit(8),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'member'),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'visitor'),
    supabase.from('churches').select('name, denomination').eq('id', churchId).maybeSingle(),
  ])

  const eventsText = (events ?? []).length > 0
    ? (events ?? []).map(e =>
        `  • ${e.title as string} — ${new Date(e.starts_at as string).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}${e.max_capacity ? ` (cap: ${e.max_capacity})` : ''}`
      ).join('\n')
    : '  Nenhum evento próximo cadastrado.'

  const stagesText = (stages ?? []).map(s => s.name).join(' → ') || 'pipeline não configurado'

  // ── System prompt ────────────────────────────────────────
  const systemPrompt = `Você é o Estrategista de Eventos e Propostas da ${churchRow?.name ?? 'igreja'}.

COMUNIDADE:
  Membros: ${totalMembers ?? 0} | Visitantes: ${visitors ?? 0}
  Caminho de discipulado: ${stagesText}

PRÓXIMOS EVENTOS (30 dias):
${eventsText}

MISSÃO:
Estruturar eventos pastorais e criar convites segmentados por perfil de pessoa.

PROPOSTA DE EVENTO (quando solicitado, inclua):
1. Nome + data/hora recomendada
2. Público-alvo (quais etapas do pipeline)
3. Objetivo pastoral (o que deve mudar na vida do participante)
4. Formato: presencial/online/híbrido, duração, programa resumido
5. Cronograma de preparação: 4 semanas antes → 1 semana → dia

CONVITES POR PERFIL:
• Visitante: acolhedor, sem pressão, foco na experiência ("Você conheceu nossa comunidade...")
• Membro novo (<3 meses): pertencimento, próximos passos
• Membro ativo: missão compartilhada, crescimento
• Líder/voluntário: responsabilidade, multiplicação, legado

FORMATOS DE SAÍDA:
- Convite WhatsApp (máx 150 palavras)
- Script de anúncio no culto (30-60 segundos)
- Post Instagram do evento

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
        console.error('[agent-proposta] stream error:', msg)

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
