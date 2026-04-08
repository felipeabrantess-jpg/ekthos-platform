import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { VolunteerWithPerson } from '@/lib/database.types'

export function useVoluntarios(churchId: string, ministryId?: string) {
  return useQuery({
    queryKey: ['voluntarios', churchId, ministryId],
    queryFn: async (): Promise<VolunteerWithPerson[]> => {
      let query = supabase
        .from('volunteers')
        .select(`
          *,
          people ( id, name, phone ),
          ministries ( id, name )
        `)
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (ministryId) {
        query = query.eq('ministry_id', ministryId)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return (data ?? []) as VolunteerWithPerson[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateVolunteerInput {
  church_id: string
  person_id: string
  ministry_id: string
  role?: string
  skills?: string[]
  availability?: { days: string[]; period: string }
}

export function useCreateVolunteer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateVolunteerInput) => {
      const { data, error } = await supabase
        .from('volunteers')
        .insert({
          church_id: input.church_id,
          person_id: input.person_id,
          ministry_id: input.ministry_id,
          role: input.role ?? null,
          skills: input.skills ?? [],
          availability: input.availability ?? { days: [], period: '' },
          is_active: true,
          joined_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', church_id] })
    },
  })
}

interface UpdateVolunteerInput {
  id: string
  church_id: string
  role?: string
  skills?: string[]
  availability?: { days: string[]; period: string }
  ministry_id?: string
}

export function useUpdateVolunteer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateVolunteerInput) => {
      const { data, error } = await supabase
        .from('volunteers')
        .update(updates)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', church_id] })
    },
  })
}

export function useDeactivateVolunteer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('volunteers')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', churchId] })
    },
  })
}
