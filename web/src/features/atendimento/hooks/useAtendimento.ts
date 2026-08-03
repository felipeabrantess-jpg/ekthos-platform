import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────

export interface PersonAtendimento {
  id: string
  church_id: string
  name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  neighborhood: string | null
  city: string | null
  birth_date: string | null
  como_conheceu: string | null
  first_visit_date: string | null
  conversion_date: string | null
  person_stage: string | null
  celula_id: string | null
  responsible_id: string | null
  observacoes_pastorais: string | null
  avatar_url: string | null
}

export interface JourneyAtendimento {
  id: string
  stage_id: string | null
  owner_id: string | null
  version: number
  next_step: string | null
  next_step_due_at: string | null
  opened_at: string
}

export interface JourneyEventItem {
  id: string
  event_type: string
  actor_id: string | null
  actor_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface CareContactItem {
  contacted: boolean
  notes: string | null
  contacted_by_name: string | null
  contacted_at: string | null
  channel?: string | null
}

export interface StageSuggestion {
  stage_id: string
  stage_name: string
  order_index: number
  reason: string
}

// ── Hooks ─────────────────────────────────────────────────────

export function usePerson(personId: string | undefined) {
  return useQuery({
    queryKey: ['person-atendimento', personId],
    queryFn: async (): Promise<PersonAtendimento | null> => {
      if (!personId) return null
      const { data, error } = await supabase
        .from('people')
        .select('id, church_id, name, first_name, last_name, phone, email, neighborhood, city, birth_date, como_conheceu, first_visit_date, conversion_date, person_stage, celula_id, responsible_id, observacoes_pastorais, avatar_url')
        .eq('id', personId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as PersonAtendimento | null
    },
    enabled: !!personId,
    staleTime: 30_000,
  })
}

export function usePersonJourney(personId: string | undefined) {
  return useQuery({
    queryKey: ['person-journey', personId],
    queryFn: async (): Promise<JourneyAtendimento | null> => {
      if (!personId) return null
      const { data, error } = await supabase
        // @ts-expect-error -- person_journey not in database.types.ts; regen pending (OPS-DEBT)
        .from('person_journey')
        .select('id, stage_id, owner_id, version, next_step, next_step_due_at, opened_at')
        // @ts-expect-error -- type cascade from missing table above
        .eq('person_id', personId)
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as JourneyAtendimento | null
    },
    enabled: !!personId,
    staleTime: 15_000,
  })
}

export function usePersonJourneyEvents(journeyId: string | undefined) {
  return useQuery({
    queryKey: ['journey-events', journeyId],
    queryFn: async (): Promise<JourneyEventItem[]> => {
      if (!journeyId) return []
      const { data, error } = await supabase
        // @ts-expect-error -- journey_events not in database.types.ts; regen pending (OPS-DEBT)
        .from('journey_events')
        .select('id, event_type, actor_id, actor_type, payload, created_at')
        // @ts-expect-error -- type cascade from missing table above
        .eq('journey_id', journeyId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as JourneyEventItem[]
    },
    enabled: !!journeyId,
    staleTime: 15_000,
  })
}

export function usePersonCareContact(personId: string | undefined, churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['care-contact', personId],
    queryFn: async (): Promise<CareContactItem | null> => {
      if (!personId || !churchId) return null
      const { data, error } = await supabase
        // @ts-expect-error -- care_contacts not in database.types.ts; regen pending (OPS-DEBT)
        .from('care_contacts')
        .select('contacted, notes, contacted_by_name, contacted_at')
        // @ts-expect-error -- type cascade from missing table above
        .eq('person_id', personId)
        // @ts-expect-error -- type cascade from missing table above
        .eq('church_id', churchId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as CareContactItem | null
    },
    enabled: !!personId && !!churchId,
    staleTime: 30_000,
  })
}

export function useSuggestStage(personId: string | undefined, context: Record<string, boolean>) {
  const hasSignal = Object.values(context).some(Boolean)
  return useQuery({
    queryKey: ['stage-suggestion', personId, context],
    queryFn: async (): Promise<StageSuggestion | null> => {
      if (!personId) return null
      // @ts-expect-error -- journey_suggest_stage added in migration 20260731; types pending regen
      const { data, error } = await supabase.rpc('journey_suggest_stage', {
        p_person_id: personId,
        p_context:   context,
      })
      if (error) throw new Error(error.message)
      return data as StageSuggestion | null
    },
    enabled: !!personId && hasSignal,
    staleTime: 60_000,
  })
}

// ── Timeline unificada ────────────────────────────────────────

export interface TimelineItem {
  event_at:    string
  source:      'journey_event' | 'message' | 'acolhimento'
  actor_type:  string
  actor_name:  string
  event_kind:  string
  summary:     string | null
  raw_payload: Record<string, unknown> | null
}

export function usePersonTimeline(
  personId: string | undefined,
  opts: { limit?: number } = {}
) {
  const { limit = 10 } = opts
  return useQuery({
    queryKey: ['person-timeline', personId, limit],
    queryFn: async (): Promise<TimelineItem[]> => {
      if (!personId) return []
      // @ts-expect-error -- get_person_timeline added in migration 20260801; types pending regen
      const { data, error } = await supabase.rpc('get_person_timeline', {
        p_person_id: personId,
        p_limit:     limit,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as TimelineItem[]
    },
    enabled: !!personId,
    staleTime: 15_000,
  })
}

// ── Mutation ─────────────────────────────────────────────────

interface RegisterArgs {
  person_id:        string
  expected_version?: number | null
  people_updates?:  Record<string, string>
  contact_channel:  string
  contact_result:   string
  contact_notes?:   string
  contact_date?:    string
  new_stage_id?:    string | null
  next_step?:       string
  next_step_due_at?: string | null
}

export function useRegisterAttendance() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()

  return useMutation({
    mutationFn: async (args: RegisterArgs) => {
      // @ts-expect-error -- journey_register_attendance added in migration 20260731; types pending regen
      const { data, error } = await supabase.rpc('journey_register_attendance', {
        p_person_id:        args.person_id,
        p_expected_version: args.expected_version ?? null,
        p_people_updates:   args.people_updates   ?? {},
        p_contact_channel:  args.contact_channel,
        p_contact_result:   args.contact_result,
        p_contact_notes:    args.contact_notes    ?? null,
        p_contact_date:     args.contact_date     ?? new Date().toISOString(),
        p_new_stage_id:     args.new_stage_id     ?? null,
        p_next_step:        args.next_step         ?? null,
        p_next_step_due_at: args.next_step_due_at ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, args) => {
      void queryClient.invalidateQueries({ queryKey: ['person-atendimento',  args.person_id] })
      void queryClient.invalidateQueries({ queryKey: ['person-journey',      args.person_id] })
      void queryClient.invalidateQueries({ queryKey: ['person-timeline',     args.person_id] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',      churchId] })
      void queryClient.invalidateQueries({ queryKey: ['care-queue',          churchId] })
    },
  })
}
