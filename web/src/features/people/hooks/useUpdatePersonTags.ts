// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePersonTags — troca as etiquetas ("Tipos de pessoa") de uma pessoa
//
// Regra: uma pessoa tem NO MÁXIMO UM tipo (etiquetas da categoria 'person_type').
// A gravação é atômica no banco (RPC set_person_tags) e o banco é a última barreira
// (trigger person_tags_enforce_single_type).
//
// Depois de salvar, TODAS as listas que mostram o tipo são atualizadas:
//   ['people-page', churchId, …]  → lista de /pessoas (paginada)   ← era a causa do item 6
//   ['people', churchId, …]       → listas legadas (array simples)
//   ['tag-usage', churchId]       → contagem de uso por etiqueta
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonWithStage, PersonTagRow, Tag } from '@/lib/types/joins'

interface UpdatePersonTagsInput {
  personId: string
  churchId: string
  tagIds: string[]
  /** Etiquetas da igreja — usadas só para montar a atualização imediata da tela */
  allTags?: Tag[]
}

export const PERSON_TYPE_SINGLE_MESSAGE = 'Uma pessoa só pode ter um tipo. Escolha apenas um.'

/** Só é "Tipo de pessoa" (seleção única) a etiqueta cuja categoria diz isso explicitamente. */
export function isPersonTypeTag(tag: Pick<Tag, 'category'>): boolean {
  return tag.category === 'person_type'
}

function friendlyError(message: string): Error {
  if (message.includes('PERSON_TYPE_SINGLE') || message.includes('person_tags_single_person_type')) {
    return new Error(PERSON_TYPE_SINGLE_MESSAGE)
  }
  if (message.includes('INVALID_TAG') || message.includes('PERSON_NOT_FOUND')) {
    return new Error('Não foi possível alterar o tipo desta pessoa. Atualize a página e tente novamente.')
  }
  return new Error(message)
}

type PagedPeople = { items: PersonWithStage[]; total: number }

export function useUpdatePersonTags() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personId, tagIds }: UpdatePersonTagsInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('set_person_tags', {
        p_person_id: personId,
        p_tag_ids:   tagIds,
      })
      if (error) throw friendlyError((error as { message: string }).message)
      return { personId, tagIds }
    },

    onMutate: async ({ personId, churchId, tagIds, allTags }) => {
      await queryClient.cancelQueries({ queryKey: ['people-page', churchId] })
      await queryClient.cancelQueries({ queryKey: ['people', churchId] })

      const pageSnapshots = queryClient.getQueriesData<PagedPeople>({ queryKey: ['people-page', churchId] })
      const listSnapshots = queryClient.getQueriesData<PersonWithStage[]>({ queryKey: ['people', churchId] })

      const withNewTags = (p: PersonWithStage): PersonWithStage => {
        if (p.id !== personId) return p
        const newPersonTags: PersonTagRow[] = tagIds.map((tag_id) => ({
          tag_id,
          tags:
            p.person_tags?.find((pt) => pt.tag_id === tag_id)?.tags ??
            allTags?.find((t) => t.id === tag_id) ??
            null,
        }))
        return { ...p, person_tags: newPersonTags }
      }

      // Atualização imediata da lista paginada de /pessoas (sem esperar o servidor)
      queryClient.setQueriesData<PagedPeople>({ queryKey: ['people-page', churchId] }, (old) =>
        old && Array.isArray(old.items) ? { ...old, items: old.items.map(withNewTags) } : old,
      )
      // Listas legadas (array simples)
      queryClient.setQueriesData<PersonWithStage[]>({ queryKey: ['people', churchId] }, (old) =>
        Array.isArray(old) ? old.map(withNewTags) : old,
      )

      return { pageSnapshots, listSnapshots }
    },

    onError: (_err, _vars, ctx) => {
      ctx?.pageSnapshots.forEach(([key, val]) => queryClient.setQueryData(key, val))
      ctx?.listSnapshots.forEach(([key, val]) => queryClient.setQueryData(key, val))
    },

    onSettled: (_data, _err, { churchId }) => {
      // Re-sincroniza com o banco. Só as consultas montadas na tela são refeitas.
      void queryClient.invalidateQueries({ queryKey: ['people-page', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['tag-usage', churchId] })
    },
  })
}
