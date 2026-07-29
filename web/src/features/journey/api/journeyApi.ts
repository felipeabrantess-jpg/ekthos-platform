// Camada de acesso às RPCs da espinha person_journey
// Fase 1 — preparada, não conectada a nenhuma tela.
// Todas as operações passam pelo lock otimista (expectedVersion).

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PersonJourney,
  JourneyEvent,
  JourneyAdvanceParams,
  JourneyAssignParams,
  JourneyRegisterTouchParams,
  JourneyTransferParams,
  JourneyUpdateNextStepParams,
  JourneyCloseParams,
} from '../types/journey'
import { JourneyVersionConflictError } from '../types/journey'

// SQLSTATE retornado pelas RPCs em conflito de versão
const CONFLICT_MESSAGE = 'JOURNEY_VERSION_CONFLICT'

function isVersionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const msg = (error as { message?: string }).message ?? ''
  return msg.includes(CONFLICT_MESSAGE)
}

export function createJourneyApi(supabase: SupabaseClient) {
  return {
    // ── Leituras ────────────────────────────────────────────

    async getActiveJourney(churchId: string, personId: string): Promise<PersonJourney | null> {
      const { data, error } = await supabase
        .from('person_journey')
        .select('*')
        .eq('church_id', churchId)
        .eq('person_id', personId)
        .is('closed_at', null)
        .maybeSingle()

      if (error) throw error
      return data
    },

    async getJourneyEvents(journeyId: string): Promise<JourneyEvent[]> {
      const { data, error } = await supabase
        .from('journey_events')
        .select('*')
        .eq('journey_id', journeyId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },

    // ── Mutações via RPC ─────────────────────────────────────

    async advance(params: JourneyAdvanceParams): Promise<PersonJourney> {
      const { data, error } = await supabase.rpc('journey_advance', {
        p_journey_id:       params.journeyId,
        p_expected_version: params.expectedVersion,
        p_new_stage_id:     params.newStageId,
        p_actor_id:         params.actorId,
        p_note:             params.note ?? null,
      })

      if (error) {
        if (isVersionConflict(error)) {
          throw new JourneyVersionConflictError(params.journeyId, params.expectedVersion)
        }
        throw error
      }
      return data as PersonJourney
    },

    async assign(params: JourneyAssignParams): Promise<PersonJourney> {
      const { data, error } = await supabase.rpc('journey_assign', {
        p_journey_id:       params.journeyId,
        p_expected_version: params.expectedVersion,
        p_owner_id:         params.ownerId,
        p_actor_id:         params.actorId,
      })

      if (error) {
        if (isVersionConflict(error)) {
          throw new JourneyVersionConflictError(params.journeyId, params.expectedVersion)
        }
        throw error
      }
      return data as PersonJourney
    },

    async registerTouch(params: JourneyRegisterTouchParams): Promise<JourneyEvent> {
      const { data, error } = await supabase.rpc('journey_register_touch', {
        p_journey_id: params.journeyId,
        p_touch_type: params.touchType,
        p_actor_id:   params.actorId,
        p_payload:    params.payload ?? {},
      })

      if (error) throw error
      return data as JourneyEvent
    },

    async transfer(params: JourneyTransferParams): Promise<PersonJourney> {
      const { data, error } = await supabase.rpc('journey_transfer', {
        p_journey_id:       params.journeyId,
        p_expected_version: params.expectedVersion,
        p_new_owner_id:     params.newOwnerId,
        p_new_ministry_id:  params.newMinistryId ?? null,
        p_actor_id:         params.actorId ?? null,
        p_note:             params.note ?? null,
      })

      if (error) {
        if (isVersionConflict(error)) {
          throw new JourneyVersionConflictError(params.journeyId, params.expectedVersion)
        }
        throw error
      }
      return data as PersonJourney
    },

    async updateNextStep(params: JourneyUpdateNextStepParams): Promise<PersonJourney> {
      const { data, error } = await supabase.rpc('journey_update_next_step', {
        p_journey_id:       params.journeyId,
        p_expected_version: params.expectedVersion,
        p_next_step:        params.nextStep,
        p_due_date:         params.dueDate ?? null,
        p_actor_id:         params.actorId ?? null,
      })

      if (error) {
        if (isVersionConflict(error)) {
          throw new JourneyVersionConflictError(params.journeyId, params.expectedVersion)
        }
        throw error
      }
      return data as PersonJourney
    },

    async close(params: JourneyCloseParams): Promise<PersonJourney> {
      const { data, error } = await supabase.rpc('journey_close', {
        p_journey_id:       params.journeyId,
        p_expected_version: params.expectedVersion,
        p_outcome:          params.outcome,
        p_actor_id:         params.actorId ?? null,
        p_note:             params.note ?? null,
      })

      if (error) {
        if (isVersionConflict(error)) {
          throw new JourneyVersionConflictError(params.journeyId, params.expectedVersion)
        }
        throw error
      }
      return data as PersonJourney
    },
  }
}

export type JourneyApi = ReturnType<typeof createJourneyApi>
