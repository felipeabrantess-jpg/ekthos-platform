import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { UNIT_ALL, type UnitScope } from '@/lib/filters/unitScope'
import { buildPeoplePageArgs, type PeoplePageFilters } from './usePeoplePage'

export interface AcolhimentoStatusCounts {
  /** ESTADOS (mutuamente exclusivos; somam `total`) */
  naoAtendida:   number
  emAtendimento: number
  atendida:      number
  cancelado:     number
  total:         number
  /** ALERTA operacional (sobrepõe um estado; NÃO entra na soma) */
  semContato48h: number
  /** Threshold do alerta em horas, definido no banco (care_alert_threshold) */
  alertThresholdHours: number
}

/** Filtros do contador = filtros da lista, menos o próprio filtro de atendimento e a paginação. */
export type CareCountFilters = Omit<PeoplePageFilters, 'careStatus' | 'page' | 'pageSize'>

/**
 * Contadores de atendimento via RPC server-side, no MESMO universo da lista
 * (unidade, etapa, origem, busca, período…): get_care_status_counts usa o
 * mesmo people_filter_base de get_people_page. Nenhuma regra é recalculada aqui.
 */
export function useAcolhimentoStatus(churchId: string, filters: CareCountFilters | UnitScope = UNIT_ALL) {
  const f: CareCountFilters = typeof filters === 'object' && filters !== null && 'unit' in filters ? filters : { unit: filters as UnitScope }
  return useQuery({
    queryKey: ['acolhimento-status-counts', churchId, f],
    enabled: Boolean(churchId),
    staleTime: 60_000,
    placeholderData: prev => prev,
    queryFn: async (): Promise<AcolhimentoStatusCounts> => {
      // Mesmos argumentos da lista, sem p_care_status / p_limit / p_offset
      const { p_care_status: _c, p_limit: _l, p_offset: _o, ...args } = buildPeoplePageArgs(churchId, { ...f, careStatus: undefined })
      void _c; void _l; void _o
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_care_status_counts', args)
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as Record<string, number>
      return {
        naoAtendida:   d.nao_atendida    ?? 0,
        cancelado:     d.cancelado       ?? 0,
        total:         d.total           ?? 0,
        emAtendimento: d.em_atendimento  ?? 0,
        atendida:      d.atendida        ?? 0,
        semContato48h: d.sem_contato_48h ?? 0,
        alertThresholdHours: d.alert_threshold_hours ?? 48,
      }
    },
  })
}

export type CareState = 'nao_atendida' | 'em_atendimento' | 'atendida' | 'cancelado'

/**
 * Etiqueta do estado operacional de atendimento. Fonte ÚNICA: people.care_state
 * (calculado no banco por person_care_state — mesma regra do contador e do filtro).
 * 'nao_atendida' não tem etiqueta (como antes).
 */
export function getCareStatusBadge(careState: string | null | undefined): {
  label: string
  color: string
  bg: string
} | null {
  switch (careState) {
    case 'em_atendimento': return { label: 'Em atendimento', color: '#1e40af', bg: '#dbeafe' }
    case 'atendida':       return { label: 'Atendida',       color: '#065f46', bg: '#d1fae5' }
    case 'cancelado':      return { label: 'Cancelado',      color: '#92400e', bg: '#fef3c7' }
    default:               return null
  }
}
