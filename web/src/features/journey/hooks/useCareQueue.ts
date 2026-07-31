import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Json } from '@/lib/database.types'

export interface CareQueueItem {
  journey_id:       string | null
  person_id:        string
  person_name:      string
  phone:            string | null
  church_id:        string
  stage_id:         string | null
  stage_name:       string | null
  owner_id:         string | null
  next_step_due_at: string | null
  next_step:        string | null
  version:          number | null
  category:         'overdue' | 'no_owner' | 'newcomer'
  days_overdue:     number | null
  priority:         number
  opened_at:        string | null
}

export function useCareQueue(churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['care-queue', churchId],
    queryFn: async (): Promise<CareQueueItem[]> => {
      if (!churchId) return []
      const { data, error } = await supabase
        .from('v_care_queue')
        .select('*')
        .eq('church_id', churchId)
        .order('priority', { ascending: true })
        .order('opened_at', { ascending: true, nullsFirst: false })
        .limit(15)
      if (error) throw new Error(error.message)
      return (data ?? []) as CareQueueItem[]
    },
    enabled: !!churchId,
    staleTime: 10_000,
  })
}

// ── REGISTRAR CONTATO (journey_register_touch) ────────────────

interface RegisterTouchArgs {
  journey_id: string
  touch_type: string
  payload?:   Json
}

export function useRegisterTouch() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()

  return useMutation({
    mutationFn: async ({ journey_id, touch_type, payload }: RegisterTouchArgs) => {
      const { error } = await supabase.rpc('journey_register_touch', {
        p_journey_id: journey_id,
        p_touch_type: touch_type,
        p_payload:    payload,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })
    },
  })
}

// ── ATRIBUIR RESPONSÁVEL (journey_assign) ─────────────────────

interface AssignArgs {
  journey_id:       string
  expected_version: number
  owner_id:         string
}

export function useJourneyAssign() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()

  return useMutation({
    mutationFn: async ({ journey_id, expected_version, owner_id }: AssignArgs) => {
      const { error } = await supabase.rpc('journey_assign', {
        p_journey_id:       journey_id,
        p_expected_version: expected_version,
        p_owner_id:         owner_id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })
    },
  })
}

// ── ABRIR JORNADA (journey_open) — para newcomers ─────────────

interface JourneyOpenArgs {
  person_id:    string
  stage_id:     string
  next_step?:   string
  due_at?:      string
}

export function useJourneyOpen() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()

  return useMutation({
    mutationFn: async ({ person_id, stage_id, next_step, due_at }: JourneyOpenArgs) => {
      const { error } = await supabase.rpc('journey_open', {
        p_person_id: person_id,
        p_stage_id:  stage_id,
        p_next_step: next_step,
        p_due_at:    due_at,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })
    },
  })
}

// ── AVANÇAR ETAPA (journey_advance) ──────────────────────────

interface AdvanceArgs {
  journey_id:       string
  expected_version: number
  new_stage_id:     string
  note?:            string
  owner_id?:        string
}

export function useJourneyAdvance() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()

  return useMutation({
    mutationFn: async ({ journey_id, expected_version, new_stage_id, note, owner_id }: AdvanceArgs) => {
      const { error } = await supabase.rpc('journey_advance', {
        p_journey_id:       journey_id,
        p_expected_version: expected_version,
        p_new_stage_id:     new_stage_id,
        p_note:             note,
        p_owner_id:         owner_id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })
    },
  })
}
