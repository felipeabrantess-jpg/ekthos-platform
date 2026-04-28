import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EventType } from '@/lib/types/joins'

// ── Domain types ──────────────────────────────────────────────────────────────

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
export type RecurrenceEndType = 'never' | 'until' | 'count'
export type EventScope = 'geral' | 'ministerio' | 'celula' | 'lideranca'

export interface ChurchEventFull {
  id: string
  church_id: string
  title: string
  description: string | null
  event_type: EventType
  start_datetime: string
  end_datetime: string | null
  location: string | null
  is_public: boolean
  scope: EventScope
  ministry_id: string | null
  all_day: boolean
  is_online: boolean
  online_link: string | null
  recurrence_type: RecurrenceType | null
  recurrence_interval: number | null
  recurrence_day_of_week: number[] | null
  recurrence_end_type: RecurrenceEndType | null
  recurrence_until: string | null
  recurrence_count: number | null
  leader_id: string | null
  color: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EventOccurrence {
  id: string
  event_id: string
  church_id: string
  occurrence_date: string
  start_datetime: string
  end_datetime: string | null
  is_cancelled: boolean
  cancel_reason: string | null
  override_title: string | null
  override_location: string | null
  created_at: string
  updated_at: string
  church_events?: ChurchEventFull | null
}

export interface CreateEventInput {
  church_id: string
  title: string
  event_type: EventType
  start_datetime: string
  end_datetime?: string | null
  location?: string | null
  description?: string | null
  is_public?: boolean
  scope?: EventScope
  ministry_id?: string | null
  all_day?: boolean
  is_online?: boolean
  online_link?: string | null
  recurrence_type?: RecurrenceType | null
  recurrence_interval?: number | null
  recurrence_day_of_week?: number[] | null
  recurrence_end_type?: RecurrenceEndType | null
  recurrence_until?: string | null
  recurrence_count?: number | null
  leader_id?: string | null
  color?: string | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All parent church_events for the CRUD list */
export function useEvents(churchId: string) {
  return useQuery({
    queryKey: ['events', churchId],
    queryFn: async (): Promise<ChurchEventFull[]> => {
      const { data, error } = await supabase
        .from('church_events')
        .select('*')
        .eq('church_id', churchId)
        .order('start_datetime', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as ChurchEventFull[]
    },
    enabled: Boolean(churchId),
  })
}

/** Occurrences within a calendar date range — feeds FullCalendar */
export function useEventOccurrences(
  churchId: string,
  from: Date,
  to: Date,
  ministryId?: string | null,
) {
  return useQuery({
    queryKey: ['event_occurrences', churchId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), ministryId ?? null],
    queryFn: async (): Promise<EventOccurrence[]> => {
      const { data, error } = await supabase
        .from('event_occurrences')
        .select('*, church_events(*)')
        .eq('church_id', churchId)
        .eq('is_cancelled', false)
        .gte('start_datetime', from.toISOString())
        .lte('start_datetime', to.toISOString())
        .order('start_datetime', { ascending: true })

      if (error) throw new Error(error.message)
      let rows = (data ?? []) as unknown as EventOccurrence[]

      if (ministryId) {
        rows = rows.filter(o => o.church_events?.ministry_id === ministryId)
      }
      return rows
    },
    enabled: Boolean(churchId),
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from('church_events').insert({
        church_id:              input.church_id,
        title:                  input.title,
        event_type:             input.event_type,
        start_datetime:         input.start_datetime,
        end_datetime:           input.end_datetime ?? null,
        location:               input.location ?? null,
        description:            input.description ?? null,
        is_public:              input.is_public ?? true,
        scope:                  input.scope ?? 'geral',
        ministry_id:            input.ministry_id ?? null,
        all_day:                input.all_day ?? false,
        is_online:              input.is_online ?? false,
        online_link:            input.online_link ?? null,
        recurrence_type:        input.recurrence_type ?? 'none',
        recurrence_interval:    input.recurrence_interval ?? null,
        recurrence_day_of_week: input.recurrence_day_of_week ?? null,
        recurrence_end_type:    input.recurrence_end_type ?? null,
        recurrence_until:       input.recurrence_until ?? null,
        recurrence_count:       input.recurrence_count ?? null,
        leader_id:              input.leader_id ?? null,
        color:                  input.color ?? '#7C3AED',
        active:                 true,
        recurrence:             null,
      } as any).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['events', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['event_occurrences', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', church_id] })
    },
  })
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      church_id,
      ...updates
    }: Partial<CreateEventInput> & { id: string; church_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from('church_events')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['events', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['event_occurrences', church_id] })
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
      void queryClient.invalidateQueries({ queryKey: ['events', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['event_occurrences', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['agenda', churchId] })
    },
  })
}

export function useCancelOccurrence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      occurrenceId,
      churchId,
      reason,
    }: {
      occurrenceId: string
      churchId: string
      reason?: string
    }) => {
      const { error } = await supabase
        .from('event_occurrences')
        .update({
          is_cancelled: true,
          cancel_reason: reason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', occurrenceId)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['event_occurrences', churchId] })
    },
  })
}
