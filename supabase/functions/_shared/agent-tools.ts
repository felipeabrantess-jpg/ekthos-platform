// ============================================================
// _shared/agent-tools.ts  v2 — Sprint 3B
//
// MUDANÇAS v2:
//   + enqueue_message: nova tool que substitui send_whatsapp no pipeline real.
//     INSERT direto em conversation_messages + channel_dispatch_queue.
//     Suporta conversation_id OU person_id (resolve/cria conversa automaticamente).
//   ~ send_whatsapp: mantida para compatibilidade com agentes ainda não migrados.
//   ~ checkAntiSpam: lê conversation_messages (não agent_pending_messages).
//     Exportada para uso direto em agent-acolhimento.
//
// BUG FIX (02/05/2026):
//   channel_dispatch_queue INSERT agora inclui conversation_id e church_id
//   (NOT NULL constraints exigem ambos os campos).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Anti-spam (v2) ───────────────────────────────────────────

export async function checkAntiSpam(
  churchId:       string,
  personId:       string,
  churchTimezone: string,
  silenceStartH = 21,
  silenceEndH   = 8,
  maxPerDay     = 1,
  maxPerWeek    = 3,
): Promise<{ allowed: boolean; reason?: string; delay_until?: string }> {

  const now = new Date()
  const localHour = parseInt(
    now.toLocaleString('en-US', {
      hour: 'numeric', hour12: false,
      timeZone: churchTimezone || 'America/Sao_Paulo',
    })
  )
  if (localHour >= silenceStartH || localHour < silenceEndH) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(silenceEndH, 0, 0, 0)
    return { allowed: false, reason: 'silence_window', delay_until: tomorrow.toISOString() }
  }

  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('church_id', churchId)
    .eq('person_id', personId)

  const convIds = (convs ?? []).map(c => c.id as string)
  if (convIds.length === 0) return { allowed: true }

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const { count: msgsToday } = await supabaseAdmin
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', convIds)
    .eq('direction', 'outbound')
    .eq('sender_type', 'agent')
    .neq('status', 'failed')
    .gte('created_at', todayStart.toISOString())

  if ((msgsToday ?? 0) >= maxPerDay) {
    return { allowed: false, reason: 'daily_limit_reached' }
  }

  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)

  const { count: msgsWeek } = await supabaseAdmin
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', convIds)
    .eq('direction', 'outbound')
    .eq('sender_type', 'agent')
    .neq('status', 'failed')
    .gte('created_at', weekStart.toISOString())

  if ((msgsWeek ?? 0) >= maxPerWeek) {
    return { allowed: false, reason: 'weekly_limit_reached' }
  }

  return { allowed: true }
}

// ── Definição das tools ────────────────────────────────────

export const AGENT_TOOLS = [
  {
    name: 'read_person',
    description: 'Lê dados de uma pessoa da igreja por ID. Retorna nome completo, telefone, estágio atual, observações pastorais e data da última presença.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa em people.id' }
      },
      required: ['person_id']
    }
  },
  {
    name: 'update_pipeline_stage',
    description: 'Move uma pessoa para outro estágio do pipeline customizado da igreja.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa' },
        stage_id:  { type: 'string', format: 'uuid', description: 'UUID do pipeline_stage destino' },
        reason:    { type: 'string', description: 'Motivo opcional da mudança de estágio' }
      },
      required: ['person_id', 'stage_id']
    }
  },
  {
    name: 'read_church_schedule',
    description: 'Lê a agenda da igreja com os próximos eventos e ocorrências programadas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: { type: 'number', description: 'Quantos dias à frente buscar (padrão: 7, máximo: 30)', default: 7 }
      }
    }
  },
  {
    name: 'read_event_status',
    description: 'Lê o estado atual de uma ocorrência de evento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: { type: 'string', format: 'uuid', description: 'UUID da event_occurrences.id' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'read_volunteer_schedule',
    description: 'Lê a escala de voluntários para um evento ou pessoa.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id:  { type: 'string', format: 'uuid', description: 'UUID do event_occurrence (opcional)' },
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa (opcional)' }
      }
    }
  },
  {
    name: 'enqueue_message',
    description:
      'Registra uma mensagem do agente na conversa (conversation_messages) e a enfileira para ' +
      'entrega via WhatsApp (channel_dispatch_queue). Use sempre este tool para enviar mensagens. ' +
      'Forneça conversation_id quando conhecido; caso contrário forneça person_id.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message:         { type: 'string', description: 'Texto da mensagem a ser enviada' },
        conversation_id: { type: 'string', format: 'uuid', description: 'UUID da conversa (preferido quando disponível)' },
        person_id:       { type: 'string', format: 'uuid', description: 'UUID da pessoa — localiza/cria conversa automaticamente' }
      },
      required: ['message']
    }
  },
  {
    name: 'send_whatsapp',
    description: '[LEGADO — use enqueue_message] Enfileira via dispatch-message EF.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to_phone:  { type: 'string', description: 'Número de telefone' },
        message:   { type: 'string', description: 'Texto da mensagem' },
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa (opcional)' }
      },
      required: ['to_phone', 'message']
    }
  },
  {
    name: 'create_acolhimento_journey',
    description: 'Cria a jornada de acolhimento pastoral de 90 dias para uma pessoa nova.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa em people.id' }
      },
      required: ['person_id']
    }
  },
  {
    name: 'read_acolhimento_journey',
    description: 'Lê o histórico completo da jornada de acolhimento de uma pessoa.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', format: 'uuid', description: 'UUID da pessoa em people.id' }
      },
      required: ['person_id']
    }
  },
  {
    name: 'update_acolhimento_journey',
    description: 'Avança o timer da jornada após um touchpoint enviado. Use "complete" para encerrar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        journey_id:        { type: 'string', format: 'uuid', description: 'UUID da acolhimento_journey.id' },
        next_touchpoint:   { type: 'string', enum: ['D+3','D+7','D+14','D+30','D+60','D+90','complete'], description: 'Próximo touchpoint.' },
        pastoral_note:     { type: 'string', description: 'Observação pastoral opcional (máx 500 chars)' },
        touchpoint_summary:{ type: 'string', description: 'Resumo do que aconteceu neste touchpoint' }
      },
      required: ['journey_id', 'next_touchpoint']
    }
  }
]

// ── Execução das tools ─────────────────────────────────────

export async function executeTool(
  toolName:  string,
  input:     Record<string, unknown>,
  churchId:  string,
  agentSlug: string
): Promise<Record<string, unknown>> {
  switch (toolName) {

    case 'read_person': {
      const { data, error } = await supabaseAdmin
        .from('people')
        .select('id, first_name, last_name, phone, email, person_stage, pipeline_stage_id, observacoes_pastorais, last_attendance_at, created_at')
        .eq('id', input.person_id as string)
        .eq('church_id', churchId)
        .maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (!data)  return { ok: false, error: 'person_not_found' }
      return { ok: true, person: { ...data, full_name: [data.first_name, data.last_name].filter(Boolean).join(' ') } }
    }

    case 'update_pipeline_stage': {
      const updates: Record<string, unknown> = { pipeline_stage_id: input.stage_id }
      if (input.reason) {
        const { data: person } = await supabaseAdmin.from('people').select('observacoes_pastorais').eq('id', input.person_id as string).eq('church_id', churchId).maybeSingle()
        const ts = new Date().toISOString().slice(0, 10)
        const prev = person?.observacoes_pastorais ?? ''
        updates.observacoes_pastorais = prev ? `${prev}\n[${ts}] ${input.reason}` : `[${ts}] ${input.reason}`
      }
      const { error } = await supabaseAdmin.from('people').update(updates).eq('id', input.person_id as string).eq('church_id', churchId)
      return error ? { ok: false, error: error.message } : { ok: true }
    }

    case 'read_church_schedule': {
      const daysAhead = Math.min(Number(input.days_ahead ?? 7), 30)
      const now = new Date(), until = new Date(now.getTime() + daysAhead * 86_400_000)
      const { data, error } = await supabaseAdmin.from('event_occurrences')
        .select('id, occurrence_date, start_datetime, end_datetime, is_cancelled, override_title, override_location, church_events!event_id(title, event_type, location)')
        .eq('church_id', churchId).eq('is_cancelled', false)
        .gte('start_datetime', now.toISOString()).lte('start_datetime', until.toISOString())
        .order('start_datetime').limit(20)
      if (error) return { ok: false, error: error.message }
      return { ok: true, events: data ?? [] }
    }

    case 'read_event_status': {
      const { data, error } = await supabaseAdmin.from('event_occurrences')
        .select('id, occurrence_date, start_datetime, end_datetime, is_cancelled, cancel_reason, override_title, override_location, church_events!event_id(title, event_type, location, description)')
        .eq('id', input.event_id as string).eq('church_id', churchId).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (!data)  return { ok: false, error: 'event_not_found' }
      return { ok: true, event: data }
    }

    case 'read_volunteer_schedule':
      return { ok: true, schedule: [], note: 'Implementação completa disponível a partir do Sprint 4.' }

    case 'enqueue_message': {
      const message = (input.message as string).trim()
      if (!message) return { ok: false, error: 'message_empty' }

      let convId = (input.conversation_id as string | undefined) ?? undefined

      if (!convId) {
        const personId = input.person_id as string | undefined
        if (!personId) return { ok: false, error: 'Forneça conversation_id ou person_id' }

        const { data: person } = await supabaseAdmin.from('people').select('phone').eq('id', personId).eq('church_id', churchId).maybeSingle()
        if (!person?.phone) return { ok: false, error: 'person_phone_not_found' }
        const phone = person.phone.replace(/\D/g, '')

        const { data: routing } = await supabaseAdmin.from('church_agent_channel_routing').select('context_type').eq('church_id', churchId).eq('agent_slug', agentSlug).maybeSingle()
        let contextType = routing?.context_type
        if (!contextType) {
          const { data: global } = await supabaseAdmin.from('agent_channel_routing').select('context_type').eq('agent_slug', agentSlug).maybeSingle()
          contextType = global?.context_type ?? 'pastoral'
        }

        const { data: channel } = await supabaseAdmin.from('church_whatsapp_channels').select('id').eq('church_id', churchId).eq('context_type', contextType).in('session_status', ['testing', 'active']).eq('active', true).limit(1).maybeSingle()
        if (!channel) return { ok: false, error: `no_active_channel_for_context:${contextType}` }

        const { data: conv, error: convErr } = await supabaseAdmin.from('conversations')
          .upsert({ church_id: churchId, channel_id: channel.id, contact_phone: phone, person_id: personId, status: 'open', ownership: 'agent', agent_slug: agentSlug, channel_type: 'whatsapp', last_message_at: new Date().toISOString(), last_message_preview: message.slice(0, 120) }, { onConflict: 'church_id,channel_id,contact_phone', ignoreDuplicates: false })
          .select('id').single()
        if (convErr || !conv) return { ok: false, error: convErr?.message ?? 'upsert_conversation_failed' }
        convId = conv.id
      }

      const { data: conv, error: convLookupErr } = await supabaseAdmin.from('conversations').select('channel_id, contact_phone, ownership').eq('id', convId).maybeSingle()
      if (convLookupErr || !conv) return { ok: false, error: 'conversation_not_found' }
      if (conv.ownership === 'human') return { ok: false, error: 'conversation_owned_by_human — agente não pode enviar' }

      const { data: msg, error: msgErr } = await supabaseAdmin.from('conversation_messages')
        .insert({ conversation_id: convId, church_id: churchId, direction: 'outbound', sender_type: 'agent', sender_id: agentSlug, content: message, content_type: 'text', status: 'pending' })
        .select('id').single()
      if (msgErr || !msg) return { ok: false, error: msgErr?.message ?? 'insert_message_failed' }

      // FIX: conversation_id e church_id são NOT NULL na channel_dispatch_queue
      const { error: qErr } = await supabaseAdmin.from('channel_dispatch_queue')
        .insert({
          conversation_id: convId,
          message_id:      msg.id,
          church_id:       churchId,
          channel_id:      conv.channel_id,
          to_phone:        conv.contact_phone,
          content:         message,
          status:          'pending',
          scheduled_at:    new Date().toISOString(),
        })
      if (qErr) {
        await supabaseAdmin.from('conversation_messages').update({ status: 'failed', error_detail: qErr.message }).eq('id', msg.id)
        return { ok: false, error: `enqueue_failed: ${qErr.message}` }
      }

      await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: message.slice(0, 120) }).eq('id', convId)

      const { error: evtErr } = await supabaseAdmin.from('conversation_events').insert({ conversation_id: convId, church_id: churchId, event_type: 'message_outbound_agent', actor_type: 'agent', actor_id: agentSlug, actor_name: agentSlug, message_preview: message.slice(0, 80) })
      if (evtErr) console.warn('[agent-tools] conversation_events insert falhou:', evtErr.message)

      console.log(`[agent-tools] enqueue_message: conv=${convId} msg=${msg.id}`)
      return { ok: true, message_id: msg.id, conversation_id: convId }
    }

    case 'send_whatsapp': {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-message`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ church_id: churchId, agent_slug: agentSlug, to_phone: input.to_phone, message: input.message, person_id: input.person_id ?? null })
        })
        return await res.json()
      } catch (err) { return { ok: false, error: `dispatch_failed: ${err}` } }
    }

    case 'create_acolhimento_journey': {
      const { data: existing } = await supabaseAdmin.from('acolhimento_journey').select('id, status, current_touchpoint').eq('church_id', churchId).eq('person_id', input.person_id as string).maybeSingle()
      if (existing) return { ok: false, error: 'journey_already_exists', journey_id: existing.id, status: existing.status, current_touchpoint: existing.current_touchpoint }
      const { data, error } = await supabaseAdmin.from('acolhimento_journey').insert({ church_id: churchId, person_id: input.person_id as string, current_touchpoint: 'D+0', next_touchpoint_at: new Date().toISOString(), status: 'pending' }).select('id, current_touchpoint, next_touchpoint_at, status').single()
      if (error) return { ok: false, error: error.message }
      return { ok: true, journey: data }
    }

    case 'read_acolhimento_journey': {
      const { data, error } = await supabaseAdmin.from('acolhimento_journey').select('id, current_touchpoint, next_touchpoint_at, touchpoints_sent, responses_received, pastoral_notes, status, started_at, completed_at').eq('church_id', churchId).eq('person_id', input.person_id as string).maybeSingle()
      if (error) return { ok: false, error: error.message }
      if (!data)  return { ok: false, error: 'journey_not_found' }
      return { ok: true, journey: data }
    }

    case 'update_acolhimento_journey': {
      const TOUCHPOINT_DAYS: Record<string, number> = { 'D+3': 3, 'D+7': 7, 'D+14': 14, 'D+30': 30, 'D+60': 60, 'D+90': 90 }
      const nextTp = input.next_touchpoint as string, isComplete = nextTp === 'complete'
      const { data: current } = await supabaseAdmin.from('acolhimento_journey').select('touchpoints_sent, pastoral_notes, current_touchpoint').eq('id', input.journey_id as string).eq('church_id', churchId).maybeSingle()
      if (!current) return { ok: false, error: 'journey_not_found' }
      const updatedTouchpoints = [...((current.touchpoints_sent as unknown[]) ?? []), { touchpoint: current.current_touchpoint, sent_at: new Date().toISOString(), summary: (input.touchpoint_summary as string) ?? null }]
      const prevNotes = current.pastoral_notes ?? ''
      const noteEntry = input.pastoral_note ? `[${new Date().toISOString().slice(0,10)}] ${input.pastoral_note}` : null
      const updatedNotes = noteEntry ? (prevNotes ? `${prevNotes}\n${noteEntry}` : noteEntry) : prevNotes || null
      const nextAt = isComplete ? null : new Date(Date.now() + TOUCHPOINT_DAYS[nextTp] * 86_400_000).toISOString()
      const updates: Record<string, unknown> = { touchpoints_sent: updatedTouchpoints, pastoral_notes: updatedNotes, status: isComplete ? 'completed' : 'pending' }
      if (!isComplete && nextAt) { updates.current_touchpoint = nextTp; updates.next_touchpoint_at = nextAt }
      if (isComplete) updates.completed_at = new Date().toISOString()
      const { error } = await supabaseAdmin.from('acolhimento_journey').update(updates).eq('id', input.journey_id as string).eq('church_id', churchId)
      if (error) return { ok: false, error: error.message }
      return { ok: true, next_touchpoint: isComplete ? 'complete' : nextTp, next_touchpoint_at: nextAt, status: isComplete ? 'completed' : 'pending' }
    }

    default:
      return { ok: false, error: `unknown_tool: ${toolName}` }
  }
}
