import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unitScopeToRpcParam, type UnitScope } from '@/lib/filters/unitScope'

export interface DiscipuladoStage {
  stage_id: string
  stage_name: string
  stage_key: string | null
  order_index: number
  total: number
  entraram: number
  avancaram: number
  parados: number
}

export interface DiscipuladoPerson {
  person_id: string
  nome: string | null
  telefone: string | null
  dias_na_etapa: number
  responsavel: string | null
  atrasado: boolean
  /** Total de pessoas da etapa com os MESMOS filtros (unidade + busca) — igual em todas as linhas */
  total_count: number
}

export function useDiscipuladoOverview(churchId: string, unit: UnitScope, periodDays = 30) {
  return useQuery({
    queryKey: ['discipulado-overview', churchId, unit, periodDays],
    queryFn: async (): Promise<DiscipuladoStage[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_discipulado_overview', {
        p_church_id:   churchId,
        p_period_days: periodDays,
        p_unit_id:     unitScopeToRpcParam(unit),
      })
      if (error) throw new Error(error.message)
      return ((data ?? []) as DiscipuladoStage[]).map(s => ({
        ...s, total: Number(s.total), entraram: Number(s.entraram), avancaram: Number(s.avancaram), parados: Number(s.parados),
      }))
    },
    enabled: Boolean(churchId),
  })
}

export function useDiscipuladoStagePeople(
  churchId: string,
  stageId: string | null,
  unit: UnitScope,
  opts: { limit?: number; offset?: number; search?: string } = {}
) {
  const { limit = 50, offset = 0, search } = opts
  return useQuery({
    queryKey: ['discipulado-stage-people', churchId, stageId, unit, limit, offset, search ?? ''],
    queryFn: async (): Promise<{ items: DiscipuladoPerson[]; total: number }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_discipulado_stage_people', {
        p_church_id: churchId,
        p_stage_id:  stageId,
        p_limit:     limit,
        p_offset:    offset,
        p_search:    search ?? null,
        p_unit_id:   unitScopeToRpcParam(unit),
      })
      if (error) throw new Error(error.message)
      const items = ((data ?? []) as DiscipuladoPerson[]).map(p => ({ ...p, total_count: Number(p.total_count) }))
      return { items, total: items[0]?.total_count ?? 0 }
    },
    placeholderData: prev => prev,
    enabled: Boolean(churchId) && Boolean(stageId),
  })
}
