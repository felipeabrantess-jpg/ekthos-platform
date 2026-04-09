import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PipelineStage, PersonWithStage } from '@/lib/database.types'

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
      const { data: existing } = await supabase
        .from('person_pipeline')
        .select('id, stage_id')
        .eq('person_id', personId)
        .eq('church_id', churchId)
        .maybeSingle()

      if (existing) {
        // Update position — reset entered_at so SLA counts from this move
        const { error } = await supabase
          .from('person_pipeline')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ stage_id: newStageId, entered_at: now, last_activity_at: now } as any)
          .eq('person_id', personId)
          .eq('church_id', churchId)

        if (error) throw new Error(error.message)
      } else {
        // First time entering pipeline
        const { error } = await supabase
          .from('person_pipeline')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ church_id: churchId, person_id: personId, stage_id: newStageId, entered_at: now, last_activity_at: now, notes: null } as any)

        if (error) throw new Error(error.message)
      }

      // Record history (fire-and-forget — não bloqueia a UI se falhar)
      await supabase
        .from('pipeline_history')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ church_id: churchId, person_id: personId, from_stage_id: existing?.stage_id ?? null, to_stage_id: newStageId, moved_at: now } as any)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
    },
  })
}
