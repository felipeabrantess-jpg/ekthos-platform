import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DiscipuladoStage {
  stage_id: string
  stage_name: string
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
}

export function useDiscipuladoOverview(churchId: string, periodDays = 30) {
  return useQuery({
    queryKey: ['discipulado-overview', churchId, periodDays],
    queryFn: async (): Promise<DiscipuladoStage[]> => {
      // @ts-expect-error -- get_discipulado_overview added in migration 20260801; types pending regen
      const { data, error } = await supabase.rpc('get_discipulado_overview', {
        p_church_id:   churchId,
        p_period_days: periodDays,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as DiscipuladoStage[]
    },
    enabled: Boolean(churchId),
  })
}

export function useDiscipuladoStagePeople(
  churchId: string,
  stageId: string | null,
  opts: { limit?: number; offset?: number; search?: string } = {}
) {
  const { limit = 50, offset = 0, search } = opts
  return useQuery({
    queryKey: ['discipulado-stage-people', churchId, stageId, limit, offset, search ?? ''],
    queryFn: async (): Promise<DiscipuladoPerson[]> => {
      // @ts-expect-error -- get_discipulado_stage_people added in migration 20260801; types pending regen
      const { data, error } = await supabase.rpc('get_discipulado_stage_people', {
        p_church_id: churchId,
        p_stage_id:  stageId,
        p_limit:     limit,
        p_offset:    offset,
        p_search:    search ?? null,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as DiscipuladoPerson[]
    },
    enabled: Boolean(churchId) && Boolean(stageId),
  })
}
