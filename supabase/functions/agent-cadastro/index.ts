// ============================================================
// Edge Function: agent-cadastro
// Agente de Cadastro — Claude Haiku — deduplicação e ficha de visitantes
//
// POST /agent-cadastro
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, visitor_data?: Record<string, string>, clear_history?: boolean }
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

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const MAX_TOKENS    = 1024
const HISTORY_LIMIT = 8
const AGENT_SLUG    = 'agent-cadastro'

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
  interface CadastroBody {
    message?:       string
    visitor_data?:  Record<string, string>
    clear_history?: boolean
  }
  let body: CadastroBody
  try   { body = await req.json() as CadastroBody }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  // ── Deduplicação ─────────────────────────────────────────
  const visitorData = body.visitor_data
  let duplicatesContext = ''
  if (visitorData) {
    const orParts: string[] = []
    if (visitorData.name) {
      const first = visitorData.name.trim().split(' ')[0]
      if (first.length > 2) orParts.push(`name.ilike.%${first}%`)
    }
    if (visitorData.phone)  orParts.push(`phone.eq.${visitorData.phone.replace(/\D/g, '')}`)
    if (visitorData.email)  orParts.push(`email.eq.${visitorData.email.toLowerCase()}`)

    if (orParts.length > 0) {
      const { data: matches } = await supabase
        .from('people')
        .select('name, email, phone, status')
        .eq('church_id', churchId)
        .or(orParts.join(','))
        .limit(5)
      duplicatesContext = matches && matches.length > 0
        ? `\nPOSSÍVEIS DUPLICATAS (${matches.length}):\n` +
          (matches as Array<Record<string, string | null>>)
            .map(m => `  • ${m.name ?? '(sem nome)'} | ${m.phone ?? '-'} | ${m.email ?? '-'} | ${m.status ?? '-'}`)
            .join('\n')
        : '\nNenhuma duplicata encontrada.'
    }
  }

  const visitorContext = visitorData
    ? `\nDADOS DA FICHA:\n${Object.entries(visitorData).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : ''

  const { data: churchRow } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()

  // ── System prompt ────────────────────────────────────────
  const systemPrompt = `Você é o Assistente de Cadastro da ${churchRow?.name ?? 'igreja'}.
${visitorContext}${duplicatesContext}

MISSÃO:
Processar fichas de visitantes, verificar duplicatas e garantir cadastros limpos.

FLUXO DE PROCESSAMENTO:
1. Se houver possível duplicata → informe e pergunte se deve atualizar cadastro existente
2. Se não houver → confirme dados e oriente: Pessoas → Novo Cadastro

CAMPOS OBRIGATÓRIOS:
- Nome completo (mínimo 2 palavras)
- Telefone/WhatsApp (formato: (XX) XXXXX-XXXX)

CAMPOS OPCIONAIS:
- Email | Data de nascimento | Endereço
- Como chegou: indicação / redes sociais / web / passando na rua
- Status inicial: Visitante (padrão)

VALIDAÇÕES:
- Telefone igual → duplicata confirmada
- Nome muito similar (>80% parecido) → pode ser duplicata, confirmar
- Email igual → duplicata confirmada

Tom: secretário eficiente e cuidadoso.
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
        console.error('[agent-cadastro] stream error:', msg)

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
