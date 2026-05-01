// ============================================================
// Shared: agent-tools.ts
// 6 tools/function calling para agentes premium pastorais
//
// SCHEMA REAL (confirmado diagnóstico Sprint 1 — 30/04/2026):
//   people: first_name + last_name (sem full_name), phone (texto livre),
//           person_stage (enum), pipeline_stage_id (uuid FK — nova),
//           observacoes_pastorais, last_attendance_at
//   event_occurrences: event_id → church_events, occurrence_date, start_datetime
//
// Cada tool retorna { ok: boolean, ...dados } ou { ok: false, error: string }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Definição das tools (passada para Anthropic messages API) ──

export const AGENT_TOOLS = [
  {
    name: 'read_person',
    description: 'Lê dados de uma pessoa da igreja por ID. Retorna nome completo, telefone, estágio atual, observações pastorais e data da última presença.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa em people.id'
        }
      },
      required: ['person_id']
    }
  },
  {
    name: 'update_pipeline_stage',
    description: 'Move uma pessoa para outro estágio do pipeline customizado da igreja. Requer o UUID do estágio (pipeline_stages.id), não o slug.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa'
        },
        stage_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID do pipeline_stage destino'
        },
        reason: {
          type: 'string',
          description: 'Motivo opcional da mudança de estágio (registrado em observacoes_pastorais)'
        }
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
        days_ahead: {
          type: 'number',
          description: 'Quantos dias à frente buscar (padrão: 7, máximo: 30)',
          default: 7
        }
      }
    }
  },
  {
    name: 'send_whatsapp',
    description: 'Enfileira uma mensagem WhatsApp para ser enviada pela pessoa especificada. O roteamento (Meta Cloud ou Z-API) é automático por agente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to_phone: {
          type: 'string',
          description: 'Número de telefone no formato usado pela pessoa (ex: 11999998888 ou +5511999998888)'
        },
        message: {
          type: 'string',
          description: 'Texto da mensagem a ser enviada'
        },
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa (opcional, para rastreabilidade)'
        }
      },
      required: ['to_phone', 'message']
    }
  },
  {
    name: 'read_volunteer_schedule',
    description: 'Lê a escala de voluntários para um evento específico ou de uma pessoa específica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID do event_occurrence (opcional — filtra por evento)'
        },
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa (opcional — filtra por voluntário)'
        }
      }
    }
  },
  {
    name: 'read_event_status',
    description: 'Lê o estado atual de uma ocorrência de evento: dados gerais, se foi cancelado, título e local customizados.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da event_occurrences.id'
        }
      },
      required: ['event_id']
    }
  },

  // ── Tools de Acolhimento (Sprint 2) ──────────────────────────────────────

  {
    name: 'create_acolhimento_journey',
    description: 'Cria a jornada de acolhimento pastoral de 90 dias para uma pessoa nova. ' +
                 'Deve ser chamada apenas uma vez por pessoa. Retorna erro se jornada já existe.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa em people.id'
        }
      },
      required: ['person_id']
    }
  },

  {
    name: 'read_acolhimento_journey',
    description: 'Lê o histórico completo da jornada de acolhimento de uma pessoa: ' +
                 'touchpoints enviados, respostas recebidas, observações pastorais e próximo agendamento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da pessoa em people.id'
        }
      },
      required: ['person_id']
    }
  },

  {
    name: 'update_acolhimento_journey',
    description: 'Avança o timer da jornada após um touchpoint enviado e registra observação pastoral. ' +
                 'Use "complete" para encerrar a jornada quando o membro estiver integrado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        journey_id: {
          type: 'string',
          format: 'uuid',
          description: 'UUID da acolhimento_journey.id'
        },
        next_touchpoint: {
          type: 'string',
          enum: ['D+3', 'D+7', 'D+14', 'D+30', 'D+60', 'D+90', 'complete'],
          description: 'Próximo ponto de contato. Use "complete" para encerrar a jornada.'
        },
        pastoral_note: {
          type: 'string',
          description: 'Observação pastoral opcional sobre este touchpoint (máx 500 chars)'
        },
        touchpoint_summary: {
          type: 'string',
          description: 'Resumo do que foi enviado/aconteceu neste touchpoint (para histórico)'
        }
      },
      required: ['journey_id', 'next_touchpoint']
    }
  }
]

// ── Execução das tools ─────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  churchId: string,
  agentSlug: string
): Promise<Record<string, unknown>> {
  switch (toolName) {
    // ── Tool 1: read_person ──────────────────────────────
    case 'read_person': {
      const { data, error } = await supabaseAdmin
        .from('people')
        .select(
          'id, first_name, last_name, phone, email, person_stage, pipeline_stage_id, ' +
          'observacoes_pastorais, last_attendance_at, created_at'
        )
        .eq('id', input.person_id as string)
        .eq('church_id', churchId)
        .maybeSingle()

      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'person_not_found' }

      return {
        ok: true,
        person: {
          ...data,
          // Expõe full_name calculado pra facilitar uso no prompt
          full_name: [data.first_name, data.last_name].filter(Boolean).join(' ')
        }
      }
    }

    // ── Tool 2: update_pipeline_stage ────────────────────
    case 'update_pipeline_stage': {
      const updates: Record<string, unknown> = {
        pipeline_stage_id: input.stage_id as string
      }

      // Appenda razão nas observações pastorais se fornecida
      if (input.reason) {
        const { data: person } = await supabaseAdmin
          .from('people')
          .select('observacoes_pastorais')
          .eq('id', input.person_id as string)
          .eq('church_id', churchId)
          .maybeSingle()

        const ts = new Date().toISOString().slice(0, 10)
        const prev = person?.observacoes_pastorais ?? ''
        updates.observacoes_pastorais = prev
          ? `${prev}\n[${ts}] ${input.reason}`
          : `[${ts}] ${input.reason}`
      }

      const { error } = await supabaseAdmin
        .from('people')
        .update(updates)
        .eq('id', input.person_id as string)
        .eq('church_id', churchId)

      return error ? { ok: false, error: error.message } : { ok: true }
    }

    // ── Tool 3: read_church_schedule ─────────────────────
    case 'read_church_schedule': {
      const daysAhead = Math.min(Number(input.days_ahead ?? 7), 30)
      const now = new Date()
      const until = new Date(now.getTime() + daysAhead * 86_400_000)

      const { data, error } = await supabaseAdmin
        .from('event_occurrences')
        .select(
          'id, occurrence_date, start_datetime, end_datetime, is_cancelled, ' +
          'override_title, override_location, ' +
          'church_events!event_id(title, event_type, location)'
        )
        .eq('church_id', churchId)
        .eq('is_cancelled', false)
        .gte('start_datetime', now.toISOString())
        .lte('start_datetime', until.toISOString())
        .order('start_datetime')
        .limit(20)

      if (error) return { ok: false, error: error.message }
      return { ok: true, events: data ?? [] }
    }

    // ── Tool 4: send_whatsapp ────────────────────────────
    case 'send_whatsapp': {
      // Delega para dispatch-message (enfileira — worker consome em Sprint 2+)
      try {
        const res = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-message`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              church_id: churchId,
              agent_slug: agentSlug,
              to_phone: input.to_phone,
              message: input.message,
              person_id: input.person_id ?? null
            })
          }
        )
        return await res.json()
      } catch (err) {
        return { ok: false, error: `dispatch_failed: ${err}` }
      }
    }

    // ── Tool 5: read_volunteer_schedule ─────────────────
    case 'read_volunteer_schedule': {
      // Sprint 1: placeholder — implementação completa em Sprint 4 (agent-operacao)
      return {
        ok: true,
        schedule: [],
        note: 'Implementação completa disponível a partir do Sprint 4 (módulo Volunteers Pro).'
      }
    }

    // ── Tool 6: read_event_status ────────────────────────
    case 'read_event_status': {
      const { data, error } = await supabaseAdmin
        .from('event_occurrences')
        .select(
          'id, occurrence_date, start_datetime, end_datetime, is_cancelled, ' +
          'cancel_reason, override_title, override_location, ' +
          'church_events!event_id(title, event_type, location, description)'
        )
        .eq('id', input.event_id as string)
        .eq('church_id', churchId)
        .maybeSingle()

      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'event_not_found' }

      return { ok: true, event: data }
    }

    // ── Tool 7: create_acolhimento_journey ──────────────
    case 'create_acolhimento_journey': {
      const { data: existing } = await supabaseAdmin
        .from('acolhimento_journey')
        .select('id, status, current_touchpoint')
        .eq('church_id', churchId)
        .eq('person_id', input.person_id as string)
        .maybeSingle()

      if (existing) {
        return {
          ok: false,
          error: 'journey_already_exists',
          journey_id: existing.id,
          status: existing.status,
          current_touchpoint: existing.current_touchpoint
        }
      }

      const { data, error } = await supabaseAdmin
        .from('acolhimento_journey')
        .insert({
          church_id:         churchId,
          person_id:         input.person_id as string,
          current_touchpoint: 'D+0',
          next_touchpoint_at: new Date().toISOString(),
          status:            'pending'
        })
        .select('id, current_touchpoint, next_touchpoint_at, status')
        .single()

      if (error) return { ok: false, error: error.message }
      return { ok: true, journey: data }
    }

    // ── Tool 8: read_acolhimento_journey ─────────────────
    case 'read_acolhimento_journey': {
      const { data, error } = await supabaseAdmin
        .from('acolhimento_journey')
        .select(
          'id, current_touchpoint, next_touchpoint_at, touchpoints_sent, ' +
          'responses_received, pastoral_notes, status, started_at, completed_at'
        )
        .eq('church_id', churchId)
        .eq('person_id', input.person_id as string)
        .maybeSingle()

      if (error) return { ok: false, error: error.message }
      if (!data) return { ok: false, error: 'journey_not_found' }
      return { ok: true, journey: data }
    }

    // ── Tool 9: update_acolhimento_journey ───────────────
    case 'update_acolhimento_journey': {
      const TOUCHPOINT_DAYS: Record<string, number> = {
        'D+3':  3,
        'D+7':  7,
        'D+14': 14,
        'D+30': 30,
        'D+60': 60,
        'D+90': 90,
      }

      const nextTp = input.next_touchpoint as string
      const isComplete = nextTp === 'complete'

      // Busca jornada atual para appender touchpoints_sent
      const { data: current } = await supabaseAdmin
        .from('acolhimento_journey')
        .select('touchpoints_sent, pastoral_notes, current_touchpoint')
        .eq('id', input.journey_id as string)
        .eq('church_id', churchId)
        .maybeSingle()

      if (!current) return { ok: false, error: 'journey_not_found' }

      const existingTouchpoints = (current.touchpoints_sent as unknown[]) ?? []
      const newTouchpointEntry = {
        touchpoint: current.current_touchpoint,
        sent_at:    new Date().toISOString(),
        summary:    (input.touchpoint_summary as string) ?? null,
      }

      const updatedTouchpoints = [...existingTouchpoints, newTouchpointEntry]

      // Appenda nota pastoral
      const prevNotes = current.pastoral_notes ?? ''
      const noteEntry = input.pastoral_note
        ? `[${new Date().toISOString().slice(0, 10)}] ${input.pastoral_note}`
        : null
      const updatedNotes = noteEntry
        ? (prevNotes ? `${prevNotes}\n${noteEntry}` : noteEntry)
        : prevNotes || null

      // Calcula próximo next_touchpoint_at
      const nextAt = isComplete
        ? null
        : new Date(Date.now() + TOUCHPOINT_DAYS[nextTp] * 86_400_000).toISOString()

      const updates: Record<string, unknown> = {
        touchpoints_sent: updatedTouchpoints,
        pastoral_notes:   updatedNotes,
        status:           isComplete ? 'completed' : 'pending',
      }
      if (!isComplete && nextAt) {
        updates.current_touchpoint = nextTp
        updates.next_touchpoint_at = nextAt
      }
      if (isComplete) {
        updates.completed_at = new Date().toISOString()
      }

      const { error } = await supabaseAdmin
        .from('acolhimento_journey')
        .update(updates)
        .eq('id', input.journey_id as string)
        .eq('church_id', churchId)

      if (error) return { ok: false, error: error.message }
      return {
        ok: true,
        next_touchpoint: isComplete ? 'complete' : nextTp,
        next_touchpoint_at: nextAt,
        status: isComplete ? 'completed' : 'pending'
      }
    }

    default:
      return { ok: false, error: `unknown_tool: ${toolName}` }
  }
}
