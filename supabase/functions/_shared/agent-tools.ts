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

    default:
      return { ok: false, error: `unknown_tool: ${toolName}` }
  }
}
