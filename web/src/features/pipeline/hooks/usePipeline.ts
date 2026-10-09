import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { classificationErrorMessage } from '@/features/people/classification'
import type { PipelineStage, PersonWithStage } from '@/lib/types/joins'

// Returns stages ordered by order_index
export function usePipelineStages(churchId: string) {
  return useQuery({
    queryKey: ['pipeline-stages', churchId],
    queryFn: async (): Promise<PipelineStage[]> => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })

      if (error) throw new Error(error.message)
      return data ?? []
    },
    enabled: Boolean(churchId),
  })
}

// Returns people grouped by stage_id
export function usePipelineBoard(churchId: string) {
  return useQuery({
    queryKey: ['pipeline-board', churchId],
    queryFn: async (): Promise<Record<string, PersonWithStage[]>> => {
      const { data, error } = await supabase
        .from('people')
        .select(`
          *,
          person_pipeline (
            stage_id,
            entered_at,
            last_activity_at,
            loss_reason,
            pipeline_stages ( id, name, slug, order_index, sla_hours )
          )
        `)
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .is('left_at', null)
        .order('name_sort', { ascending: true })

      if (error) throw new Error(error.message)

      const people = (data ?? []) as PersonWithStage[]
      const grouped: Record<string, PersonWithStage[]> = {}

      for (const person of people) {
        const pipeline = person.person_pipeline?.[0]
        if (pipeline?.stage_id) {
          if (!grouped[pipeline.stage_id]) {
            grouped[pipeline.stage_id] = []
          }
          grouped[pipeline.stage_id].push(person)
        }
      }

      return grouped
    },
    enabled: Boolean(churchId),
  })
}

interface MovePersonInput {
  personId: string
  newStageId: string
  churchId: string
}

// Moves a person to a different stage and records history
export function useMovePersonToStage() {
  const queryClient = useQueryClient()

  return useMutation({
    // Release 1: arrastar no Kanban chama person_set_stage (permissão por escopo, no-op se igual,
    // histórico automático, CLASSIFICATION_REQUIRED/STAGE_CONFLICT quando a etapa contradiz a classificação).
    mutationFn: async ({ personId, newStageId }: MovePersonInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('person_set_stage', { p_person_id: personId, p_stage_id: newStageId, p_reason: null })
      if (error) throw new Error(classificationErrorMessage(error) ?? (error as Error).message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
      // Sincronização bidirecional: atualiza a lista /pessoas também
      void queryClient.invalidateQueries({ queryKey: ['people',          churchId] })
    },
  })
}
