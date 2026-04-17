// ============================================================
// Edge Function: agent-escalas
// Agente de Escalas — Claude Haiku — geração e gestão de escalas
//
// POST /agent-escalas
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
const MODEL = 'claude-haiku-4-5-20251001'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MAX_TOKENS    = 2048
const HISTORY_LIMIT = 10
const AGENT_SLUG    = 'agent-escalas'

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

  // ── Dados de ministérios e voluntários ──────────────────
  const [
    { data: ministries },
    { count: volunteerCount },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('groups').select('id, name, type, member_count')
      .eq('church_id', churchId)
      .in('type', ['ministry', 'ministerio', 'ministerio_musical', 'recepcao', 'multimidia'])
      .eq('is_active', true)
      .order('name', { ascending: true }).limit(20),
    supabase.from('volunteers').select('id', { count: 'exact', head: true })
      .eq('church_id', churchId).eq('is_active', true),
    supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
  ])

  const ministriesList = (ministries ?? []).length > 0
    ? (ministries ?? []).map(m => `  • ${m.name as string} (${(m.member_count as number) ?? 0} membros)`).join('\n')
    : '  Nenhum ministério cadastrado ainda'

  // ── System prompt ────────────────────────────────────────
  const systemPrompt = `Você é o Assistente de Escalas da ${churchRow?.name ?? 'igreja'}.

MINISTÉRIOS CADASTRADOS:
${ministriesList}
Voluntários ativos no sistema: ${volunteerCount ?? 0}

MISSÃO:
Criar e organizar escalas de voluntários para cultos e eventos.

FORMATO PADRÃO DE ESCALA (tabela markdown):
| Data | Culto/Evento | Ministério | Função | Voluntário |
|------|-------------|------------|--------|------------|
| Dom 06/04 | Culto Manhã | Louvor | Vocal | [Nome] |

REGRAS:
1. Distribua equitativamente (máx 2 semanas seguidas por voluntário)
2. Alerte quando ministério tiver < 3 voluntários (risco operacional)
3. Quando não tiver nomes, gere estrutura com [A definir] e instrua como preencher
4. Para substiuições: sugira perfil ideal, não nome específico (não tenho acesso individual)

PERGUNTAS COMUNS:
- "Cria escala de louvor para abril" → gera tabela para 4-5 domingos
- "Quantas pessoas preciso para um culto?" → lista funções por ministério
- "Como organizar a recepção?" → explica distribuição por ponto/horário

Tom: organizador eficiente e prático.
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
          messages: [...history, { role: 'user', content: message }],
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

        const finalMsg              = await stream.finalMessage()
        inputTokens                 = finalMsg.usage.input_tokens
        outputTokens                = finalMsg.usage.output_tokens
        const cacheUsage            = finalMsg.usage as Record<string, number | undefined>
        cacheReadTokens             = cacheUsage.cache_read_input_tokens    ?? 0
        cacheCreationTokens         = cacheUsage.cache_creation_input_tokens ?? 0

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
          type:          'done',
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[agent-escalas] stream error:', msg)

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
