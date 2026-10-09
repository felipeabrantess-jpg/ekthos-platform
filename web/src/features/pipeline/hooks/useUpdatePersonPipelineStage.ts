// ─────────────────────────────────────────────────────────────────────────────
// useUpdatePersonPipelineStage — mutation para trocar etapa pelo seletor inline
//
// Usado pelo <PipelineStageSelector> em /pessoas e no PersonDetailPanel.
// Complementa o useMovePersonToStage (drag-and-drop em /discipulado):
//   - Mesma operação DB (UPDATE ou INSERT em person_pipeline)
//   - Invalida ['people', churchId] + ['pipeline-board', churchId] (bidirecional)
//
// ATENÇÃO: person_pipeline usa (person_id, church_id) como chave natural.
// Há no máximo 1 registro por pessoa/church. Sempre UPDATE se existir, INSERT se não.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { classificationErrorMessage } from '@/features/people/classification'

interface UpdatePersonPipelineStageInput {
  personId: string
  stageId:  string
  churchId: string
}

export function useUpdatePersonPipelineStage() {
  const queryClient = useQueryClient()

  return useMutation({
    // Release 1: a etapa só muda pela RPC person_set_stage (permissão por escopo, no-op se igual,
    // histórico em pipeline_history, bloqueio de etapa contraditória com a classificação).
    mutationFn: async ({ personId, stageId }: UpdatePersonPipelineStageInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('person_set_stage', { p_person_id: personId, p_stage_id: stageId, p_reason: null })
      if (error) throw new Error(classificationErrorMessage(error) ?? (error as { message: string }).message)
      return data
    },

    onSuccess: (_data, { churchId, personId }) => {
      void queryClient.invalidateQueries({ queryKey: ['people',          churchId] })
      void queryClient.invalidateQueries({ queryKey: ['people-page',         churchId] })
      void queryClient.invalidateQueries({ queryKey: ['people-stage-counts', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['person-classification', personId] })
      void queryClient.invalidateQueries({ queryKey: ['person-journey', personId] })
    },
  })
}
