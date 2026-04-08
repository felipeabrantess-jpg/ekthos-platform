import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MinistryWithLeader } from '@/lib/database.types'

export function useMinisterios(churchId: string) {
  return useQuery({
    queryKey: ['ministerios', churchId],
    queryFn: async (): Promise<MinistryWithLeader[]> => {
      const { data, error } = await supabase
        .from('ministries')
        .select(`
          *,
          leaders:leader_id (
            id,
            church_id,
            person_id,
            role,
            ministry_id,
            is_active,
            created_at,
            updated_at,
            people ( id, name, phone, email )
          )
        `)
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)

      const ministries = (data ?? []) as MinistryWithLeader[]
      const ids = ministries.map((m) => m.id)

      if (ids.length === 0) return ministries

      const { data: volunteerData } = await supabase
        .from('volunteers')
        .select('ministry_id')
        .in('ministry_id', ids)
        .eq('church_id', churchId)
        .eq('is_active', true)

      const countMap: Record<string, number> = {}
      for (const v of volunteerData ?? []) {
        countMap[v.ministry_id] = (countMap[v.ministry_id] ?? 0) + 1
      }

      return ministries.map((m) => ({ ...m, volunteer_count: countMap[m.id] ?? 0 }))
    },
    enabled: Boolean(churchId),
  })
}

interface CreateMinistryInput {
  church_id: string
  name: string
  slug: string
  description?: string
  leaderPersonId?: string
}

export function useCreateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leaderPersonId, ...input }: CreateMinistryInput) => {
      let leaderId: string | null = null

      // If a leader person is provided, create a leader record first
      if (leaderPersonId) {
        const { data: leaderData, error: leaderError } = await supabase
          .from('leaders')
          .insert({
            church_id: input.church_id,
            person_id: leaderPersonId,
            role: 'lider',
            ministry_id: null,
            is_active: true,
          })
          .select('id')
          .single()
        if (leaderError) throw new Error(leaderError.message)
        leaderId = leaderData.id
      }

      const { data: ministry, error } = await supabase
        .from('ministries')
        .insert({ ...input, leader_id: leaderId, is_active: true })
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Update leader's ministry_id back-reference if created
      if (leaderId && ministry) {
        await supabase
          .from('leaders')
          .update({ ministry_id: ministry.id })
          .eq('id', leaderId)
      }

      return ministry
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministerios', church_id] })
    },
  })
}

interface UpdateMinistryInput {
  id: string
  church_id: string
  name?: string
  slug?: string
  description?: string
  leaderPersonId?: string | null
}

export function useUpdateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, leaderPersonId, ...updates }: UpdateMinistryInput) => {
      let extraUpdates: { leader_id?: string | null } = {}

      if (leaderPersonId !== undefined) {
        if (leaderPersonId) {
          // Create new leader record or find existing
          const { data: leaderData, error: leaderError } = await supabase
            .from('leaders')
            .insert({
              church_id,
              person_id: leaderPersonId,
              role: 'lider',
              ministry_id: id,
              is_active: true,
            })
            .select('id')
            .single()
          if (leaderError) throw new Error(leaderError.message)
          extraUpdates = { leader_id: leaderData.id }
        } else {
          extraUpdates = { leader_id: null }
        }
      }

      const { data, error } = await supabase
        .from('ministries')
        .update({ ...updates, ...extraUpdates })
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministerios', church_id] })
    },
  })
}

export function useDeactivateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('ministries')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
    },
  })
}
