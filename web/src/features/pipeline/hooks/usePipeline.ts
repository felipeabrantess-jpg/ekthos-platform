import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
        .order('created_at', { ascending: false })

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
    mutationFn: async ({ personId, newStageId, churchId }: MovePersonInput) => {
      const now = new Date().toISOString()

      // Get current stage for history record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from('person_pipeline')
        .select('id, stage_id')
        .eq('person_id', personId)
        .eq('church_id', churchId)
        .maybeSingle() as { data: { id: string; stage_id: string } | null }

      if (existing) {
        // Update position — reset entered_at so SLA counts from this move
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('person_pipeline')
          .update({ stage_id: newStageId, entered_at: now, last_activity_at: now })
          .eq('person_id', personId)
          .eq('church_id', churchId)

        if (error) throw new Error((error as Error).message)
      } else {
        // First time entering pipeline
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('person_pipeline')
          .insert({ church_id: churchId, person_id: personId, stage_id: newStageId, entered_at: now, last_activity_at: now, notes: null })

        if (error) throw new Error((error as Error).message)
      }

      // Record history (fire-and-forget — não bloqueia a UI se falhar)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('pipeline_history')
        .insert({ church_id: churchId, person_id: personId, from_stage_id: existing?.stage_id ?? null, to_stage_id: newStageId, moved_at: now })
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
    },
  })
}
