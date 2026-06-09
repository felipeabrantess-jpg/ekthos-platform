// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePersonStage — mutation para edição inline de people.person_stage
//
// Estratégia: optimistic update com rollback em erro.
//   1. onMutate: cancela refetch, snapshot do cache, aplica update local
//   2. onError:  reverte snapshot
//   3. onSettled: invalida queries para sincronizar com o banco
//
// RLS: people UPDATE exige church_id = auth_church_id() — cobre qualquer
//      membro autenticado da igreja (admin, pastor).
//
// .select('id, person_stage') força Supabase a retornar linhas afetadas —
// sem ele, Supabase retorna {data:null, error:null} mesmo com 0 rows.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonWithStage } from '@/lib/types/joins'

export type PersonStageValue =
  | 'visitante'
  | 'contato'
  | 'frequentador'
  | 'consolidado'
  | 'discipulo'
  | 'lider'

export function useUpdatePersonStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      personId,
      churchId,
      stage,
    }: {
      personId: string
      churchId: string
      stage: PersonStageValue
    }) => {
      const { data, error } = await supabase
        .from('people')
        .update({ person_stage: stage })
        .eq('id', personId)
        .eq('church_id', churchId)
        .select('id, person_stage')
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Sem linhas afetadas — verifique permissões.')
      return data
    },

    onMutate: async ({ personId, churchId, stage }) => {
      // Cancela refetches em voo para não sobrescrever optimistic update
      await queryClient.cancelQueries({ queryKey: ['people', churchId] })

      // Snapshot de todos os caches de people desta igreja (para rollback)
      const snapshots = queryClient.getQueriesData<PersonWithStage[]>({
        queryKey: ['people', churchId],
      })

      // Aplica update otimista em todos os caches matching
      queryClient.setQueriesData<PersonWithStage[]>(
        { queryKey: ['people', churchId] },
        (old) => old?.map((p) => (p.id === personId ? { ...p, person_stage: stage } : p))
      )

      return { snapshots }
    },

    onError: (_err, _vars, ctx) => {
      // Reverte para estado anterior
      ctx?.snapshots.forEach(([key, val]) => queryClient.setQueryData(key, val))
    },

    onSettled: (_data, _err, { churchId }) => {
      // Sincroniza com o banco após mutação (sucesso ou erro)
      void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
    },
  })
}
