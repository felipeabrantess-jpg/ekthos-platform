import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PastoralCabinet, Person } from '@/lib/database.types'

export interface CabinetMemberWithPerson extends PastoralCabinet {
  people: Pick<Person, 'id' | 'name' | 'phone' | 'email'> | null
}

export function useGabinete(churchId: string) {
  return useQuery({
    queryKey: ['gabinete', churchId],
    queryFn: async (): Promise<CabinetMemberWithPerson[]> => {
      const { data, error } = await supabase
        .from('pastoral_cabinet')
        .select(`
          *,
          people ( id, name, phone, email )
        `)
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as CabinetMemberWithPerson[]
    },
    enabled: Boolean(churchId),
  })
}

interface AddCabinetMemberInput {
  church_id: string
  person_id: string
  role: string
  bio?: string | null
  photo_url?: string | null
  order_index?: number
}

export function useAddCabinetMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddCabinetMemberInput) => {
      const { data, error } = await supabase
        .from('pastoral_cabinet')
        .insert({
          church_id: input.church_id,
          person_id: input.person_id,
          role: input.role,
          bio: input.bio ?? null,
          photo_url: input.photo_url ?? null,
          order_index: input.order_index ?? 0,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['gabinete', church_id] })
    },
  })
}

interface UpdateCabinetMemberInput {
  id: string
  church_id: string
  role?: string
  bio?: string | null
  photo_url?: string | null
  order_index?: number
}

export function useUpdateCabinetMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateCabinetMemberInput) => {
      const { data, error } = await supabase
        .from('pastoral_cabinet')
        .update(updates)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['gabinete', church_id] })
    },
  })
}

export function useRemoveCabinetMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('pastoral_cabinet')
        .update({ is_active: false })
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['gabinete', churchId] })
    },
  })
}
