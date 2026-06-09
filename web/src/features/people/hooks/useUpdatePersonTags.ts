// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePersonTags — substitui TODAS as flags de uma pessoa atomicamente
//
// Estratégia: DELETE todos + INSERT selecionados.
// UNIQUE(person_id, tag_id) garante sem duplicatas.
// RLS person_tags_church ALL (church_id = auth_church_id()) cobre ambas ops.
//
// Optimistic update: atualiza cache ['people', churchId] imediatamente,
// reverte em caso de erro e invalida para re-sync com banco.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonWithStage, PersonTagRow } from '@/lib/types/joins'

interface UpdatePersonTagsInput {
  personId: string
  churchId: string
  tagIds: string[]
}

export function useUpdatePersonTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personId, churchId, tagIds }: UpdatePersonTagsInput) => {
      // 1. Remove todas as atribuições atuais para esta pessoa
      const { error: delError } = await supabase
        .from('person_tags')
        .delete()
        .eq('person_id', personId)
        .eq('church_id', churchId)

      if (delError) throw new Error(delError.message)

      // 2. Insere as novas (se houver)
      if (tagIds.length > 0) {
        const rows = tagIds.map((tag_id) => ({
          person_id: personId,
          tag_id,
          church_id: churchId,
        }))
        const { error: insError } = await supabase
          .from('person_tags')
          .insert(rows)

        if (insError) throw new Error(insError.message)
      }

      return { personId, tagIds }
    },

    onMutate: async ({ personId, churchId, tagIds }) => {
      await queryClient.cancelQueries({ queryKey: ['people', churchId] })

      const snapshots = queryClient.getQueriesData<PersonWithStage[]>({
        queryKey: ['people', churchId],
      })

      // Optimistic: atualiza person_tags no cache (só tag_id, sem tags join — suficiente para badges)
      queryClient.setQueriesData<PersonWithStage[]>(
        { queryKey: ['people', churchId] },
        (old) =>
          old?.map((p) => {
            if (p.id !== personId) return p
            const newPersonTags: PersonTagRow[] = tagIds.map((tag_id) => ({
              tag_id,
              tags: p.person_tags?.find((pt) => pt.tag_id === tag_id)?.tags ?? null,
            }))
            return { ...p, person_tags: newPersonTags }
          })
      )

      return { snapshots }
    },

    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, val]) => queryClient.setQueryData(key, val))
    },

    onSettled: (_data, _err, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
    },
  })
}
