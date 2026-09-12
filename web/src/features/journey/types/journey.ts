// Tipos da espinha canônica person_journey + journey_events
// Fase 1 — sem ligar ao legado. Não importar de outros features ainda.

export type JourneyConfidentiality = 'normal' | 'restricted' | 'sealed'

export interface PersonJourney {
  id: string
  church_id: string
  person_id: string
  stage_id: string
  pipeline_id: string | null
  owner_id: string | null
  ministry_id: string | null
  version: number
  agent_locked_at: string | null
  confidentiality: JourneyConfidentiality
  opened_at: string
  closed_at: string | null
  outcome: string | null
  next_step: string | null
  next_step_due_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type JourneyActorType = 'human' | 'agent' | 'system'

export interface JourneyEvent {
  id: string
  journey_id: string
  church_id: string
  event_type: JourneyEventType
  actor_id: string | null
  actor_type: JourneyActorType
  payload: Record<string, unknown>
  created_at: string
}

export type JourneyEventType =
  | 'stage_advance'
  | 'owner_assigned'
  | 'journey_transferred'
  | 'next_step_updated'
  | 'journey_closed'
  | 'note_added'
  | 'touch_registered'
  | string // extensível para tipos futuros

// Parâmetros das RPCs
// actor_id é derivado de auth.uid() no banco — não enviar pelo cliente
export interface JourneyAdvanceParams {
  journeyId: string
  expectedVersion: number
  newStageId: string
  note?: string
}

export interface JourneyAssignParams {
  journeyId: string
  expectedVersion: number
  ownerId: string
}

export interface JourneyRegisterTouchParams {
  journeyId: string
  touchType: JourneyEventType
  payload?: Record<string, unknown>
}

export interface JourneyTransferParams {
  journeyId: string
  expectedVersion: number
  newOwnerId: string
  newMinistryId?: string
  note?: string
}

export interface JourneyUpdateNextStepParams {
  journeyId: string
  expectedVersion: number
  nextStep: string
  dueDate?: string
}

export interface JourneyCloseParams {
  journeyId: string
  expectedVersion: number
  outcome: string
  note?: string
}

// Erro retornado quando há conflito de versão
export class JourneyVersionConflictError extends Error {
  constructor(
    public readonly journeyId: string,
    public readonly expectedVersion: number,
  ) {
    super(`JOURNEY_VERSION_CONFLICT: journey ${journeyId} expected version ${expectedVersion}`)
    this.name = 'JourneyVersionConflictError'
  }
}
