// Tipos base do schema Ekthos Platform
// Gerado manualmente — manter sincronizado com supabase/migrations/

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ──────────────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────────────
export type PersonSource = 'whatsapp' | 'instagram' | 'manual' | 'import' | 'onboarding'
export type InteractionType = 'whatsapp' | 'instagram' | 'system' | 'manual' | 'n8n'
export type InteractionDirection = 'inbound' | 'outbound'
export type ModelUsed = 'haiku' | 'sonnet' | 'template' | 'rule' | 'human' | 'none'
export type DonationType = 'dizimo' | 'oferta' | 'campanha' | 'missoes' | 'construcao'
export type DonationStatus = 'pending' | 'confirmed' | 'failed' | 'refunded' | 'cancelled'
export type PaymentMethod = 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'transferencia'
export type Gateway = 'stripe' | 'pagseguro' | 'mercadopago' | 'manual'
export type ScheduleStatus = 'draft' | 'published' | 'confirmed' | 'cancelled'
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined' | 'replaced'
export type CellMemberRole = 'membro' | 'lider' | 'hospedeiro' | 'aprendiz'
export type EventType = 'culto' | 'reuniao' | 'celula' | 'retiro' | 'conferencia' | 'treinamento' | 'outro'
export type OnboardingStatus = 'in_progress' | 'completed' | 'abandoned'

// ──────────────────────────────────────────────────────────────────────
// Tabelas base
// ──────────────────────────────────────────────────────────────────────
export interface Church {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ChurchSettings {
  id: string
  church_id: string
  modules_enabled: {
    whatsapp: boolean
    instagram: boolean
    crm: boolean
    donations: boolean
    agenda: boolean
  }
  labels: {
    group: string
    member: string
    visitor: string
    leader: string
  }
  support_hours: {
    timezone: string
    weekday: { start: string; end: string }
    weekend: { start: string; end: string }
  }
  escalation_contacts: Array<{ name: string; whatsapp: string; role: string }>
  out_of_hours_message: string
  onboarding_completed: boolean
  onboarding_completed_at: string | null
  max_msg_per_hour: number
  created_at: string
  updated_at: string
}

export interface Person {
  id: string
  church_id: string
  name: string | null
  phone: string | null
  email: string | null
  instagram_handle: string | null
  tags: string[]
  last_contact_at: string | null
  optout: boolean
  optout_at: string | null
  source: PersonSource
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PipelineStage {
  id: string
  church_id: string
  name: string
  slug: string
  order_index: number
  days_until_followup: number
  auto_followup: boolean
  is_active: boolean
  created_at: string
}

export interface PersonPipeline {
  id: string
  church_id: string
  person_id: string
  stage_id: string
  entered_at: string
  last_activity_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  church_id: string
  person_id: string | null
  type: InteractionType
  direction: InteractionDirection
  content: Json
  external_id: string | null
  agent: string | null
  model_used: ModelUsed
  tokens_used: number
  created_at: string
}

export interface Leader {
  id: string
  church_id: string
  person_id: string
  role: string
  ministry_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Ministry {
  id: string
  church_id: string
  name: string
  slug: string
  description: string | null
  leader_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Volunteer {
  id: string
  church_id: string
  person_id: string
  ministry_id: string
  role: string | null
  skills: string[]
  availability: { days: string[]; period: string }
  is_active: boolean
  joined_at: string
  created_at: string
  updated_at: string
}

export interface ServiceSchedule {
  id: string
  church_id: string
  ministry_id: string
  event_name: string
  event_date: string
  event_time: string | null
  status: ScheduleStatus
  notes: string | null
  created_by: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface ServiceScheduleAssignment {
  id: string
  church_id: string
  schedule_id: string
  volunteer_id: string
  role: string | null
  status: AssignmentStatus
  notified_at: string | null
  responded_at: string | null
  created_at: string
}

export interface ChurchEvent {
  id: string
  church_id: string
  title: string
  description: string | null
  event_type: EventType
  start_datetime: string
  end_datetime: string | null
  location: string | null
  is_public: boolean
  recurrence: Json | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PastoralCabinet {
  id: string
  church_id: string
  person_id: string
  role: string
  order_index: number
  bio: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Donation {
  id: string
  church_id: string
  person_id: string | null
  type: DonationType
  campaign_id: string | null
  amount: number
  currency: string
  payment_method: PaymentMethod | null
  gateway: Gateway | null
  gateway_transaction_id: string | null
  status: DonationStatus
  confirmed_at: string | null
  receipt_sent: boolean
  receipt_sent_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinancialCampaign {
  id: string
  church_id: string
  name: string
  description: string | null
  goal_amount: number | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────────────────────────
// Tipos compostos (queries com joins)
// ──────────────────────────────────────────────────────────────────────
export interface PersonWithStage extends Person {
  person_pipeline: Array<{
    stage_id: string
    last_activity_at: string
    pipeline_stages: Pick<PipelineStage, 'id' | 'name' | 'slug' | 'order_index'> | null
  }>
}

export interface LeaderWithPerson extends Leader {
  people: Pick<Person, 'id' | 'name' | 'phone' | 'email'> | null
}

export interface MinistryWithLeader extends Ministry {
  leaders: LeaderWithPerson | null
  volunteer_count?: number
}

export interface VolunteerWithPerson extends Volunteer {
  people: Pick<Person, 'id' | 'name' | 'phone'> | null
}

export interface ScheduleWithAssignments extends ServiceSchedule {
  ministries: Pick<Ministry, 'id' | 'name'> | null
  service_schedule_assignments: Array<
    ServiceScheduleAssignment & {
      volunteers: VolunteerWithPerson | null
    }
  >
}

// ──────────────────────────────────────────────────────────────────────
// Tipo Database (para o cliente Supabase tipado)
// ──────────────────────────────────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      churches: { Row: Church; Insert: Omit<Church, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Church> }
      church_settings: { Row: ChurchSettings; Insert: Omit<ChurchSettings, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ChurchSettings> }
      people: { Row: Person; Insert: Omit<Person, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Person> }
      pipeline_stages: { Row: PipelineStage; Insert: Omit<PipelineStage, 'id' | 'created_at'>; Update: Partial<PipelineStage> }
      person_pipeline: { Row: PersonPipeline; Insert: Omit<PersonPipeline, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PersonPipeline> }
      interactions: { Row: Interaction; Insert: Omit<Interaction, 'id' | 'created_at'>; Update: Partial<Interaction> }
      leaders: { Row: Leader; Insert: Omit<Leader, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Leader> }
      ministries: { Row: Ministry; Insert: Omit<Ministry, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Ministry> }
      volunteers: { Row: Volunteer; Insert: Omit<Volunteer, 'id' | 'joined_at' | 'created_at' | 'updated_at'>; Update: Partial<Volunteer> }
      service_schedules: { Row: ServiceSchedule; Insert: Omit<ServiceSchedule, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ServiceSchedule> }
      service_schedule_assignments: { Row: ServiceScheduleAssignment; Insert: Omit<ServiceScheduleAssignment, 'id' | 'created_at'>; Update: Partial<ServiceScheduleAssignment> }
      church_events: { Row: ChurchEvent; Insert: Omit<ChurchEvent, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ChurchEvent> }
      pastoral_cabinet: { Row: PastoralCabinet; Insert: Omit<PastoralCabinet, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PastoralCabinet> }
      donations: { Row: Donation; Insert: Omit<Donation, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Donation> }
      financial_campaigns: { Row: FinancialCampaign; Insert: Omit<FinancialCampaign, 'id' | 'created_at' | 'updated_at'>; Update: Partial<FinancialCampaign> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
