/**
 * usePeoplePage — ÚNICA fonte de lista + contador de /pessoas.
 *
 * Toda combinação de filtros passa pela RPC canônica `get_people_page`
 * (people ⟶ person_pipeline ⟶ pipeline_stages). Contador = `total_count`
 * da mesma consulta; paginação deriva do mesmo número.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unitScopeToRpcParam, type UnitScope } from '@/lib/filters/unitScope'
import type { PersonWithStage } from '@/lib/types/joins'

export const PEOPLE_PAGE_SIZE = 50

export type CareStatus = 'nao_atendida' | 'em_atendimento' | 'atendida' | 'sem_contato_48h'

/** Marcador para "pessoas sem etapa no pipeline" (p_stage_key = '__none'). */
export const STAGE_KEY_NONE = '__none'

export interface PeoplePageFilters {
  unit: UnitScope
  /** pipeline_stages.stage_key, STAGE_KEY_NONE, ou undefined = todas as etapas */
  stageKey?: string
  careStatus?: CareStatus
  source?: string
  tagId?: string
  search?: string
  /** 1–12: aniversariantes do mês (ordena por birth_day) */
  birthMonth?: number
  /** Cadastro (created_at) >= / <= YYYY-MM-DD */
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}

export interface PeoplePageResult {
  items: PersonWithStage[]
  total: number
}

export function buildPeoplePageArgs(churchId: string, f: PeoplePageFilters) {
  const pageSize = f.pageSize ?? PEOPLE_PAGE_SIZE
  const page     = f.page ?? 0
  return {
    p_church_id:    churchId,
    p_unit_id:      unitScopeToRpcParam(f.unit),
    p_stage_key:    f.stageKey    ?? null,
    p_care_status:  f.careStatus  ?? null,
    p_source:       f.source      ?? null,
    p_tag_id:       f.tagId       ?? null,
    p_search:       f.search?.trim() || null,
    p_birth_month:  f.birthMonth  ?? null,
    p_created_from: f.createdFrom || null,
    p_created_to:   f.createdTo   || null,
    p_limit:        pageSize,
    p_offset:       page * pageSize,
  }
}

export async function fetchPeoplePage(churchId: string, f: PeoplePageFilters): Promise<PeoplePageResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('get_people_page', buildPeoplePageArgs(churchId, f))
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ row_data: Record<string, unknown>; total_count: number | string }>
  return {
    items: rows.map(r => r.row_data as unknown as PersonWithStage),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  }
}

export function usePeoplePage(churchId: string, filters: PeoplePageFilters, enabled = true) {
  return useQuery({
    queryKey: ['people-page', churchId, filters],
    enabled: Boolean(churchId) && enabled,
    placeholderData: prev => prev,
    queryFn: () => fetchPeoplePage(churchId, filters),
  })
}

// ── Badges das abas: mesmos predicados da lista (unidade + deleted/left) ─────

export interface StageCount {
  stage_id: string
  stage_key: string | null
  name: string
  order_index: number
  cnt: number
}

export interface PeopleStageCounts {
  total: number
  aniversarios: number
  sem_etapa: number
  stages: StageCount[]
}

export function usePeopleStageCounts(churchId: string, unit: UnitScope) {
  return useQuery({
    queryKey: ['people-stage-counts', churchId, unit],
    enabled: Boolean(churchId),
    staleTime: 60_000,
    queryFn: async (): Promise<PeopleStageCounts> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_people_stage_counts', {
        p_church_id: churchId,
        p_unit_id:   unitScopeToRpcParam(unit),
      })
      if (error) throw new Error(error.message)
      const d = (data ?? {}) as Partial<PeopleStageCounts>
      return {
        total:        Number(d.total ?? 0),
        aniversarios: Number(d.aniversarios ?? 0),
        sem_etapa:    Number(d.sem_etapa ?? 0),
        stages:       (d.stages ?? []).map(s => ({ ...s, cnt: Number(s.cnt) })),
      }
    },
  })
}
