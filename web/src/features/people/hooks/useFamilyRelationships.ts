import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface FamilyMember {
  id: string
  name: string | null
  avatar_url: string | null
}

export interface FamilyRelationship {
  id: string
  related_person_id: string
  relationship_type: 'conjuge' | 'filho' | 'pai'
  people: FamilyMember | null
}

// Busca todos os vínculos familiares de uma pessoa (pelo lado person_id)
export function useFamilyRelationships(personId: string | undefined) {
  return useQuery({
    queryKey: ['family-relationships', personId],
    queryFn: async (): Promise<FamilyRelationship[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('family_relationships')
        .select(`
          id,
          related_person_id,
          relationship_type,
          people:related_person_id ( id, name, avatar_url )
        `)
        .eq('person_id', personId!)
      if (error) throw new Error(error.message)
      return (data ?? []) as FamilyRelationship[]
    },
    enabled: Boolean(personId),
  })
}

// Double-write: salva A→B e B→A na mesma operação
export function useSaveFamilyRelationship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      personId,
      churchId,
      relatedPersonId,
      type,
    }: {
      personId: string
      churchId: string
      relatedPersonId: string
      type: 'conjuge' | 'filho'
    }) => {
      const reverseType = type === 'conjuge' ? 'conjuge' : 'pai'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('family_relationships')
        .upsert(
          [
            {
              church_id: churchId,
              person_id: personId,
              related_person_id: relatedPersonId,
              relationship_type: type,
            },
            {
              church_id: churchId,
              person_id: relatedPersonId,
              related_person_id: personId,
              relationship_type: reverseType,
            },
          ],
          { onConflict: 'person_id,related_person_id' }
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { personId, relatedPersonId }) => {
      void queryClient.invalidateQueries({ queryKey: ['family-relationships', personId] })
      void queryClient.invalidateQueries({ queryKey: ['family-relationships', relatedPersonId] })
    },
  })
}

// Remove o vínculo nos dois sentidos (A↔B)
export function useRemoveFamilyRelationship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      personId,
      relatedPersonId,
    }: {
      personId: string
      relatedPersonId: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('family_relationships')
        .delete()
        .or(
          `and(person_id.eq.${personId},related_person_id.eq.${relatedPersonId}),and(person_id.eq.${relatedPersonId},related_person_id.eq.${personId})`
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { personId, relatedPersonId }) => {
      void queryClient.invalidateQueries({ queryKey: ['family-relationships', personId] })
      void queryClient.invalidateQueries({ queryKey: ['family-relationships', relatedPersonId] })
    },
  })
}
