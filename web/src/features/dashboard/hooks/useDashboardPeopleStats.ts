/**
 * useDashboardPeopleStats — KPIs de pessoas do Dashboard numa única RPC canônica
 * (people ⟶ person_pipeline ⟶ pipeline_stages), no escopo de unidade global.
 * Mesmos predicados de /pessoas: deleted_at IS NULL, left_at IS NULL, people.unit_id.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unitScopeToRpcParam, type UnitScope } from '@/lib/filters/unitScope'

export interface StageBucket { stage_id: string; stage_key: string | null; name: string; order_index: number; cnt: number }
export interface NamedCount   { name: string; total: number }
export interface CelulaCount  { id: string; name: string; membros: number }
export interface PessoaAlerta { id: string; nome: string; created_at?: string; etapa?: string | null; last_contact_at?: string | null }

export interface DashboardPeopleStats {
  total: number
  sem_etapa: number
  novos_semana: number
  visitantes_30d: number
  membros: number
  novos_convertidos: number
  novos_convertidos_30d: number
  escola_da_fe: number
  batismos_trimestre: number
  parados: number
  consolidacao_90d: number
  por_etapa: StageBucket[]
  evolucao_12m: Array<{ mes: string; novos: number }>
  visitantes_sem_consolidacao: PessoaAlerta[]
  membros_ausentes: PessoaAlerta[]
  celulas_ativas: number
  celulas_total: number
  celulas_por_trimestre: Array<{ periodo: string; celulas: number }>
  top_celulas: CelulaCount[]
  celulas_em_alerta: CelulaCount[]
  voluntarios_por_ministerio: NamedCount[]
}

const num = (v: unknown) => Number(v ?? 0)

export function useDashboardPeopleStats(churchId: string, unit: UnitScope) {
  return useQuery({
    queryKey: ['dashboard-people-stats', churchId, unit],
    enabled: Boolean(churchId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DashboardPeopleStats> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_dashboard_people_stats', {
        p_church_id: churchId,
        p_unit_id:   unitScopeToRpcParam(unit),
      })
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as Record<string, unknown>
      const arr = <T,>(k: string) => (Array.isArray(d[k]) ? (d[k] as T[]) : [])
      return {
        total:                 num(d.total),
        sem_etapa:             num(d.sem_etapa),
        novos_semana:          num(d.novos_semana),
        visitantes_30d:        num(d.visitantes_30d),
        membros:               num(d.membros),
        novos_convertidos:     num(d.novos_convertidos),
        novos_convertidos_30d: num(d.novos_convertidos_30d),
        escola_da_fe:          num(d.escola_da_fe),
        batismos_trimestre:    num(d.batismos_trimestre),
        parados:               num(d.parados),
        consolidacao_90d:      num(d.consolidacao_90d),
        por_etapa:             arr<StageBucket>('por_etapa').map(s => ({ ...s, cnt: num(s.cnt) })),
        evolucao_12m:          arr<{ mes: string; novos: number }>('evolucao_12m').map(m => ({ ...m, novos: num(m.novos) })),
        visitantes_sem_consolidacao: arr<PessoaAlerta>('visitantes_sem_consolidacao'),
        membros_ausentes:      arr<PessoaAlerta>('membros_ausentes'),
        celulas_ativas:        num(d.celulas_ativas),
        celulas_total:         num(d.celulas_total),
        celulas_por_trimestre: arr<{ periodo: string; celulas: number }>('celulas_por_trimestre').map(c => ({ ...c, celulas: num(c.celulas) })),
        top_celulas:           arr<CelulaCount>('top_celulas').map(c => ({ ...c, membros: num(c.membros) })),
        celulas_em_alerta:     arr<CelulaCount>('celulas_em_alerta').map(c => ({ ...c, membros: num(c.membros) })),
        voluntarios_por_ministerio: arr<NamedCount>('voluntarios_por_ministerio').map(v => ({ ...v, total: num(v.total) })),
      }
    },
  })
}
