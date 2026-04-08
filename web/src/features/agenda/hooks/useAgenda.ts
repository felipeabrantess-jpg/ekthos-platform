import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ChurchEvent, EventType } from '@/lib/database.types'

interface AgendaFilters {
  type?: EventType
  upcoming?: boolean
}

export function useAgenda(churchId: string, filters: AgendaFilters = {}) {
  return useQuery({
    queryKey: ['agenda', churchId, filters],
    queryFn: async (): Promise<ChurchEvent[]> => {
      let query = supabase
        .from('church_events')
        .select('*')
        .eq('church_id', churchId)
        .order('start_datetime', { ascending: true })

      if (filters.type) {
        query = query.eq('event_type', filters.type)
      }

      if (filters.upcoming) {
        query = query.gte('start_datetime', new Date().toISOString())
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return data ?? []
    },
    enabled: Boolean(churchId),
  })
}

interface CreateEventInput {
  church_id: string
  title: string
  event_type: EventType
  start_datetime: string
  end_datetime?: string | null
  location?: string | null
  description?: string | null
  is_public?: boolean
}

export function useCreateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const { data, error } = await supabase
        .from('church_events')
        .insert({
          church_id: input.church_id,
          title: input.title,
          event_type: input.event_type,
          start_datetime: input.start_datetime,
          end_datetime: input.end_datetime ?? null,
          location: input.location ?? null,
          description: input.description ?? null,
          is_public: input.is_public ?? true,
          recurrence: null,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', church_id] })
    },
  })
}

interface UpdateEventInput {
  id: string
  church_id: string
  title?: string
  event_type?: EventType
  start_datetime?: string
  end_datetime?: string | null
  location?: string | null
  description?: string | null
  is_public?: boolean
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateEventInput) => {
      const { data, error } = await supabase
        .from('church_events')
        .update(updates)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', church_id] })
    },
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('church_events')
        .delete()
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['agenda', churchId] })
    },
  })
}
