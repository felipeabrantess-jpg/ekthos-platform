/**
 * Hooks da classificação única (Release 1).
 * Leitura: person_classification (fonte única). Escrita: person_set_classification / person_set_stage.
 * Nenhuma regra é recalculada aqui; o banco decide permissão, confirmação, justificativa e HAS_ROLES.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonClassification } from '../classification'

export function usePersonClassification(personId: string | undefined) {
  return useQuery({
    queryKey: ['person-classification', personId],
    enabled: !!personId,
    staleTime: 15_000,
    queryFn: async (): Promise<PersonClassification | null> => {
      if (!personId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('person_classification', { p_person_id: personId })
      if (error) throw new Error(error.message)
      return (data ?? null) as PersonClassification | null
    },
  })
}

/** Invalida tudo que apresenta classificação/etapa: Pessoas, contadores, Atendimento, Discipulado, Kanban, Dashboard. */
export function invalidateClassification(queryClient: ReturnType<typeof useQueryClient>, churchId: string | null | undefined, personId?: string) {
  if (personId) {
    void queryClient.invalidateQueries({ queryKey: ['person-classification', personId] })
    void queryClient.invalidateQueries({ queryKey: ['person-atendimento', personId] })
    void queryClient.invalidateQueries({ queryKey: ['person-timeline', personId] })
    void queryClient.invalidateQueries({ queryKey: ['person-journey', personId] })
  }
  for (const key of ['people', 'people-page', 'people-stage-counts', 'acolhimento-status-counts', 'pipeline-board', 'pipeline-stages', 'dashboard-stats', 'discipulado-overview', 'discipulado-stage-people', 'care-queue']) {
    void queryClient.invalidateQueries({ queryKey: churchId ? [key, churchId] : [key] })
  }
}

export interface SetClassificationArgs {
  personId: string
  churchId: string
  value: 'visitor' | 'member' | 'none'
  reason?: string
  confirmed: boolean
}

export function useSetClassification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (a: SetClassificationArgs) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('person_set_classification', {
        p_person_id: a.personId, p_value: a.value, p_reason: a.reason ?? null, p_confirmed: a.confirmed,
      })
      if (error) throw new Error(error.message)
      return data as PersonClassification & { changed: boolean }
    },
    onSuccess: (_d, a) => invalidateClassification(queryClient, a.churchId, a.personId),
  })
}

export interface SetStageArgs { personId: string; churchId: string; stageId: string; reason?: string }

export function useSetStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (a: SetStageArgs) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('person_set_stage', {
        p_person_id: a.personId, p_stage_id: a.stageId, p_reason: a.reason ?? null,
      })
      if (error) throw new Error(error.message)
      return data as PersonClassification & { changed: boolean }
    },
    onSuccess: (_d, a) => invalidateClassification(queryClient, a.churchId, a.personId),
  })
}
