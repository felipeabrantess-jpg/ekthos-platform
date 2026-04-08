import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonWithStage, Person } from '@/lib/database.types'

interface PeopleFilters {
  search?: string
  stageSlug?: string
  tag?: string
  optout?: boolean
}

// Lista pessoas com stage atual
export function usePeople(churchId: string, filters: PeopleFilters = {}) {
  return useQuery({
    queryKey: ['people', churchId, filters],
    queryFn: async (): Promise<PersonWithStage[]> => {
      let query = supabase
        .from('people')
        .select(`
          *,
          person_pipeline (
            stage_id,
            last_activity_at,
            pipeline_stages ( id, name, slug, order_index )
          )
        `)
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        )
      }

      if (filters.optout !== undefined) {
        query = query.eq('optout', filters.optout)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return (data ?? []) as PersonWithStage[]
    },
    enabled: Boolean(churchId),
  })
}

// Conta total para paginação futura
export function usePeopleCount(churchId: string) {
  return useQuery({
    queryKey: ['people-count', churchId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    enabled: Boolean(churchId),
  })
}

// Cria nova pessoa
interface CreatePersonInput {
  church_id: string
  name: string
  phone?: string
  email?: string
  source: Person['source']
}

export function useCreatePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreatePersonInput) => {
      const { data, error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(input as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      if (!data) return
      void queryClient.invalidateQueries({ queryKey: ['people', data.church_id] })
      void queryClient.invalidateQueries({ queryKey: ['people-count', data.church_id] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', data.church_id] })
    },
  })
}

// Atualiza pessoa
interface UpdatePersonInput {
  id: string
  church_id: string
  name?: string
  phone?: string
  email?: string
  tags?: string[]
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdatePersonInput) => {
      const { data, error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id)
        .eq('church_id', church_id) // segurança multi-tenant
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      if (!data) return
      void queryClient.invalidateQueries({ queryKey: ['people', data.church_id] })
    },
  })
}

// Soft delete
export function useDeletePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('church_id', churchId) // segurança multi-tenant
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['people-count', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
    },
  })
}
