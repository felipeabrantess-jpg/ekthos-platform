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

interface UpdatePersonPipelineStageInput {
  personId: string
  stageId:  string
  churchId: string
}

export function useUpdatePersonPipelineStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personId, stageId, churchId }: UpdatePersonPipelineStageInput) => {
      const now = new Date().toISOString()

      // Verifica se já tem registro em person_pipeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from('person_pipeline')
        .select('id, stage_id')
        .eq('person_id', personId)
        .eq('church_id', churchId)
        .maybeSingle() as { data: { id: string; stage_id: string } | null }

      if (existing) {
        // Atualiza etapa + reseta SLA
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('person_pipeline')
          .update({ stage_id: stageId, entered_at: now, last_activity_at: now })
          .eq('person_id', personId)
          .eq('church_id', churchId)
        if (error) throw new Error((error as { message: string }).message)
      } else {
        // Primeira vez no pipeline
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('person_pipeline')
          .insert({
            church_id:        churchId,
            person_id:        personId,
            stage_id:         stageId,
            entered_at:       now,
            last_activity_at: now,
          })
        if (error) throw new Error((error as { message: string }).message)
      }

      // Histórico (fire-and-forget — não bloqueia UI)
      void (supabase as any)
        .from('pipeline_history')
        .insert({
          church_id:      churchId,
          person_id:      personId,
          from_stage_id:  existing?.stage_id ?? null,
          to_stage_id:    stageId,
          moved_at:       now,
        })
    },

    onSuccess: (_data, { churchId }) => {
      // Invalida AMBAS as views para sincronização bidirecional
      void queryClient.invalidateQueries({ queryKey: ['people',          churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
    },
  })
}
