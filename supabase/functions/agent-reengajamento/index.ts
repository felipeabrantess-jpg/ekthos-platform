// ============================================================
// Edge Function: agent-reengajamento  v1
// Agente de Reengajamento Pastoral — detecta membros afastados
// e gera mensagens personalizadas via IA.
//
// POST /agent-reengajamento
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { message: string, clear_history?: boolean }
// Returns: SSE stream
//
// verify_jwt: false — valida manualmente (padrão ES256)
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

const AGENT_SLUG  = 'agent-reengajamento'
const MODEL       = 'claude-haiku-4-5-20251001'
const MAX_TOKENS  = 2048
const HISTORY_LIMIT = 16

const SENSITIVE_KEYWORDS = [
  'luto', 'faleceu', 'falecimento', 'morte', 'morreu',
  'doença', 'hospital', 'internado', 'internada', 'cirurgia',
  'crise', 'depressão', 'ansiedade', 'suicídio', 'suicidio',
  'separação', 'separacao', 'divórcio', 'divorcio',
  'desemprego', 'desempregado', 'dívida', 'divida',
  'violência', 'violencia', 'abuso',
]

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

function daysSince(date: string | null): number | null {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

function classifyAbsence(days: number): string {
  if (days >= 30) return 'away_30d'
  if (days >= 21) return 'away_21d'
  if (days >= 14) return 'away_14d'
  return 'away_7d'
}

function urgencyLabel(days: number): string {
  if (days >= 30) return '🔴 CRÍTICO (30+ dias)'
  if (days >= 21) return '🟠 URGENTE (21+ dias)'
  if (days >= 14) return '🟡 ATENÇÃO (14+ dias)'
  return '🟢 LEVE (7+ dias)'
}

function isSensitive(person: Record<string, unknown>): boolean {
  const obs   = ((person.observacoes_pastorais as string) ?? '').toLowerCase()
  const tags  = ((person.tags as string[]) ?? []).join(' ').toLowerCase()
  const haystack = `${obs} ${tags}`
  return SENSITIVE_KEYWORDS.some(kw => haystack.includes(kw))
}

function personDisplayName(p: Record<string, unknown>): string {
  if (p.first_name) return `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`
  return (p.name as string) || 'Sem nome'
}

// ── Detecta afastados ────────────────────────────────────

type AbsentMember = {
  id:              string
  name:            string
  phone:           string | null
  days_absent:     number
  urgency:         string
  status:          string
  celula:          string | null
  church_rel:      string | null
  stage:           string | null
  observacoes:     string | null
  sensitive:       boolean
  last_sent_days:  number | null
  can_send:        boolean
}

async function detectAbsent(churchId: string): Promise<AbsentMember[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: people, error } = await supabase
    .from('people')
    .select(`
      id, name, first_name, last_name, phone,
      last_contact_at, last_attendance_at,
      reengagement_last_sent_at,
      church_relationship, person_stage,
      observacoes_pastorais, tags,
      celula_id,
      optout, deleted_at,
      groups!people_celula_id_fkey (name)
    `)
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .eq('optout', false)
    .lt('last_contact_at', sevenDaysAgo)
    .not('last_contact_at', 'is', null)
    .order('last_contact_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[agent-reengajamento] detectAbsent error:', error.message)
    return []
  }

  return (people ?? []).map((p: Record<string, unknown>) => {
    // Usa o mais recente entre last_contact_at e last_attendance_at
    const lastContact    = p.last_contact_at as string | null
    const lastAttendance = p.last_attendance_at as string | null
    const mostRecent     = (!lastAttendance || (lastContact && lastContact > lastAttendance))
      ? lastContact
      : lastAttendance

    const days      = daysSince(mostRecent) ?? 0
    const sensitive = isSensitive(p)
    const sentDays  = daysSince(p.reengagement_last_sent_at as string | null)
    const canSend   = sentDays === null || sentDays >= 7

    const groupData = p.groups as { name?: string } | null

    return {
      id:             p.id as string,
      name:           personDisplayName(p),
      phone:          p.phone as string | null,
      days_absent:    days,
      urgency:        urgencyLabel(days),
      status:         sensitive ? 'sensitive' : classifyAbsence(days),
      celula:         groupData?.name ?? null,
      church_rel:     p.church_relationship as string | null,
      stage:          p.person_stage as string | null,
      observacoes:    p.observacoes_pastorais as string | null,
      sensitive,
      last_sent_days: sentDays,
      can_send:       canSend,
    }
  })
}

// ── Marca mensagem enviada ─────────────────────────────────

async function markMessagesSent(memberIds: string[]): Promise<void> {
  if (!memberIds.length) return
  await supabase
    .from('people')
    .update({ reengagement_last_sent_at: new Date().toISOString() })
    .in('id', memberIds)
}

// ── System prompt ──────────────────────────────────────────

function buildSystemPrompt(
  churchName: string,
  absentMembers: AbsentMember[],
): string {
  const total      = absentMembers.length
  const sensitive  = absentMembers.filter(m => m.sensitive)
  const canSend    = absentMembers.filter(m => m.can_send && !m.sensitive)
  const onCooldown = absentMembers.filter(m => !m.can_send)

  const memberList = absentMembers.slice(0, 30).map(m => {
    const parts = [
      `- **${m.name}** | ${m.urgency}`,
      `  Célula: ${m.celula ?? 'sem célula'} | Vínculo: ${m.church_rel ?? '—'} | Etapa: ${m.stage ?? '—'}`,
      `  Telefone: ${m.phone ?? 'não cadastrado'}`,
      m.sensitive ? `  ⚠️ CASO SENSÍVEL — requer atenção pastoral direta` : '',
      !m.can_send && m.last_sent_days !== null
        ? `  ⏳ Mensagem enviada há ${m.last_sent_days} dias (aguardar ${7 - m.last_sent_days} dias)` : '',
      m.observacoes ? `  Obs: ${m.observacoes.slice(0, 120)}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')

  return `Você é o Agente de Reengajamento Pastoral do Ekthos CRM da igreja **${churchName}**.

Seu papel é ajudar o pastor e a equipe a:
1. Identificar membros afastados e entender a urgência de cada caso
2. Gerar mensagens personalizadas via WhatsApp para reconectar membros
3. Alertar sobre casos que precisam de atenção pastoral direta (sensíveis)
4. Respeitar a cadência de contato (máx. 1 mensagem por membro a cada 7 dias)

## SITUAÇÃO ATUAL — MEMBROS AFASTADOS

Total detectado: **${total} membros** sem contato há 7+ dias
- Podem receber mensagem agora: **${canSend.length}**
- Em cooldown (mensagem recente): **${onCooldown.length}**
- Casos sensíveis (atenção pastoral): **${sensitive.length}**

### Lista de afastados:
${memberList || 'Nenhum membro afastado detectado.'}

## COMO GERAR MENSAGENS

Quando o pastor pedir para gerar mensagens (ex: "gere mensagens para os afastados", "escreva para o João"):
- Crie mensagens calorosas, pastorais e personalizadas
- Mencione o nome da pessoa
- Adapte o tom à urgência: leve (saudade), médio (preocupação), crítico (visita/ligação)
- Para casos 🔴 CRÍTICO: sugira ligação ou visita em vez de WhatsApp
- Para casos ⚠️ SENSÍVEIS: NÃO gere mensagem — oriente o pastor a contatar pessoalmente
- Use linguagem acolhedora e não constrangedora — nunca mencione "afastamento" diretamente
- Máx. 3 parágrafos por mensagem
- Ao final de cada mensagem, informe o telefone cadastrado

## CADÊNCIA

Se uma mensagem foi gerada para um membro recentemente, informe ao pastor e sugira aguardar o prazo.

## TOM

Pastoral, acolhedor, direto. Evite jargões religiosos excessivos. Fale como um líder que se importa genuinamente.`
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

  // ── Body ────────────────────────────────────────────────
  let body: { message?: string; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const message = body.message?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  // ── Contexto da church ──────────────────────────────────
  const { data: churchRow } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()

  const churchName = churchRow?.name ?? 'sua igreja'

  // ── Detecta afastados (sempre atualizado) ───────────────
  const absentMembers = await detectAbsent(churchId)

  // ── Limpa histórico se solicitado ───────────────────────
  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', AGENT_SLUG)
  }

  // ── Histórico de conversa ───────────────────────────────
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

  // ── Streaming SSE ────────────────────────────────────────
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
          system:     buildSystemPrompt(churchName, absentMembers),
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

        const finalMsg   = await stream.finalMessage()
        inputTokens  = finalMsg.usage.input_tokens
        outputTokens = finalMsg.usage.output_tokens

        // Se o agente gerou mensagens, marca cadência nos membros
        const msgLower = message.toLowerCase()
        const askedToSend = [
          'gere', 'gera', 'escreva', 'escreve', 'crie', 'cria',
          'mensagem', 'mensagens', 'whatsapp', 'envie', 'enviar',
          'mande', 'manda', 'contate', 'contatar',
        ].some(kw => msgLower.includes(kw))

        if (askedToSend) {
          const idsToMark = absentMembers
            .filter(m => m.can_send && !m.sensitive)
            .map(m => m.id)
          await markMessagesSent(idsToMark)
        }

        // Salva resposta no histórico
        await supabase.from('agent_conversations').insert({
          church_id:   churchId,
          user_id:     user.id,
          agent_slug:  AGENT_SLUG,
          role:        'assistant',
          content:     assistantReply,
          tokens_used: outputTokens,
        })

        // Loga execução
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

        controller.enqueue(sseData({
          type:            'done',
          input_tokens:    inputTokens,
          output_tokens:   outputTokens,
          absent_count:    absentMembers.length,
          can_send_count:  absentMembers.filter(m => m.can_send && !m.sensitive).length,
          sensitive_count: absentMembers.filter(m => m.sensitive).length,
        }))
      } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? 'Erro interno'
        console.error('[agent-reengajamento] stream error:', msg)

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
