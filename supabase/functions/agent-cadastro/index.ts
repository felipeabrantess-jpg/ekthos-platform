// ============================================================
// Edge Function: agent-cadastro  v35 — PR 1: Tolerância zero
//
// POST /agent-cadastro
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, clear_history?: boolean }
// Returns: SSE stream
//
// MUDANÇAS v35 (PR 1 — parar alucinação):
//   - Tool search_person: busca real com normalização de telefone.
//     O modelo SÓ pode afirmar algo sobre duplicatas após executá-la.
//   - Removido bloco visitor_data / duplicatesContext (caminho morto).
//   - System prompt: proibido afirmar verificação sem tool executada.
//   - Agentic loop de 1 round-trip: turno 1 pode usar tool,
//     turno 2 responde com o resultado em mãos.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic         from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const MODEL                     = 'claude-haiku-4-5-20251001'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

// ── Tool: search_person ─────────────────────────────────────

/**
 * Normaliza telefone para comparação:
 *   strip não-dígitos → remove prefixo 55 (Brasil) se sobrar ≥10 dígitos.
 *   Exemplos: "+55 (11) 98765-4321" → "11987654321"
 *             "(11) 98765-4321"     → "11987654321"
 *             "11987654321"         → "11987654321"
 */
function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return (d.startsWith('55') && d.length > 11) ? d.slice(2) : d
}

interface SearchInput {
  nome?:     string
  telefone?: string
  email?:    string
}

interface PersonRow {
  id:            string
  nome:          string
  telefone:      string | null
  email:         string | null
  etapa:         string | null
  cadastrado_em: string | null
}

async function execSearchPerson(
  input: SearchInput,
  churchId: string,
): Promise<{ encontrados: PersonRow[]; total: number }> {
  const orParts: string[] = []

  const primeiroNome = (input.nome?.trim() ?? '').split(' ')[0]
  if (primeiroNome.length > 2) orParts.push(`name.ilike.%${primeiroNome}%`)

  if (input.telefone) {
    const core = normPhone(input.telefone)
    // ilike com wildcard captura qualquer formatação armazenada (+55, parênteses, etc.)
    if (core.length >= 8) orParts.push(`phone.ilike.%${core}%`)
  }

  if (input.email?.trim()) {
    orParts.push(`email.ilike.${input.email.trim().toLowerCase()}`)
  }

  if (orParts.length === 0) {
    return { encontrados: [], total: 0 }
  }

  const { data, error } = await supabase
    .from('people')
    .select('id, name, phone, email, person_stage, created_at')
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .or(orParts.join(','))
    .limit(5)

  if (error) throw new Error(error.message)

  const encontrados: PersonRow[] = (data ?? []).map((p: Record<string, unknown>) => ({
    id:            p.id as string,
    nome:          (p.name ?? '(sem nome)') as string,
    telefone:      (p.phone ?? null) as string | null,
    email:         (p.email ?? null) as string | null,
    etapa:         (p.person_stage ?? null) as string | null,
    cadastrado_em: (p.created_at ?? null) as string | null,
  }))

  return { encontrados, total: encontrados.length }
}

// ── Tool definition ─────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_person',
    description:
      'Busca pessoas cadastradas na igreja pelo nome, telefone ou email. ' +
      'DEVE ser chamada antes de qualquer afirmação sobre duplicatas — ' +
      'sem ela não há base para nenhuma afirmação. ' +
      'Lista vazia é resultado válido e explícito ("nenhum encontrado"), não silêncio.',
    input_schema: {
      type: 'object',
      properties: {
        nome:     { type: 'string', description: 'Nome completo ou parcial' },
        telefone: { type: 'string', description: 'Qualquer formato: (11) 99999-9999 / 11999999999 / +5511999999999' },
        email:    { type: 'string', description: 'Endereço de e-mail completo' },
      },
      required: [],
    },
  },
] as const

// ── System prompt ───────────────────────────────────────────

function buildSystemPrompt(churchName: string): string {
  return `Você é o Assistente de Cadastro da ${churchName}.

REGRA INVIOLÁVEL — TOLERÂNCIA ZERO PARA ALUCINAÇÃO:
Você NÃO pode afirmar "verifiquei", "não encontrei duplicata", "já existe
cadastro" ou qualquer variante sem ter executado search_person nesta conversa.

  • Sem tool executada → responda: "Ainda não verifiquei o cadastro.
    Pode me informar nome e telefone para eu conferir?"
  • Se a tool retornar erro → diga exatamente: "A busca retornou um erro
    ([motivo]). Não consigo confirmar nada sobre duplicatas agora."
  • NUNCA trate erro ou ausência de busca como "não encontrado".

MISSÃO:
Coletar dados da pessoa, verificar duplicatas via search_person e
apresentar o resultado com honestidade.

CAMPOS:
  Obrigatórios: nome completo (mínimo 2 palavras), telefone/WhatsApp
  Opcionais: email, data de nascimento, como chegou, bairro

FLUXO:
1. Colete nome e telefone.
2. Execute search_person.
3. Se houver correspondência: apresente e pergunte se é a mesma pessoa.
4. Se não houver: confirme os dados coletados e explique com clareza que
   o cadastro final será concluído por um responsável — você ainda não
   realiza essa etapa.

Tom: secretário eficiente, honesto e cuidadoso.
Língua: português brasileiro.`
}

// ── Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  // church_id vem SEMPRE do JWT validado — nunca do body ou do modelo
  const churchId =
    (user.app_metadata?.church_id  as string | undefined) ??
    (user.user_metadata?.church_id as string | undefined) ?? null

  if (!churchId) return jsonErr('church_id não encontrado no token', 400)

  // ── Verifica se agente está ativado ───────────────────────
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

    if (!sa?.active) return jsonErr('Agente não ativado para esta conta', 403)
  }

  // ── Body ──────────────────────────────────────────────────
  interface CadastroBody {
    message?:       string
    clear_history?: boolean
  }
  let body: CadastroBody
  try   { body = await req.json() as CadastroBody }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  const { data: churchRow } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()

  const systemPrompt = buildSystemPrompt(churchRow?.name ?? 'Igreja')

  // ── Limpa histórico se solicitado ─────────────────────────
  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', AGENT_SLUG)
  }

  // ── Histórico ─────────────────────────────────────────────
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
      role:    m.role    as 'user' | 'assistant',
      content: m.content as string,
    }))

  // Salva mensagem do usuário antes de iniciar o stream
  await supabase.from('agent_conversations').insert({
    church_id:  churchId,
    user_id:    user.id,
    agent_slug: AGENT_SLUG,
    role:       'user',
    content:    message,
  })

  // ── Streaming SSE — agentic loop (máx 1 round-trip de tool) ──
  const startedAt = Date.now()

  const readableStream = new ReadableStream({
    async start(controller) {
      let assistantReply      = ''
      let inputTokens         = 0
      let outputTokens        = 0
      let cacheReadTokens     = 0
      let cacheCreationTokens = 0

      try {
        // Tipo auxiliar para conteúdo de mensagens
        type ContentItem = { type: string; id?: string; name?: string; input?: unknown; text?: string }
        type MsgParam    = { role: 'user' | 'assistant'; content: string | ContentItem[] }

        const baseMessages: MsgParam[] = [
          ...history,
          { role: 'user', content: message },
        ]
        const systemBlocks = [
          { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
        ]

        // ── Turno 1: pode terminar com tool_use ─────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream1 = anthropic.messages.stream({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          tools:      TOOLS as unknown as Parameters<typeof anthropic.messages.stream>[0]['tools'],
          system:     systemBlocks,
          messages:   baseMessages as Parameters<typeof anthropic.messages.stream>[0]['messages'],
        })

        const turn1Blocks: ContentItem[] = []
        let curBlock: ContentItem | null  = null

        for await (const evt of stream1) {
          if (evt.type === 'content_block_start') {
            const cb = evt.content_block as ContentItem
            curBlock = { type: cb.type, id: cb.id, name: cb.name, input: '', text: '' }
          } else if (evt.type === 'content_block_delta' && curBlock) {
            const d = evt.delta as { type: string; text?: string; partial_json?: string }
            if (d.type === 'text_delta') {
              const chunk = d.text ?? ''
              curBlock.text  = (curBlock.text ?? '') + chunk
              assistantReply += chunk
              controller.enqueue(sseData({ type: 'token', content: chunk }))
            } else if (d.type === 'input_json_delta') {
              curBlock.input = (curBlock.input as string) + (d.partial_json ?? '')
            }
          } else if (evt.type === 'content_block_stop' && curBlock) {
            if (curBlock.type === 'tool_use') {
              try { curBlock.input = JSON.parse(curBlock.input as string) }
              catch { curBlock.input = {} }
            }
            turn1Blocks.push(curBlock)
            curBlock = null
          }
        }

        const fin1                   = await stream1.finalMessage()
        inputTokens         += fin1.usage.input_tokens
        outputTokens        += fin1.usage.output_tokens
        const u1 = fin1.usage as Record<string, number | undefined>
        cacheReadTokens     += u1.cache_read_input_tokens    ?? 0
        cacheCreationTokens += u1.cache_creation_input_tokens ?? 0

        // ── Executa tools, se houver ─────────────────────────
        if (fin1.stop_reason === 'tool_use') {
          const toolUses  = turn1Blocks.filter(b => b.type === 'tool_use')
          const toolResults: ContentItem[] = []

          for (const tu of toolUses) {
            controller.enqueue(sseData({ type: 'tool_call', name: tu.name }))

            if (tu.name === 'search_person') {
              try {
                const result = await execSearchPerson(tu.input as SearchInput, churchId)
                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: tu.id,
                  content:     JSON.stringify(result),
                } as unknown as ContentItem)
                controller.enqueue(sseData({ type: 'tool_result', name: tu.name, total: result.total }))
              } catch (toolErr) {
                const errMsg = (toolErr as Error).message ?? 'Erro desconhecido'
                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: tu.id,
                  is_error:    true,
                  content:     `Erro ao buscar: ${errMsg}`,
                } as unknown as ContentItem)
                controller.enqueue(sseData({ type: 'tool_error', name: tu.name, error: errMsg }))
              }
            }
          }

          // Reconstrói content do assistente para a API (omite text vazio)
          const assistantContent = turn1Blocks
            .filter(b => b.type !== 'text' || (b.text ?? '').length > 0)
            .map(b =>
              b.type === 'text'
                ? { type: 'text', text: b.text ?? '' }
                : { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} }
            )

          // ── Turno 2: resposta final com resultado da tool ──
          const turn2Messages: MsgParam[] = [
            ...baseMessages,
            { role: 'assistant', content: assistantContent },
            { role: 'user',      content: toolResults as unknown as ContentItem[] },
          ]

          const stream2 = anthropic.messages.stream({
            model:      MODEL,
            max_tokens: MAX_TOKENS,
            tools:      TOOLS as unknown as Parameters<typeof anthropic.messages.stream>[0]['tools'],
            system:     systemBlocks,
            messages:   turn2Messages as Parameters<typeof anthropic.messages.stream>[0]['messages'],
          })

          for await (const evt of stream2) {
            if (
              evt.type === 'content_block_delta' &&
              (evt.delta as { type: string }).type === 'text_delta'
            ) {
              const chunk = (evt.delta as { text: string }).text
              assistantReply += chunk
              controller.enqueue(sseData({ type: 'token', content: chunk }))
            }
          }

          const fin2                   = await stream2.finalMessage()
          inputTokens         += fin2.usage.input_tokens
          outputTokens        += fin2.usage.output_tokens
          const u2 = fin2.usage as Record<string, number | undefined>
          cacheReadTokens     += u2.cache_read_input_tokens    ?? 0
          cacheCreationTokens += u2.cache_creation_input_tokens ?? 0
        }

        // ── Persiste resposta e telemetria ───────────────────
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
