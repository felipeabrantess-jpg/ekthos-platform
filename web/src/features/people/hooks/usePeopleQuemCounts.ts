// ============================================================
// Números da fileira "Quem" e das etapas em "Mais filtros" (tela Pessoas simplificada, 28/10).
// Todos saem da MESMA contagem do STATUS (get_care_status_counts sobre people_filter_base), com os mesmos
// filtros da lista — só variando a classificação (Quem) ou a etapa. Nenhuma regra é recalculada aqui:
// por isso Visitantes + Membros + Não classificados = Todos, sempre.
// ============================================================
import { useQueries } from '@tanstack/react-query'
import { careCountsKey, fetchCareCounts, type CareCountFilters } from './useAcolhimentoStatus'

export type { CareCountFilters }
export type QuemKey = 'todos' | 'visitor' | 'member' | 'none'
const QUEM: QuemKey[] = ['todos', 'visitor', 'member', 'none']

/** Total de cada botão de "Quem" com os filtros `base` (a classificação de `base` é ignorada). */
export function usePeopleQuemCounts(churchId: string, base: CareCountFilters): Partial<Record<QuemKey, number>> & { stale: boolean } {
  const results = useQueries({
    queries: QUEM.map((k) => {
      const f: CareCountFilters = { ...base, classification: k === 'todos' ? undefined : k }
      return {
        queryKey: careCountsKey(churchId, f),
        queryFn: () => fetchCareCounts(churchId, f),
        enabled: Boolean(churchId),
        staleTime: 60_000,
        placeholderData: <T,>(prev: T) => prev,
      }
    }),
  })
  const out: Partial<Record<QuemKey, number>> & { stale: boolean } = { stale: results.some(r => r.isPlaceholderData) }
  QUEM.forEach((k, i) => { out[k] = results[i].data?.total })
  return out
}

/** Total por etapa com os mesmos filtros (a etapa de `base` é substituída). Só consulta com a janela aberta. */
export function useStageFilterCounts(churchId: string, base: CareCountFilters, stageKeys: string[], enabled: boolean): Record<string, number | undefined> {
  const results = useQueries({
    queries: stageKeys.map((sk) => {
      const f: CareCountFilters = { ...base, stageKey: sk }
      return {
        queryKey: careCountsKey(churchId, f),
        queryFn: () => fetchCareCounts(churchId, f),
        enabled: Boolean(churchId) && enabled,
        staleTime: 60_000,
      }
    }),
  })
  const out: Record<string, number | undefined> = {}
  stageKeys.forEach((sk, i) => { out[sk] = results[i].data?.total })
  return out
}
