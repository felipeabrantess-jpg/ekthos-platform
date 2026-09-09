import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AcolhimentoStatus {
  emAtendimentoIds: string[]   // person_ids com journey status='pending'
  atendidaIds:      string[]   // person_ids com ao menos 1 pastoral_contact
  allJourneyIds:    string[]   // todos os person_ids com alguma jornada (para "não atendida")
}

export function useAcolhimentoStatus(churchId: string) {
  return useQuery({
    queryKey: ['acolhimento-status', churchId],
    enabled: Boolean(churchId),
    staleTime: 60_000,
    queryFn: async (): Promise<AcolhimentoStatus> => {
      // 1. Busca todas as jornadas da igreja: id, person_id, status
      const { data: journeys } = await supabase
        .from('acolhimento_journey')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, person_id, status')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('church_id', churchId) as any

      const journeyRows = (journeys ?? []) as Array<{ id: string; person_id: string; status: string }>

      const journeyIdToPersonId = new Map(journeyRows.map(j => [j.id, j.person_id]))

      const emAtendimentoIds = journeyRows
        .filter(j => j.status === 'pending')
        .map(j => j.person_id)

      const allJourneyIds = [...new Set(journeyRows.map(j => j.person_id))]

      // 2. Busca journey_events com pastoral_contact para essa church
      const { data: events } = await supabase
        .from('journey_events')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('journey_id')
        .eq('church_id', churchId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('event_type', 'pastoral_contact') as any

      const eventRows = (events ?? []) as Array<{ journey_id: string }>

      const atendidaIds = [
        ...new Set(
          eventRows
            .map(e => journeyIdToPersonId.get(e.journey_id))
            .filter(Boolean) as string[]
        ),
      ]

      return { emAtendimentoIds, atendidaIds, allJourneyIds }
    },
  })
}

/** Retorna o label e cor do badge de atendimento a partir do status da jornada da pessoa */
export function getCareStatusBadge(journeys: Array<{ status: string }> | null | undefined): {
  label: string
  color: string
  bg: string
} | null {
  if (!journeys || journeys.length === 0) return null
  const pending = journeys.find(j => j.status === 'pending')
  if (pending) return { label: 'Em atendimento', color: '#1e40af', bg: '#dbeafe' }
  const completed = journeys.find(j => j.status === 'completed')
  if (completed) return { label: 'Atendida', color: '#065f46', bg: '#d1fae5' }
  return { label: 'Cancelada', color: '#92400e', bg: '#fef3c7' }
}
