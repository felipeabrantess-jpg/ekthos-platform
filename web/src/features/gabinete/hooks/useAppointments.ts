import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Appointment {
  id: string
  church_id: string
  person_id: string
  pastor_id: string | null
  appointment_type: string
  scheduled_at: string
  notes: string | null
  status: 'solicitado' | 'confirmado' | 'realizado' | 'cancelado'
  created_at: string
  updated_at: string
  people?: { id: string; name: string | null } | null
  pastor?: { id: string; name: string | null } | null
}

export function useAppointments(churchId: string, personId?: string) {
  return useQuery({
    queryKey: ['pastoral_appointments', churchId, personId ?? null],
    queryFn: async () => {
      let query = supabase
        .from('pastoral_appointments')
        .select('*, people(id, name), pastor:profiles!pastor_id(id, name)')
        .eq('church_id', churchId)
        .order('scheduled_at', { ascending: false })
      if (personId) query = query.eq('person_id', personId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Appointment[]
    },
    enabled: !!churchId,
  })
}

export interface AppointmentInput {
  church_id: string
  person_id: string
  pastor_id?: string | null
  appointment_type: string
  scheduled_at: string
  notes?: string | null
  status?: string
}

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AppointmentInput) => {
      const { data, error } = await supabase
        .from('pastoral_appointments')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['pastoral_appointments', vars.church_id] })
    },
  })
}

export interface AppointmentUpdate {
  id: string
  church_id: string
  pastor_id?: string | null
  appointment_type?: string
  scheduled_at?: string
  notes?: string | null
  status?: string
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...rest }: AppointmentUpdate) => {
      const { error } = await supabase
        .from('pastoral_appointments')
        .update(rest)
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['pastoral_appointments', vars.church_id] })
    },
  })
}
