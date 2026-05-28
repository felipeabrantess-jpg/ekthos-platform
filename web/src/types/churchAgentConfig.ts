// ── Enums (valores válidos confirmados no banco) ─────────────

export type Formality = 'formal' | 'proximo' | 'caloroso' | 'casual'
export type EmojiUsage = 'none' | 'discrete' | 'free'
export type PastoralDepth = 'reservado' | 'equilibrado' | 'pastoral'
export type FirstContactDelay = 'same_day' | 'd1' | 'd2_d3'

export const TOUCHPOINTS_ACOLHIMENTO = ['D+0','D+3','D+7','D+14','D+30','D+60','D+90'] as const
export const TOUCHPOINTS_REENGAJAMENTO = ['RE+15','RE+30','RE+60','RE+90'] as const

// ── Payloads para RPCs ───────────────────────────────────────

export interface ChurchAgentConfigPayload {
  agent_name?: string
  pastor_name?: string
  church_name_short?: string
  formality?: Formality
  denomination?: string
  preferred_verses?: string[]
  forbidden_topics?: string[]
  pastoral_depth?: PastoralDepth
  first_contact_delay?: FirstContactDelay
  send_window?: { start: string; end: string } | null
  emoji_usage?: EmojiUsage
  custom_overrides?: Record<string, unknown> | null
  custom_instructions?: string
  service_schedule?: Array<{ day: string; time: string; duration_minutes?: number }> | null
  escalation_config?: {
    enabled: boolean
    default_handler?: string
    rules?: Array<{
      trigger: string
      action: string
      threshold?: number
      notify_to_role?: string
      keywords?: string[]
    }>
  } | null
}

export interface ChurchFollowupConfigPayload {
  enabled_touchpoints?: string[]
  followup_enabled?: boolean
  duration_days?: number | null
  send_window_start?: string | null
  send_window_end?: string | null
  stop_conditions?: { on_response: boolean; on_attendance: boolean }
  escalation_conditions?: {
    on_no_response_days?: number
    notify_role?: string
    pause_followup?: boolean
    sensitive_case_flag?: boolean
  }
  next_action_after_completion?: string | null
}

// ── Retorno das RPCs ─────────────────────────────────────────

export interface ChurchAgentConfigRecord {
  church_id: string
  agent_slug: string
  agent_name: string | null
  pastor_name: string | null
  church_name_short: string | null
  formality: Formality | null
  denomination: string | null
  preferred_verses: string[] | null
  forbidden_topics: string[] | null
  pastoral_depth: PastoralDepth | null
  first_contact_delay: FirstContactDelay | null
  send_window: { start: string; end: string } | null
  emoji_usage: EmojiUsage | null
  custom_overrides: Record<string, unknown> | null
  custom_instructions: string | null
  service_schedule: Array<{ day: string; time: string; duration_minutes?: number }> | null
  escalation_config: {
    enabled: boolean
    default_handler?: string
    rules?: Array<{
      trigger: string
      action: string
      threshold?: number
      notify_to_role?: string
      keywords?: string[]
    }>
  } | null
  active: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface ChurchFollowupConfigRecord {
  id: string
  church_id: string
  agent_slug: string
  enabled_touchpoints: string[]
  followup_enabled: boolean
  duration_days: number | null
  send_window_start: string | null
  send_window_end: string | null
  stop_conditions: { on_response: boolean; on_attendance: boolean }
  escalation_conditions: {
    on_no_response_days?: number
    notify_role?: string
    pause_followup?: boolean
    sensitive_case_flag?: boolean
  }
  next_action_after_completion: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ChurchAgentFullConfig {
  church_id: string
  agent_slug: string
  config: ChurchAgentConfigRecord
  followup: ChurchFollowupConfigRecord
  template_meta: {
    agent_slug: string
    name: string
    version: number
    active: boolean
  }
}

// Form state global (persistente entre trocas de aba)
export interface AgentCockpitFormState {
  // Aba 1 — Overrides de agente (church_agent_config)
  // Dados da Igreja ficam na aba Cadastro de Church.tsx (editados via useChurchIdentity)
  agent_name: string
  pastor_name: string
  church_name_short: string
  // Aba 2 — Prompt + Tom
  formality: Formality | ''
  emoji_usage: EmojiUsage | ''
  pastoral_depth: PastoralDepth | ''
  first_contact_delay: FirstContactDelay | ''
  custom_instructions: string
  preferred_verses: string[]
  forbidden_topics: string[]
  denomination_override: string
  // Aba 3 — Follow-up
  followup_enabled: boolean
  enabled_touchpoints: string[]
  duration_days: string
  send_window_start: string
  send_window_end: string
  stop_on_response: boolean
  stop_on_attendance: boolean
  next_action_after_completion: string
  // Aba 4 — Escalonamento
  escalation_enabled: boolean
  escalation_on_no_response_days: string
  escalation_notify_role: string
  escalation_pause_followup: boolean
  escalation_sensitive_case_flag: boolean
  escalation_keywords: string[]
}
