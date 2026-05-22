import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MinistryWithLeader } from '@/lib/types/joins'

export function useMinisterios(churchId: string) {
  return useQuery({
    queryKey: ['ministerios', churchId],
    queryFn: async (): Promise<MinistryWithLeader[]> => {
      const { data, error } = await supabase
        .from('ministries')
        .select(`
          *,
          people:leader_id ( id, name, phone, email )
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
      const { data: ministry, error } = await supabase
        .from('ministries')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, leader_id: leaderPersonId ?? null, is_active: true } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
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
      const leaderUpdate = leaderPersonId !== undefined ? { leader_id: leaderPersonId ?? null } : {}

      const { data, error } = await supabase
        .from('ministries')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ ...updates, ...leaderUpdate } as any)
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

export function useDeleteMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('ministries')
        .delete()
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
    },
  })
}

export function useDeactivateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('ministries')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_active: false } as any)
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
    },
  })
}
