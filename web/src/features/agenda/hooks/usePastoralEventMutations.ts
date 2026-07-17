import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CreatePastoralEventInput {
  church_id: string
  assigned_pastor_id: string | null
  title: string
  start_datetime: string
  end_datetime?: string | null
  all_day?: boolean
  location?: string | null
  pastoral_category?: string | null
  person_ids?: string[]
  pastoral_notes?: string | null
}

export interface UpdatePastoralEventInput {
  id: string
  church_id: string
  title: string
  start_datetime: string
  end_datetime?: string | null
  all_day?: boolean
  location?: string | null
  pastoral_category?: string | null
  person_ids?: string[]
  pastoral_notes?: string | null
}

export interface CancelPastoralEventInput {
  id: string
  church_id: string
  cancelled_reason?: string | null
}

export function useCreatePastoralEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePastoralEventInput) => {
      const { data, error } = await supabase
        .from('church_events')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id:           input.church_id,
          assigned_pastor_id:  input.assigned_pastor_id,
          title:               input.title,
          start_datetime:      input.start_datetime,
          end_datetime:        input.end_datetime ?? null,
          all_day:             input.all_day ?? false,
          location:            input.location ?? null,
          pastoral_category:   input.pastoral_category ?? null,
          person_ids:          input.person_ids ?? [],
          pastoral_notes:      input.pastoral_notes ?? null,
          is_pastoral:         true,
          is_public:           false,
          active:              true,
          event_type:          'outro',
          scope:               'geral',
          recurrence_type:     'none',
        } as any)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['pastoral_events', church_id] })
    },
  })
}

export function useUpdatePastoralEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdatePastoralEventInput) => {
      const { data, error } = await supabase
        .from('church_events')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          title:              input.title,
          start_datetime:     input.start_datetime,
          end_datetime:       input.end_datetime ?? null,
          all_day:            input.all_day ?? false,
          location:           input.location ?? null,
          pastoral_category:  input.pastoral_category ?? null,
          person_ids:         input.person_ids ?? [],
          pastoral_notes:     input.pastoral_notes ?? null,
          updated_at:         new Date().toISOString(),
        } as any)
        .eq('id', input.id)
        .eq('church_id', input.church_id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['pastoral_events', church_id] })
    },
  })
}

export function useCancelPastoralEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CancelPastoralEventInput) => {
      const { error } = await supabase
        .from('church_events')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          cancelled_at:     new Date().toISOString(),
          cancelled_reason: input.cancelled_reason ?? null,
          active:           false,
          updated_at:       new Date().toISOString(),
        } as any)
        .eq('id', input.id)
        .eq('church_id', input.church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['pastoral_events', church_id] })
    },
  })
}
