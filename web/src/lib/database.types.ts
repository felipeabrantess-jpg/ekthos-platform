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
// Novos enums do merge ekthos-crm
export type CellRole = 'participante' | 'lider' | 'hospedeiro' | 'aprendiz'
export type MinistryRole = 'membro' | 'lider' | 'coordenador'
export type ChurchRelationship = 'visitante' | 'frequentador' | 'membro' | 'transferido'
export type PersonStage = 'visitante' | 'contato' | 'frequentador' | 'consolidado' | 'discipulo' | 'lider'

// ──────────────────────────────────────────────────────────────────────
// Tabelas base
// ──────────────────────────────────────────────────────────────────────
export interface Church {
  id: string
  name: string
  slug: string
  is_active: boolean
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  subscription_plan: string
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
  first_name: string | null
  last_name: string | null
  phone: string | null
  phone_secondary: string | null
  email: string | null
  instagram_handle: string | null
  avatar_url: string | null
  birth_date: string | null
  marital_status: string | null
  cpf: string | null
  // Endereço
  zip_code: string | null
  street: string | null
  street_number: string | null
  address_complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  // Jornada espiritual
  church_relationship: ChurchRelationship | null
  person_stage: PersonStage | null
  first_visit_date: string | null
  conversion_date: string | null
  baptism_date: string | null
  baptized: boolean
  in_discipleship: boolean
  has_cell: boolean
  interested_in_cell: boolean
  serves_ministry: boolean
  consolidation_school: boolean
  encounter_with_god: boolean
  // Família
  invited_by: string | null
  responsible_id: string | null
  spouse_name: string | null
  children_count: number
  children_info: string | null
  // Igreja anterior
  previous_church: string | null
  origin_church_name: string | null
  origin_pastor_name: string | null
  // Ministério / Habilidades
  calling: string | null
  skills_text: string | null
  available_days: string | null
  available_periods: string | null
  ministry_interest: string[] | null
  network: string | null
  // Membership
  membership_status: string | null
  membership_date: string | null
  // Campos originais
  tags: string[]
  last_contact_at: string | null
  optout: boolean
  optout_at: string | null
  source: PersonSource
  lgpd_consent: boolean
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
  sla_hours: number | null
  days_until_followup: number
  auto_followup: boolean
  is_active: boolean
  pipeline_id: string | null
  created_at: string
}

export interface PersonPipeline {
  id: string
  church_id: string
  person_id: string
  stage_id: string
  entered_at: string
  last_activity_at: string
  loss_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PipelineHistory {
  id: string
  church_id: string
  person_id: string
  from_stage_id: string | null
  to_stage_id: string
  moved_at: string
  moved_by: string | null
  loss_reason: string | null
  notes: string | null
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
// Novas tabelas (merge ekthos-crm)
// ──────────────────────────────────────────────────────────────────────
export interface Pipeline {
  id: string
  church_id: string
  name: string
  created_at: string
}

export interface Group {
  id: string
  church_id: string
  name: string
  description: string | null
  leader_id: string | null
  co_leader_id: string | null
  meeting_day: string | null
  meeting_time: string | null
  location: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CellMeeting {
  id: string
  church_id: string
  group_id: string
  meeting_date: string
  theme: string | null
  visitors_count: number
  consolidated_count: number
  offering_amount: number | null
  notes: string | null
  created_at: string
}

export interface CellMember {
  id: string
  church_id: string
  group_id: string
  person_id: string
  role: CellRole
  created_at: string
}

export interface CellAttendance {
  id: string
  meeting_id: string
  person_id: string
}

export interface CellReport {
  id: string
  church_id: string | null
  leader_id: string | null
  cell_id: string | null
  meeting_date: string | null
  total_present: number | null
  visitors_count: number | null
  new_converts: number | null
  notes: string | null
  created_at: string | null
}

export interface CellReportPerson {
  id: string
  report_id: string | null
  person_id: string | null
  present: boolean | null
  first_time: boolean | null
  became_convert: boolean | null
}

export interface Tag {
  id: string
  church_id: string
  name: string
  created_at: string
}

export interface PersonTag {
  id: string
  person_id: string
  tag_id: string
  church_id: string
  created_at: string
}

export interface MinistryMember {
  id: string
  church_id: string
  ministry_id: string
  person_id: string
  role: MinistryRole
  created_at: string
}

export interface MemberProfile {
  id: string
  person_id: string
  church_id: string
  conversion_date: string | null
  baptized: boolean
  encounter_with_god: boolean
  consolidation_school: boolean
  previous_church: string | null
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  church_id: string
  person_id: string
  assigned_to: string | null
  title: string
  description: string | null
  due_date: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  church_id: string
  name: string
  api_token: string
  active: boolean
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  church_id: string
  name: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
}

export interface PersonRole {
  id: string
  person_id: string
  role_id: string
  church_id: string
  created_at: string
}

export interface PersonEvent {
  id: string
  church_id: string
  person_id: string
  event_type: string
  data: Json
  created_at: string
}

export interface EventTemplate {
  id: string
  church_id: string | null
  name: string
  type: string | null
  category: string | null
  day_of_week: string | null
  default_time: string | null
  responsible: string | null
  created_at: string | null
}

export interface Contribution {
  id: string
  church_id: string
  person_id: string | null
  amount: number
  currency: string | null
  category: string | null
  notes: string | null
  contributed_at: string
  created_at: string
}

// ──────────────────────────────────────────────────────────────────────
// Tipos compostos (queries com joins)
// ──────────────────────────────────────────────────────────────────────
export interface PersonWithStage extends Person {
  person_pipeline: Array<{
    stage_id: string
    entered_at: string
    last_activity_at: string
    loss_reason: string | null
    pipeline_stages: Pick<PipelineStage, 'id' | 'name' | 'slug' | 'order_index' | 'sla_hours'> | null
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

export interface GroupWithDetails extends Group {
  cell_members: Array<CellMember & { people: Pick<Person, 'id' | 'name' | 'phone'> | null }>
  leader: Pick<Person, 'id' | 'name' | 'phone'> | null
}

// ──────────────────────────────────────────────────────────────────────
// Tipo Database (para o cliente Supabase tipado)
// ──────────────────────────────────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      churches: { Row: Church; Insert: Omit<Church, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Church>; Relationships: [] }
      church_settings: { Row: ChurchSettings; Insert: Omit<ChurchSettings, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ChurchSettings>; Relationships: [] }
      people: { Row: Person; Insert: Omit<Person, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Person>; Relationships: [] }
      pipeline_stages: { Row: PipelineStage; Insert: Omit<PipelineStage, 'id' | 'created_at'>; Update: Partial<PipelineStage>; Relationships: [] }
      person_pipeline: { Row: PersonPipeline; Insert: Omit<PersonPipeline, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PersonPipeline>; Relationships: [] }
      pipeline_history: { Row: PipelineHistory; Insert: Omit<PipelineHistory, 'id'>; Update: Partial<PipelineHistory>; Relationships: [] }
      interactions: { Row: Interaction; Insert: Omit<Interaction, 'id' | 'created_at'>; Update: Partial<Interaction>; Relationships: [] }
      leaders: { Row: Leader; Insert: Omit<Leader, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Leader>; Relationships: [] }
      ministries: { Row: Ministry; Insert: Omit<Ministry, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Ministry>; Relationships: [] }
      volunteers: { Row: Volunteer; Insert: Omit<Volunteer, 'id' | 'joined_at' | 'created_at' | 'updated_at'>; Update: Partial<Volunteer>; Relationships: [] }
      service_schedules: { Row: ServiceSchedule; Insert: Omit<ServiceSchedule, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ServiceSchedule>; Relationships: [] }
      service_schedule_assignments: { Row: ServiceScheduleAssignment; Insert: Omit<ServiceScheduleAssignment, 'id' | 'created_at'>; Update: Partial<ServiceScheduleAssignment>; Relationships: [] }
      church_events: { Row: ChurchEvent; Insert: Omit<ChurchEvent, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ChurchEvent>; Relationships: [] }
      pastoral_cabinet: { Row: PastoralCabinet; Insert: Omit<PastoralCabinet, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PastoralCabinet>; Relationships: [] }
      donations: { Row: Donation; Insert: Omit<Donation, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Donation>; Relationships: [] }
      financial_campaigns: { Row: FinancialCampaign; Insert: Omit<FinancialCampaign, 'id' | 'created_at' | 'updated_at'>; Update: Partial<FinancialCampaign>; Relationships: [] }
      // Novas tabelas (merge ekthos-crm)
      pipelines: { Row: Pipeline; Insert: Omit<Pipeline, 'id' | 'created_at'>; Update: Partial<Pipeline>; Relationships: [] }
      groups: { Row: Group; Insert: Omit<Group, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Group>; Relationships: [] }
      cell_meetings: { Row: CellMeeting; Insert: Omit<CellMeeting, 'id' | 'created_at'>; Update: Partial<CellMeeting>; Relationships: [] }
      cell_members: { Row: CellMember; Insert: Omit<CellMember, 'id' | 'created_at'>; Update: Partial<CellMember>; Relationships: [] }
      cell_attendance: { Row: CellAttendance; Insert: Omit<CellAttendance, 'id'>; Update: Partial<CellAttendance>; Relationships: [] }
      cell_reports: { Row: CellReport; Insert: Omit<CellReport, 'id'>; Update: Partial<CellReport>; Relationships: [] }
      cell_report_people: { Row: CellReportPerson; Insert: Omit<CellReportPerson, 'id'>; Update: Partial<CellReportPerson>; Relationships: [] }
      tags: { Row: Tag; Insert: Omit<Tag, 'id' | 'created_at'>; Update: Partial<Tag>; Relationships: [] }
      person_tags: { Row: PersonTag; Insert: Omit<PersonTag, 'id' | 'created_at'>; Update: Partial<PersonTag>; Relationships: [] }
      ministry_members: { Row: MinistryMember; Insert: Omit<MinistryMember, 'id' | 'created_at'>; Update: Partial<MinistryMember>; Relationships: [] }
      member_profiles: { Row: MemberProfile; Insert: Omit<MemberProfile, 'id' | 'created_at' | 'updated_at'>; Update: Partial<MemberProfile>; Relationships: [] }
      tasks: { Row: Task; Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Task>; Relationships: [] }
      integrations: { Row: Integration; Insert: Omit<Integration, 'id' | 'created_at'>; Update: Partial<Integration>; Relationships: [] }
      profiles: { Row: Profile; Insert: Omit<Profile, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Profile>; Relationships: [] }
      roles: { Row: Role; Insert: Omit<Role, 'id'>; Update: Partial<Role>; Relationships: [] }
      person_roles: { Row: PersonRole; Insert: Omit<PersonRole, 'id' | 'created_at'>; Update: Partial<PersonRole>; Relationships: [] }
      person_events: { Row: PersonEvent; Insert: Omit<PersonEvent, 'id' | 'created_at'>; Update: Partial<PersonEvent>; Relationships: [] }
      event_templates: { Row: EventTemplate; Insert: Omit<EventTemplate, 'id'>; Update: Partial<EventTemplate>; Relationships: [] }
      contributions: { Row: Contribution; Insert: Omit<Contribution, 'id' | 'created_at'>; Update: Partial<Contribution>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
