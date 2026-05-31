// ============================================================
// Edge Function: agent-operacao  v1 — SA-A5 MEGA-ONDA
// Agente Operacional — responde perguntas de membros conhecidos
//
// POST /functions/v1/agent-operacao
// verify_jwt = false — chamada interna (conversation-router)
//
// Responsabilidade:
//   Responder perguntas operacionais de membros já conhecidos:
//   horários de culto, endereço, departamentos, eventos próximos,
//   informações gerais da igreja.
//
//   DIFERENÇA do agent-acolhimento:
//   - Acolhimento: pessoas novas, primeira interação, consolidação
//   - Operacao: membros que já pertencem e têm dúvidas do dia-a-dia
//
// Input (do conversation-router):
//   { conversation_id, message_id, church_id, person_id,
//     agent_slug, inbound_text, trigger }
//
// Fluxo:
//   1. Valida conversa (ownership check, cross-tenant guard)
//   2. Rate limit: máx 5 respostas automáticas por conversa em 5 min
//   3. Busca config e info da igreja
//   4. Busca contexto da pessoa
//   5. Chama Claude Haiku com prompt operacional
//   6. Enfileira resposta via enqueue_message RPC
//   7. Debita crédito (best-effort, p_operation_type='inbound_reply')
//   8. Loga execução em agent_executions
//
// Modelo: claude-haiku-4-5-20251001
// NÃO usar: claude-3-5-haiku-20241022 (descontinuado, retorna 404)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic        from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { logAgentExecution } from '../_shared/log-agent-execution.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic  = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const AGENT_SLUG = 'agent-operacao'
const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1024

// ── CORS ───────────────────────────────────────────────────
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Prompt do agente operacional ───────────────────────────
function buildSystemPrompt(church: Record<string, unknown>, personName: string | null): string {
  const churchName    = (church.name        as string | undefined) ?? 'nossa igreja'
  const address       = (church.address     as string | undefined) ?? ''
  const city          = (church.city        as string | undefined) ?? ''
  const state         = (church.state       as string | undefined) ?? ''
  const contactPhone  = (church.contact_whatsapp as string | undefined)
                     ?? (church.main_phone  as string | undefined)
                     ?? ''
  const contactEmail  = (church.main_email  as string | undefined) ?? ''

  // church_info_text: pode conter horários, departamentos, etc.
  const infoExtra    = (church.public_info  as string | undefined)
                    ?? (church.church_info  as string | undefined)
                    ?? ''

  const addressLine = [address, city, state].filter(Boolean).join(', ')
  const greeting    = personName ? `O membro em questão se chama ${personName}.` : ''

  return `Você é o assistente operacional de ${churchName}.

Responda de forma gentil, concisa e pastoral a perguntas operacionais como:
horários de culto, endereço, departamentos, grupos de célula, eventos próximos
e informações gerais da igreja.

${greeting}

Informações da igreja:
- Nome: ${churchName}
${addressLine ? `- Endereço: ${addressLine}` : ''}
${contactPhone ? `- WhatsApp/telefone: ${contactPhone}` : ''}
${contactEmail ? `- E-mail: ${contactEmail}` : ''}
${infoExtra ? `\n${infoExtra}` : ''}

Regras fundamentais:
- NUNCA invente informações. Se não souber a resposta, oriente o membro a entrar em contato com a secretaria.
- Seja breve e direto — o membro perguntou algo simples, responda de forma simples.
- Use linguagem pastoral, acolhedora, mas sem ser prolixo.
- NÃO use markdown (asteriscos, listas com hífens, etc.) — escreva como texto WhatsApp.
- Se a pergunta fugir de assuntos operacionais, sugira gentilmente falar com um pastor ou líder.`
}

// ── Handler principal ──────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 204)

  const t0 = Date.now()

  try {
    const body = await req.json() as {
      conversation_id: string
      message_id?:     string
      church_id:       string
      person_id?:      string | null
      agent_slug?:     string
      inbound_text:    string
      trigger?:        string
    }

    const {
      conversation_id,
      message_id  = '',
      church_id,
      person_id   = null,
      inbound_text,
    } = body

    if (!conversation_id || !church_id || !inbound_text) {
      return json({ ok: false, error: 'missing required fields: conversation_id, church_id, inbound_text' }, 400)
    }

    // ── 1. Validar conversa ───────────────────────────────
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('church_id, ownership, person_id, contact_phone, status')
      .eq('id', conversation_id)
      .eq('church_id', church_id)   // cross-tenant guard
      .maybeSingle()

    if (!conv) {
      console.error(`[agent-operacao] conversa não encontrada: ${conversation_id}`)
      await logAgentExecution(supabaseAdmin, {
        church_id, agent_slug: AGENT_SLUG, model: MODEL,
        trigger_type: 'inbound_message', status: 'error',
        duration_ms: Date.now() - t0, error: 'conversation_not_found',
      })
      return json({ ok: false, error: 'conversation_not_found' }, 404)
    }

    if (conv.status === 'closed' || conv.status === 'archived') {
      console.log(`[agent-operacao] conversa ${conversation_id} status=${conv.status} — ignorando`)
      return json({ ok: true, result: 'skipped_closed_conversation' })
    }

    if (conv.ownership !== 'agent') {
      console.log(`[agent-operacao] ${conversation_id} ownership=${conv.ownership} — ignorando`)
      return json({ ok: true, result: 'skipped_not_agent_ownership' })
    }

    // ── 2. Rate limit: máx 5 respostas automáticas em 5 min ──
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentMsgs } = await supabaseAdmin
      .from('conversation_messages')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'outbound')
      .eq('sender_type', 'agent')
      .gte('created_at', fiveMinAgo)
      .limit(5)

    const recentCount = recentMsgs?.length ?? 0
    if (recentCount >= 5) {
      console.warn(`[agent-operacao] RATE_LIMIT conv=${conversation_id} outbound_agent_5min=${recentCount}`)
      await logAgentExecution(supabaseAdmin, {
        church_id, agent_slug: AGENT_SLUG, model: MODEL,
        trigger_type: 'inbound_message', status: 'rate_limited',
        duration_ms: Date.now() - t0,
        error: 'max 5 respostas automáticas por conversa em 5 minutos',
      })
      return json({ ok: false, error: 'rate_limit_exceeded' })
    }

    // ── 3. Buscar info da igreja ──────────────────────────
    const { data: church } = await supabaseAdmin
      .from('churches')
      .select('name, address, city, state, main_email, contact_whatsapp, public_info, timezone')
      .eq('id', church_id)
      .maybeSingle()

    if (!church) {
      console.error(`[agent-operacao] igreja não encontrada: ${church_id}`)
      await logAgentExecution(supabaseAdmin, {
        church_id, agent_slug: AGENT_SLUG, model: MODEL,
        trigger_type: 'inbound_message', status: 'error',
        duration_ms: Date.now() - t0, error: 'church_not_found',
      })
      return json({ ok: false, error: 'church_not_found' }, 404)
    }

    // ── 4. Buscar contexto da pessoa ──────────────────────
    const resolvedPersonId = person_id ?? conv.person_id ?? null
    let personName: string | null = null

    if (resolvedPersonId) {
      const { data: person } = await supabaseAdmin
        .from('people')
        .select('first_name, last_name, person_stage')
        .eq('id', resolvedPersonId)
        .eq('church_id', church_id)
        .maybeSingle()

      if (person) {
        personName = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || null
      }
    }

    // ── 5. Buscar histórico recente da conversa (últimas 10 mensagens) ──
    const { data: history } = await supabaseAdmin
      .from('conversation_messages')
      .select('direction, sender_type, content, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10)

    const historyStr = (history ?? [])
      .reverse()
      .map(m => {
        const label = m.sender_type === 'contact' ? 'Membro'
                    : m.sender_type === 'human'   ? 'Pastor/Staff'
                    : 'Assistente'
        return `[${label}]: ${m.content}`
      })
      .join('\n')

    // ── 6. Chamar Claude Haiku ────────────────────────────
    const systemPrompt = buildSystemPrompt(church as Record<string, unknown>, personName)

    const userContent = historyStr
      ? `Histórico recente:\n${historyStr}\n\nNova mensagem do membro:\n${inbound_text}`
      : inbound_text

    let responseText: string
    let inputTokens = 0
    let outputTokens = 0

    try {
      const claudeRes = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      })

      responseText = claudeRes.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim()

      inputTokens  = claudeRes.usage.input_tokens
      outputTokens = claudeRes.usage.output_tokens

      if (!responseText) {
        throw new Error('Claude retornou resposta vazia')
      }
    } catch (e) {
      console.error('[agent-operacao] Claude call failed:', (e instanceof Error) ? e.message : 'unknown')
      await logAgentExecution(supabaseAdmin, {
        church_id, agent_slug: AGENT_SLUG, model: MODEL,
        trigger_type: 'inbound_message', status: 'error',
        duration_ms: Date.now() - t0,
        error: (e instanceof Error) ? e.message : String(e),
      })
      return json({ ok: false, error: 'internal_error' }, 500)
    }

    // ── 7. Enfileirar resposta via enqueue_message RPC ────
    const { error: enqueueErr } = await supabaseAdmin.rpc('enqueue_message', {
      p_conversation_id: conversation_id,
      p_church_id:       church_id,
      p_direction:       'outbound',
      p_sender_type:     'agent',
      p_content:         responseText,
      p_agent_slug:      AGENT_SLUG,
      p_message_id:      message_id || null,
    })

    if (enqueueErr) {
      console.error('[agent-operacao] enqueue_message falhou:', enqueueErr.message)
      await logAgentExecution(supabaseAdmin, {
        church_id, agent_slug: AGENT_SLUG, model: MODEL,
        trigger_type: 'inbound_message', status: 'error',
        duration_ms: Date.now() - t0, error: `enqueue_failed: ${enqueueErr.message}`,
        input_tokens: inputTokens, output_tokens: outputTokens,
      })
      return json({ ok: false, error: 'internal_error' }, 500)
    }

    // ── 8. Debitar crédito (best-effort) ──────────────────
    supabaseAdmin.rpc('debit_agent_credits', {
      p_church_id:         church_id,
      p_agent_slug:        AGENT_SLUG,
      p_operation_type:    'inbound_reply',
      p_credits:           1,
      p_related_entity_id: conversation_id,
    }).catch((e: unknown) => {
      console.warn('[agent-operacao] debit_agent_credits falhou (não crítico):', e)
    })

    // ── 9. Log de execução ────────────────────────────────
    await logAgentExecution(supabaseAdmin, {
      church_id,
      agent_slug:   AGENT_SLUG,
      model:        MODEL,
      trigger_type: 'inbound_message',
      status:       'success',
      duration_ms:  Date.now() - t0,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })

    console.log(`[agent-operacao] ✓ conv=${conversation_id} tokens=${inputTokens}+${outputTokens} ${Date.now() - t0}ms`)
    return json({ ok: true, result: 'message_enqueued' })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-operacao] unhandled error:', msg)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
})
