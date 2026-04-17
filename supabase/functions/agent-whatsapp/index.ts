// ============================================================
// Edge Function: agent-whatsapp v1
// Gerador de Mensagens WhatsApp — SSE streaming conversacional
//
// POST /agent-whatsapp
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
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MODEL         = 'claude-haiku-4-5-20251001'
const MAX_TOKENS    = 2048
const HISTORY_LIMIT = 16
const AGENT_SLUG    = 'agent-whatsapp'

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

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
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

  // ── Carrega contexto da church ─────────────────────────
  const today    = new Date()
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: upcomingEvents },
    { data: churchRow },
  ] = await Promise.all([
    supabase
      .from('events')
      .select('title, starts_at, ends_at, location, description, type')
      .eq('church_id', churchId)
      .gte('starts_at', today.toISOString())
      .lte('starts_at', nextWeek)
      .order('starts_at', { ascending: true })
      .limit(7),
    supabase
      .from('churches')
      .select('name, denomination')
      .eq('id', churchId)
      .maybeSingle(),
  ])

  const churchName   = churchRow?.name ?? 'sua igreja'
  const denomination = (churchRow?.denomination as string | undefined) ?? 'evangélica'
  const todayLabel   = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const eventsCtx = (upcomingEvents ?? []).length > 0
    ? (upcomingEvents ?? []).map(e => {
        const start = new Date(e.starts_at as string).toLocaleDateString('pt-BR', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        })
        const loc = e.location ? ` · ${e.location}` : ''
        return `  • ${e.title} — ${start}${loc}`
      }).join('\n')
    : '  Nenhum evento cadastrado esta semana.'

  const systemPrompt = `Você é o Assistente de Mensagens WhatsApp da ${churchName} (${denomination}).

HOJE: ${todayLabel}

EVENTOS DESTA SEMANA:
${eventsCtx}

TIPOS DE MENSAGEM QUE VOCÊ ESCREVE:

📢 AVISO/COMUNICADO
Informa a congregação sobre eventos, mudanças ou notícias importantes.
Formato: Contexto → o quê → quando → onde → como participar → encerramento caloroso

📨 CONVITE
Convida para um evento específico de forma acolhedora e motivadora.
Formato: saudação calorosa → o evento → por que vir → quando/onde → CTA

🤝 BOAS-VINDAS
Mensagem para novos membros, visitantes ou pessoas que se reconciliaram.
Formato: saudação → acolhida → próximos passos → contato

🎂 ANIVERSÁRIO
Mensagem pastoral para aniversariantes.
Formato: saudação personalizada → versículo → bênção → assinatura pastoral

📋 COMUNICADO GERAL
Recados internos para equipes, líderes ou ministérios.
Formato: objetivo direto → informações necessárias → ação requerida

REGRAS ABSOLUTAS:
- Máximo 3 emojis por mensagem (use com moderação)
- Português brasileiro informal mas correto
- Sem linguagem corporativa ou muito formal
- Sem hashtags (WhatsApp não usa hashtags)
- Tamanho ideal: 80-150 palavras (pode ser menor para aniversários)
- Tom caloroso, fraternal, pastoral
- Se o usuário não especificar o tipo, pergunte ou gere o tipo mais adequado ao contexto
- Se precisar de informações adicionais (nome do aniversariante, data, etc.), peça ao usuário

Língua: português brasileiro.`

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
