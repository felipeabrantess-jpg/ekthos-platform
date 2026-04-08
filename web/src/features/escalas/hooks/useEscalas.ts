import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ScheduleWithAssignments, ScheduleStatus } from '@/lib/database.types'

interface EscalasFilters {
  ministryId?: string
  status?: ScheduleStatus
}

export function useEscalas(churchId: string, filters: EscalasFilters = {}) {
  return useQuery({
    queryKey: ['escalas', churchId, filters],
    queryFn: async (): Promise<ScheduleWithAssignments[]> => {
      let query = supabase
        .from('service_schedules')
        .select(`
          *,
          ministries ( id, name ),
          service_schedule_assignments (
            id,
            church_id,
            schedule_id,
            volunteer_id,
            role,
            status,
            notified_at,
            responded_at,
            created_at,
            volunteers (
              id,
              church_id,
              person_id,
              ministry_id,
              role,
              skills,
              availability,
              is_active,
              joined_at,
              created_at,
              updated_at,
              people ( id, name, phone )
            )
          )
        `)
        .eq('church_id', churchId)
        .order('event_date', { ascending: false })

      if (filters.ministryId) {
        query = query.eq('ministry_id', filters.ministryId)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return (data ?? []) as ScheduleWithAssignments[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateScheduleInput {
  church_id: string
  ministry_id: string
  event_name: string
  event_date: string
  event_time?: string
  notes?: string
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateScheduleInput) => {
      const { data, error } = await supabase
        .from('service_schedules')
        .insert({
          church_id: input.church_id,
          ministry_id: input.ministry_id,
          event_name: input.event_name,
          event_date: input.event_date,
          event_time: input.event_time ?? null,
          notes: input.notes ?? null,
          status: 'draft',
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['escalas', church_id] })
    },
  })
}

export function usePublishSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('service_schedules')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['escalas', churchId] })
    },
  })
}

export function useCancelSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('service_schedules')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['escalas', churchId] })
    },
  })
}

interface AddAssignmentInput {
  church_id: string
  schedule_id: string
  volunteer_id: string
  role?: string
}

export function useAddAssignment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddAssignmentInput) => {
      const { data, error } = await supabase
        .from('service_schedule_assignments')
        .insert({
          church_id: input.church_id,
          schedule_id: input.schedule_id,
          volunteer_id: input.volunteer_id,
          role: input.role ?? null,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['escalas', church_id] })
    },
  })
}

interface UpdateAssignmentStatusInput {
  id: string
  churchId: string
  status: 'pending' | 'confirmed' | 'declined' | 'replaced'
}

export function useUpdateAssignmentStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId, status }: UpdateAssignmentStatusInput) => {
      const { error } = await supabase
        .from('service_schedule_assignments')
        .update({ status })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['escalas', churchId] })
    },
  })
}
