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
      if (ministries.length === 0) return ministries

      // Pessoas do ministério = ministry_members (pertencimento canônico). Não conta volunteers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: countData } = await (supabase.rpc as any)('get_ministry_member_counts', { p_church_id: churchId })
      const countMap: Record<string, number> = {}
      for (const r of (countData ?? []) as Array<{ ministry_id: string; cnt: number }>) countMap[r.ministry_id] = Number(r.cnt)

      return ministries.map((m) => ({ ...m, member_count: countMap[m.id] ?? 0 }))
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
  /** Conta de acesso do líder (auth.users.id) — vinculada pelo admin; opcional. */
  leaderUserId?: string | null
}

export function useCreateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leaderPersonId, leaderUserId, ...input }: CreateMinistryInput) => {
      const { data: ministry, error } = await supabase
        .from('ministries')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, leader_id: leaderPersonId ?? null, leader_user_id: leaderUserId ?? null, is_active: true } as any)
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
  /** Conta de acesso do líder; undefined = não altera, null = desvincula. Só admin (trigger no banco). */
  leaderUserId?: string | null
}

export function useUpdateMinistry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, leaderPersonId, leaderUserId, ...updates }: UpdateMinistryInput) => {
      const leaderUpdate = leaderPersonId !== undefined ? { leader_id: leaderPersonId ?? null } : {}
      const accountUpdate = leaderUserId !== undefined ? { leader_user_id: leaderUserId ?? null } : {}

      const { data, error } = await supabase
        .from('ministries')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ ...updates, ...leaderUpdate, ...accountUpdate } as any)
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

// ── Voluntários (membros) de um ministério ───────────────────────────────────

export interface MinistryVolunteer {
  id: string
  person_id: string
  role: string | null
  joined_at: string
  people: { id: string; name: string | null; phone: string | null; email: string | null } | null
}

export function useMinistryVolunteers(churchId: string, ministryId: string | null) {
  return useQuery({
    queryKey: ['ministry-volunteers', churchId, ministryId],
    enabled: Boolean(churchId && ministryId),
    queryFn: async (): Promise<MinistryVolunteer[]> => {
      const { data, error } = await supabase
        .from('volunteers')
        .select('id, person_id, role, joined_at, people:person_id ( id, name, phone, email )')
        .eq('church_id', churchId)
        .eq('ministry_id', ministryId!)
        .eq('is_active', true)
        .order('joined_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as MinistryVolunteer[]
    },
  })
}

export function useAddVolunteer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ churchId, ministryId, personId }: { churchId: string; ministryId: string; personId: string }) => {
      // Reativa se já existiu (UNIQUE church_id+person_id+ministry_id)
      const { error } = await supabase
        .from('volunteers')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ church_id: churchId, ministry_id: ministryId, person_id: personId, is_active: true } as any, {
          onConflict: 'church_id,person_id,ministry_id',
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, { churchId, ministryId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministry-volunteers', churchId, ministryId] })
      void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
    },
  })
}

export function useRemoveVolunteer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ churchId, ministryId, volunteerId }: { churchId: string; ministryId: string; volunteerId: string }) => {
      const { error } = await supabase
        .from('volunteers')
        .delete()
        .eq('id', volunteerId)
        .eq('church_id', churchId)
        .eq('ministry_id', ministryId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, { churchId, ministryId }) => {
      void queryClient.invalidateQueries({ queryKey: ['ministry-volunteers', churchId, ministryId] })
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
