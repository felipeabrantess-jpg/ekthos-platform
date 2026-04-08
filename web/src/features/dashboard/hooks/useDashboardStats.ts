import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DashboardStats {
  totalPeople: number
  newThisMonth: number
  activeInteractions: number
  pipelineSummary: Array<{
    stage_name: string
    stage_slug: string
    count: number
    order_index: number
  }>
  recentInteractions: Array<{
    id: string
    type: string
    direction: string
    content: { text?: string }
    created_at: string
    people: { name: string | null } | null
  }>
  monthlyDonations: number
}

export function useDashboardStats(churchId: string) {
  return useQuery({
    queryKey: ['dashboard-stats', churchId],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // Executa queries em paralelo para performance
      const [
        totalPeopleResult,
        newThisMonthResult,
        pipelineResult,
        recentInteractionsResult,
        donationsResult,
      ] = await Promise.all([
        // Total de pessoas ativas
        supabase
          .from('people')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null),

        // Novos este mês
        supabase
          .from('people')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .gte('created_at', firstDayOfMonth),

        // Pessoas por stage (pipeline summary)
        supabase
          .from('person_pipeline')
          .select(`
            stage_id,
            pipeline_stages (
              name,
              slug,
              order_index
            )
          `)
          .eq('church_id', churchId),

        // Interações recentes
        supabase
          .from('interactions')
          .select(`
            id, type, direction, content, created_at,
            people ( name )
          `)
          .eq('church_id', churchId)
          .order('created_at', { ascending: false })
          .limit(8),

        // Doações confirmadas no mês
        supabase
          .from('donations')
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('confirmed_at', firstDayOfMonth),
      ])

      // Agrega pipeline por stage
      const stageCounts: Record<string, { name: string; slug: string; count: number; order_index: number }> = {}
      for (const row of pipelineResult.data ?? []) {
        const stage = row.pipeline_stages as { name: string; slug: string; order_index: number } | null
        if (!stage || !row.stage_id) continue
        if (!stageCounts[row.stage_id]) {
          stageCounts[row.stage_id] = { name: stage.name, slug: stage.slug, count: 0, order_index: stage.order_index }
        }
        stageCounts[row.stage_id].count++
      }

      const pipelineSummary = Object.values(stageCounts)
        .sort((a, b) => a.order_index - b.order_index)
        .map(({ name, slug, count, order_index }) => ({
          stage_name: name,
          stage_slug: slug,
          count,
          order_index,
        }))

      // Soma doações do mês
      const monthlyDonations = (donationsResult.data ?? []).reduce(
        (sum, d) => sum + (d.amount ?? 0),
        0
      )

      return {
        totalPeople: totalPeopleResult.count ?? 0,
        newThisMonth: newThisMonthResult.count ?? 0,
        activeInteractions: recentInteractionsResult.data?.length ?? 0,
        pipelineSummary,
        recentInteractions: (recentInteractionsResult.data ?? []) as DashboardStats['recentInteractions'],
        monthlyDonations,
      }
    },
    staleTime: 1000 * 60 * 3, // 3 minutos
    enabled: Boolean(churchId),
  })
}
