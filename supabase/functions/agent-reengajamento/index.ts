// ============================================================
// Edge Function: agent-reengajamento  v17
//
// MUDANÇAS v17 (PASSO 6 — conecta config real da igreja):
//   - Modo reengagement_scan: chama get_agent_prompt_resolved antes de gerar mensagem
//     Fallback hardcoded se RPC indisponível (zero breaking change)
//   - Modo chat_sse: prefixo resolved_prompt antes de buildSystemPrompt
//     Fallback hardcoded se RPC indisponível
//   - Template agent-reengajamento inserido em agent_prompt_templates (pré-requisito)
//
// MUDANÇAS v16: adiciona trigger_type='reengagement_scan'
//   - Modo interno chamado pelo cron reengajamento_scan_disparar()
//   - Sem JWT — body: { trigger_type, church_id, person_id, touchpoint }
//   - Gera mensagem Haiku → enfileira channel_dispatch_queue
//   - Registra reengagement_journey + reengagement_last_sent_at
//   - Loga agent_executions trigger_type='reengagement_scan'
//
// MODO CHAT SSE (v15 intocado):
//   - Requer JWT usuário
//   - SSE stream com histórico de conversa
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
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const AGENT_SLUG    = 'agent-reengajamento'
const MODEL         = 'claude-haiku-4-5-20251001'
const MAX_TOKENS    = 2048
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

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
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

// ── Detecta afastados (modo SSE) ────────────────────────────

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
    const lastContact    = p.last_contact_at as string | null
    const lastAttendance = p.last_attendance_at as string | null
    const mostRecent     = (!lastAttendance || (lastContact && lastContact > lastAttendance))
      ? lastContact : lastAttendance

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

async function markMessagesSent(memberIds: string[]): Promise<void> {
  if (!memberIds.length) return
  await supabase
    .from('people')
    .update({ reengagement_last_sent_at: new Date().toISOString() })
    .in('id', memberIds)
}

function buildSystemPrompt(churchName: string, absentMembers: AbsentMember[]): string {
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

## TOM

Pastoral, acolhedor, direto. Evite jargões religiosos excessivos. Fale como um líder que se importa genuinamente.`
}

// ── MODO SCAN (v16) ────────────────────────────────────────
// Chamado internamente pelo cron reengajamento_scan_disparar()
// Não requer JWT do usuário — autenticação via origin interna

async function handleReengajamentoScan(body: Record<string, unknown>): Promise<Response> {
  const churchId   = body.church_id  as string | undefined
  const personId   = body.person_id  as string | undefined
  const touchpoint = (body.touchpoint as string | undefined) ?? 'semana_2'

  if (!churchId || !personId) {
    return jsonOk({ ok: false, error: 'church_id e person_id obrigatórios' }, 400)
  }

  const t0 = Date.now()

  try {
    // 1. Dados da pessoa
    const { data: person } = await supabase
      .from('people')
      .select('id, name, first_name, last_name, phone, optout, deleted_at, observacoes_pastorais, tags')
      .eq('id', personId)
      .eq('church_id', churchId)
      .maybeSingle()

    if (!person)               return jsonOk({ ok: false, error: 'person_not_found' })
    if (person.optout)         return jsonOk({ ok: true, result: 'skipped_optout' })
    if (person.deleted_at)     return jsonOk({ ok: true, result: 'skipped_deleted' })
    if (!person.phone)         return jsonOk({ ok: false, error: 'person_phone_not_found' })
    if (isSensitive(person as Record<string, unknown>)) {
      return jsonOk({ ok: true, result: 'skipped_sensitive_case' })
    }

    const personName = person.first_name
      ? `${person.first_name}${person.last_name ? ' ' + person.last_name : ''}`
      : (person.name ?? 'Membro')

    // 2. Nome da church
    const { data: church } = await supabase
      .from('churches')
      .select('name')
      .eq('id', churchId)
      .maybeSingle()
    const churchName = church?.name ?? 'sua Igreja'

    // 3. Resolve prompt via configuração real da igreja (v17 / PASSO 6)
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('get_agent_prompt_resolved', {
        p_church_id:  churchId,
        p_agent_slug: AGENT_SLUG,
      })
      .maybeSingle()
    if (rpcErr) console.warn('[agent-reengajamento] scan: prompt fallback:', rpcErr.message)

    const systemPrompt = rpcData && !rpcErr
      ? `${rpcData.resolved_prompt}\n\nPessoa alvo: ${personName}. Touchpoint: ${touchpoint}. Escreva UMA mensagem curta e calorosa de WhatsApp. Não mencione "afastamento", "ausência" nem que você é IA. Máximo 3 parágrafos. Responda APENAS com o texto da mensagem, sem explicação adicional.`
      : `Você é o Agente de Reengajamento Pastoral da ${churchName}. Escreva UMA mensagem curta e calorosa de WhatsApp para reconectar com ${personName}, que está afastado da comunidade. Não mencione "afastamento" nem "ausência" nem que você é um agente de IA. Seja genuíno, pastoral e acolhedor. Máximo 3 parágrafos. Responda apenas com o texto da mensagem.`

    // 4. Gera mensagem com Haiku
    const aiResponse = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{
        role:    'user',
        content: `Escreva a mensagem pastoral de reengajamento para ${personName} (touchpoint: ${touchpoint}).`,
      }],
    })

    const textBlock  = aiResponse.content.find(b => b.type === 'text')
    const msgText    = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text.trim() : ''
    if (!msgText)    return jsonOk({ ok: false, error: 'haiku_empty_response' })

    // 5. Enfileira mensagem no canal WhatsApp
    const phone = person.phone.replace(/\D/g, '')

    // Descobre context_type do agente
    const { data: routing } = await supabase
      .from('church_agent_channel_routing')
      .select('context_type')
      .eq('church_id', churchId)
      .eq('agent_slug', AGENT_SLUG)
      .maybeSingle()

    let contextType = routing?.context_type
    if (!contextType) {
      const { data: globalRouting } = await supabase
        .from('agent_channel_routing')
        .select('context_type')
        .eq('agent_slug', AGENT_SLUG)
        .maybeSingle()
      contextType = globalRouting?.context_type ?? 'pastoral'
    }

    // Canal ativo
    const { data: channel } = await supabase
      .from('church_whatsapp_channels')
      .select('id')
      .eq('church_id', churchId)
      .eq('context_type', contextType)
      .in('session_status', ['testing', 'active'])
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (!channel) {
      console.warn(`[agent-reengajamento] scan: no active channel church=${churchId} context=${contextType}`)
      return jsonOk({ ok: false, error: `no_active_channel:${contextType}` })
    }

    // Upsert conversa
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .upsert({
        church_id:            churchId,
        channel_id:           channel.id,
        contact_phone:        phone,
        person_id:            personId,
        status:               'open',
        ownership:            'agent',
        agent_slug:           AGENT_SLUG,
        channel_type:         'whatsapp',
        last_message_at:      new Date().toISOString(),
        last_message_preview: msgText.slice(0, 120),
      }, { onConflict: 'church_id,channel_id,contact_phone', ignoreDuplicates: false })
      .select('id')
      .single()

    if (convErr || !conv) {
      return jsonOk({ ok: false, error: convErr?.message ?? 'upsert_conversation_failed' })
    }

    // Insert conversation_messages
    const { data: msg, error: msgErr } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conv.id,
        church_id:       churchId,
        direction:       'outbound',
        sender_type:     'agent',
        sender_id:       AGENT_SLUG,
        content:         msgText,
        content_type:    'text',
        status:          'pending',
      })
      .select('id')
      .single()

    if (msgErr || !msg) {
      return jsonOk({ ok: false, error: msgErr?.message ?? 'insert_message_failed' })
    }

    // Insert channel_dispatch_queue
    const { error: qErr } = await supabase
      .from('channel_dispatch_queue')
      .insert({
        message_id:      msg.id,
        conversation_id: conv.id,
        church_id:       churchId,
        channel_id:      channel.id,
        to_phone:        phone,
        content:         msgText,
        status:          'pending',
        scheduled_at:    new Date().toISOString(),
      })

    if (qErr) {
      await supabase.from('conversation_messages')
        .update({ status: 'failed' })
        .eq('id', msg.id)
      return jsonOk({ ok: false, error: `queue_failed: ${qErr.message}` })
    }

    // 6. Upsert reengagement_journey
    const { data: existingJourney } = await supabase
      .from('reengagement_journey')
      .select('id, touchpoints_sent')
      .eq('church_id', churchId)
      .eq('person_id', personId)
      .in('status', ['pending', 'processing'])
      .maybeSingle()

    const nextAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    if (existingJourney) {
      const prev = Array.isArray(existingJourney.touchpoints_sent)
        ? (existingJourney.touchpoints_sent as string[])
        : []
      await supabase.from('reengagement_journey').update({
        current_touchpoint: touchpoint,
        touchpoints_sent:   [...prev, touchpoint],
        next_touchpoint_at: nextAt,
      }).eq('id', existingJourney.id)
    } else {
      await supabase.from('reengagement_journey').insert({
        church_id:          churchId,
        person_id:          personId,
        current_touchpoint: touchpoint,
        touchpoints_sent:   [touchpoint],
        status:             'processing',
        started_at:         new Date().toISOString(),
        next_touchpoint_at: nextAt,
      } as any)
    }

    // 7. Atualiza reengagement_last_sent_at na pessoa
    await supabase.from('people').update({
      reengagement_last_sent_at: new Date().toISOString(),
      reengagement_status:       'active',
    }).eq('id', personId).eq('church_id', churchId)

    // 8. Log agent_executions
    await supabase.from('agent_executions').insert({
      church_id:     churchId,
      agent_slug:    AGENT_SLUG,
      model:         MODEL,
      trigger_type:  'reengagement_scan',
      status:        'success',
      success:       true,
      duration_ms:   Date.now() - t0,
      input_tokens:  aiResponse.usage.input_tokens,
      output_tokens: aiResponse.usage.output_tokens,
    })

    console.log(`[agent-reengajamento] scan ok church=${churchId} person=${personId} touchpoint=${touchpoint} ms=${Date.now()-t0}`)
    return jsonOk({ ok: true, message_sent: true, touchpoint, conv_id: conv.id })

  } catch (err: unknown) {
    const errMsg = (err as { message?: string }).message ?? String(err)
    console.error('[agent-reengajamento] scan error:', errMsg)

    await supabase.from('agent_executions').insert({
      church_id:    churchId!,
      agent_slug:   AGENT_SLUG,
      model:        MODEL,
      trigger_type: 'reengagement_scan',
      status:       'error',
      success:      false,
      duration_ms:  Date.now() - t0,
      error:        errMsg,
    }).catch(() => {})

    return jsonOk({ ok: false, error: errMsg }, 500)
  }
}

// ── Handler principal ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return jsonErr('Method Not Allowed', 405)

  // Parse body antes de qualquer auth check (v16)
  let body: Record<string, unknown>
  try   { body = await req.json() }
  catch { return jsonErr('Body inválido', 400) }

  const triggerType = (body.trigger_type as string | undefined) ?? 'chat_sse'

  // ── MODO SCAN (v16 — sem JWT, chamado pelo cron) ──────────
  if (triggerType === 'reengagement_scan') {
    return handleReengajamentoScan(body)
  }

  // ── MODO CHAT SSE (requer JWT usuário) ────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return jsonErr('Unauthorized', 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  // CLAUDE.md regra #13: church_id APENAS de app_metadata — nunca user_metadata
  const churchId =
    (user.app_metadata?.church_id as string | undefined) ?? null

  if (!churchId) return jsonErr('church_id não encontrado no token', 400)

  const message = (body.message as string | undefined)?.trim() ?? ''
  if (!message) return jsonErr('message é obrigatório', 400)

  const { data: churchRow } = await supabase
    .from('churches')
    .select('name')
    .eq('id', churchId)
    .maybeSingle()

  const churchName = churchRow?.name ?? 'sua igreja'

  // PASSO 6 (v17) — Resolve prompt via configuração real da igreja
  const { data: rpcPrompt, error: rpcPromptErr } = await supabase
    .rpc('get_agent_prompt_resolved', {
      p_church_id:  churchId,
      p_agent_slug: AGENT_SLUG,
    })
    .maybeSingle()
  if (rpcPromptErr) console.warn('[agent-reengajamento] chat: prompt fallback:', rpcPromptErr.message)

  const absentMembers = await detectAbsent(churchId)

  if (body.clear_history) {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('agent_slug', AGENT_SLUG)
  }

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

  await supabase.from('agent_conversations').insert({
    church_id:  churchId,
    user_id:    user.id,
    agent_slug: AGENT_SLUG,
    role:       'user',
    content:    message,
  })

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
          system:     rpcPrompt && !rpcPromptErr
            ? `${rpcPrompt.resolved_prompt}\n\n${buildSystemPrompt(churchName, absentMembers)}`
            : buildSystemPrompt(churchName, absentMembers),
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
          trigger_type:  'chat_sse',
          status:        'success',
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
          trigger_type:  'chat_sse',
          status:        'error',
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
