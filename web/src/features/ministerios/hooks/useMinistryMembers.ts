// ============================================================
// Pessoas do Ministério — pertencimento canônico em ministry_members
//   people ⟷ ministry_members ⟷ ministries
// Nunca toca em `volunteers` (voluntariado é estrutura independente).
// Toda escrita passa por RPC (autorização no banco: can_manage_ministry).
// ============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args)

export interface MinistryMember {
  person_id: string
  name: string
  phone: string | null
  email: string | null
  role: string
  since: string
}

export function useMinistryMembers(ministryId: string | null | undefined) {
  return useQuery({
    queryKey: ['ministry-members', ministryId],
    queryFn: async (): Promise<MinistryMember[]> => {
      if (!ministryId) return []
      const { data, error } = await rpc('get_ministry_members', { p_ministry_id: ministryId })
      if (error) throw new Error(error.message)
      return (data ?? []) as MinistryMember[]
    },
    enabled: !!ministryId,
    staleTime: 15_000,
  })
}

/** Contagem de pessoas por ministério (ministry_members), para os cards. */
export function useMinistryMemberCounts(churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['ministry-member-counts', churchId],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!churchId) return {}
      const { data, error } = await rpc('get_ministry_member_counts', { p_church_id: churchId })
      if (error) throw new Error(error.message)
      const map: Record<string, number> = {}
      for (const r of (data ?? []) as Array<{ ministry_id: string; cnt: number }>) map[r.ministry_id] = Number(r.cnt)
      return map
    },
    enabled: !!churchId,
    staleTime: 30_000,
  })
}

/** Ids dos ministérios que o usuário logado pode gerir (admin → todos; líder → os seus). */
export function useMyManagedMinistries(enabled = true) {
  return useQuery({
    queryKey: ['my-managed-ministries'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await rpc('get_my_managed_ministries')
      if (error) throw new Error(error.message)
      return new Set(((data ?? []) as Array<{ ministry_id: string }>).map(r => r.ministry_id))
    },
    enabled,
    staleTime: 60_000,
  })
}

export interface ChurchAccount {
  user_id: string
  email: string
  name: string
  role: string
}

/** Contas da igreja — só admin/admin_departments (RPC lança FORBIDDEN para os demais). */
export function useChurchAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['church-accounts'],
    queryFn: async (): Promise<ChurchAccount[]> => {
      const { data, error } = await rpc('get_church_accounts')
      if (error) throw new Error(error.message)
      return (data ?? []) as ChurchAccount[]
    },
    enabled,
    staleTime: 60_000,
  })
}

// ── Vínculos de UMA pessoa (Editar Pessoa → Ministérios) ──────
// Mesma relação ministry_members vista pelo lado da pessoa. can_manage diz se o
// usuário logado pode alterar aquele vínculo (chip editável) ou não (bloqueado).

export interface PersonMinistry {
  ministry_id:   string
  ministry_name: string
  can_manage:    boolean
  since:         string
}

export function usePersonMinistries(personId: string | null | undefined) {
  return useQuery({
    queryKey: ['person-ministries', personId],
    queryFn: async (): Promise<PersonMinistry[]> => {
      if (!personId) return []
      const { data, error } = await rpc('get_person_ministries', { p_person_id: personId })
      if (error) throw new Error(error.message)
      return (data ?? []) as PersonMinistry[]
    },
    enabled: !!personId,
    staleTime: 15_000,
  })
}

export interface SyncResult {
  person_id: string
  added: string[]
  removed: string[]
  kept: string[]
  skipped: string[]
}

/** Sincroniza por IDs; o banco só adiciona/remove nos ministérios que o chamador gere. */
export function useSyncPersonMinistries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ personId, ministryIds }: { personId: string; ministryIds: string[]; churchId: string }) => {
      const { data, error } = await rpc('sync_person_ministries', { p_person_id: personId, p_ministry_ids: ministryIds })
      if (error) throw new Error(error.message)
      return data as SyncResult
    },
    onSuccess: (res, { personId, churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['person-ministries', personId] })
      void queryClient.invalidateQueries({ queryKey: ['ministry-member-counts', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
      for (const id of [...(res?.added ?? []), ...(res?.removed ?? [])]) {
        void queryClient.invalidateQueries({ queryKey: ['ministry-members', id] })
      }
    },
  })
}

function useInvalidateMembers() {
  const queryClient = useQueryClient()
  return (ministryId: string, churchId: string, personId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['ministry-members', ministryId] })
    void queryClient.invalidateQueries({ queryKey: ['ministry-member-counts', churchId] })
    void queryClient.invalidateQueries({ queryKey: ['ministerios', churchId] })
    // Bidirecional: o lado "Editar Pessoa" lê a mesma relação
    if (personId) void queryClient.invalidateQueries({ queryKey: ['person-ministries', personId] })
  }
}

export function useAddMinistryMember() {
  const invalidate = useInvalidateMembers()
  return useMutation({
    mutationFn: async ({ ministryId, personId }: { ministryId: string; personId: string; churchId: string }) => {
      const { data, error } = await rpc('ministry_member_add', { p_ministry_id: ministryId, p_person_id: personId })
      if (error) throw new Error(error.message)
      return data as { inserted: boolean }
    },
    onSuccess: (_d, { ministryId, churchId, personId }) => invalidate(ministryId, churchId, personId),
  })
}

export function useRemoveMinistryMember() {
  const invalidate = useInvalidateMembers()
  return useMutation({
    mutationFn: async ({ ministryId, personId }: { ministryId: string; personId: string; churchId: string }) => {
      const { data, error } = await rpc('ministry_member_remove', { p_ministry_id: ministryId, p_person_id: personId })
      if (error) throw new Error(error.message)
      return data as { removed: boolean }
    },
    onSuccess: (_d, { ministryId, churchId, personId }) => invalidate(ministryId, churchId, personId),
  })
}
