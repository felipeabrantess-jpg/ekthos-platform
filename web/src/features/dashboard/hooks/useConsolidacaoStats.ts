// Hook para os cards de consolidação do Dashboard
// Novos esta semana | Em risco | Consolidação 90d | Estágios

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConsolidacaoStats {
  novosSemana: number
  emRisco: number
  consolidacao90d: number      // percentage 0-100
  porStage: Array<{ stage: string; label: string; count: number }>
  totalPeople: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_ORDER = ['visitante', 'contato', 'frequentador', 'consolidado', 'discipulo', 'lider']

export const STAGE_LABELS: Record<string, string> = {
  visitante:    'Visitante',
  contato:      'Contato',
  frequentador: 'Frequentador',
  consolidado:  'Consolidado',
  discipulo:    'Discípulo',
  lider:        'Líder',
}

// Stage → cor (brand tokens do design system)
export const STAGE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  visitante:    { bg: 'bg-cream-dark/60',  text: 'text-ekthos-black/50', bar: '#EDE0CC' },
  contato:      { bg: 'bg-warning-bg',     text: 'text-warning',         bar: '#C4841D' },
  frequentador: { bg: 'bg-brand-50',       text: 'text-brand-700',       bar: '#F25830' },
  consolidado:  { bg: 'bg-brand-50',       text: 'text-brand-600',       bar: '#e13500' },
  discipulo:    { bg: 'bg-success-bg',     text: 'text-success',         bar: '#2D7A4F' },
  lider:        { bg: 'bg-success-bg',     text: 'text-success',         bar: '#1B5E35' },
}

// ── Hook ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export function useConsolidacaoStats(churchId: string) {
  return useQuery({
    queryKey: ['consolidacao-stats', churchId],
    queryFn: async (): Promise<ConsolidacaoStats> => {
      const now = new Date()
      const sevenDaysAgo    = new Date(now.getTime() - 7  * 86400000).toISOString()
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
      const ninetyDaysAgo   = new Date(now.getTime() - 90 * 86400000).toISOString()

      const [novosSemanaRes, emRiscoRes, stages90dRes, allStagesRes] = await Promise.all([

        // Novos esta semana (todos os stages)
        supabase
          .from('people')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .gte('created_at', sevenDaysAgo),

        // Em risco: frequentadores+ sem presença há 14+ dias
        supabase
          .from('people')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .in('person_stage', ['frequentador', 'consolidado', 'discipulo', 'lider'])
          .or(`last_attendance_at.lt.${fourteenDaysAgo},last_attendance_at.is.null`),

        // Consolidação 90d: pessoas criadas nos últimos 90 dias
        supabase
          .from('people')
          .select('person_stage')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .gte('created_at', ninetyDaysAgo),

        // Todos os stages para o gráfico
        supabase
          .from('people')
          .select('person_stage')
          .eq('church_id', churchId)
          .is('deleted_at', null),
      ])

      // Novos esta semana
      const novosSemana = novosSemanaRes.count ?? 0

      // Em risco
      const emRisco = emRiscoRes.count ?? 0

      // Consolidação 90d: pessoas que saíram do estágio "visitante" ou "contato"
      const recent90 = (stages90dRes.data ?? []) as AnyRecord[]
      const total90 = recent90.length
      const convertidos90 = recent90.filter(
        p => p.person_stage !== 'visitante' && p.person_stage !== 'contato' && p.person_stage !== null
      ).length
      const consolidacao90d = total90 > 0 ? Math.round((convertidos90 / total90) * 100) : 0

      // Por stage
      const stageCounts: Record<string, number> = {}
      const allRows = (allStagesRes.data ?? []) as AnyRecord[]
      for (const p of allRows) {
        const s = p.person_stage as string | null
        if (s) stageCounts[s] = (stageCounts[s] ?? 0) + 1
      }
      const porStage = STAGE_ORDER
        .map(s => ({ stage: s, label: STAGE_LABELS[s] ?? s, count: stageCounts[s] ?? 0 }))
        .filter(s => s.count > 0)

      return {
        novosSemana,
        emRisco,
        consolidacao90d,
        porStage,
        totalPeople: allRows.length,
      }
    },
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  })
}
