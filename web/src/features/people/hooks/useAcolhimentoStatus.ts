import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { UNIT_ALL, unitScopeToRpcParam, type UnitScope } from '@/lib/filters/unitScope'

export interface AcolhimentoStatusCounts {
  naoAtendida:   number
  emAtendimento: number
  atendida:      number
  semContato48h: number
}

/** Contadores de atendimento via RPC server-side, no mesmo escopo de unidade da lista. */
export function useAcolhimentoStatus(churchId: string, unit: UnitScope = UNIT_ALL) {
  return useQuery({
    queryKey: ['acolhimento-status-counts', churchId, unit],
    enabled: Boolean(churchId),
    staleTime: 60_000,
    queryFn: async (): Promise<AcolhimentoStatusCounts> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_care_status_counts', {
        p_church_id: churchId,
        p_unit_id:   unitScopeToRpcParam(unit),
      })
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as Record<string, number>
      return {
        naoAtendida:   d.nao_atendida    ?? 0,
        emAtendimento: d.em_atendimento  ?? 0,
        atendida:      d.atendida        ?? 0,
        semContato48h: d.sem_contato_48h ?? 0,
      }
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
