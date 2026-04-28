import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { VolunteerWithPerson } from '@/lib/types/joins'

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          person_id: input.person_id,
          ministry_id: input.ministry_id,
          role: input.role ?? null,
          skills: input.skills ?? [],
          availability: input.availability ?? { days: [], period: 'any' },
          is_active: true,
        } as any)
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_active: false } as any)
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', churchId] })
    },
  })
}

// ── Per-person hooks (used in PersonDetailPanel) ──────────────────────────────

export interface PersonVolunteer {
  id: string
  ministry_id: string
  role: string | null
  is_active: boolean
  joined_at: string
  ministries: { id: string; name: string } | null
}

/** Voluntários de UMA pessoa específica */
export function usePersonVolunteers(personId: string | undefined, churchId: string | undefined) {
  return useQuery({
    queryKey: ['person_volunteers', personId],
    queryFn: async (): Promise<PersonVolunteer[]> => {
      const { data, error } = await supabase
        .from('volunteers')
        .select('id, ministry_id, role, is_active, joined_at, ministries(id, name)')
        .eq('person_id', personId!)
        .eq('church_id', churchId!)
        .eq('is_active', true)
        .order('joined_at', { ascending: false })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as PersonVolunteer[]
    },
    enabled: Boolean(personId) && Boolean(churchId),
  })
}

/** Atualiza is_volunteer diretamente em people (toggle manual) */
export function useSetPersonVolunteer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      personId,
      churchId,
      isVolunteer,
    }: {
      personId: string
      churchId: string
      isVolunteer: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('people').update({ is_volunteer: isVolunteer } as any)
        .eq('id', personId)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios'] })
      void queryClient.invalidateQueries({ queryKey: ['person_volunteers'] })
      void queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

/** Remove vinculação de uma pessoa a um ministério */
export function useRemovePersonFromMinistry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      volunteerId,
      churchId,
    }: {
      volunteerId: string
      churchId: string
    }) => {
      const { error } = await supabase
        .from('volunteers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_active: false } as any)
        .eq('id', volunteerId)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['person_volunteers'] })
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', churchId] })
    },
  })
}
