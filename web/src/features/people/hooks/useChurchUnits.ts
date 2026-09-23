import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ChurchUnit {
  id: string
  church_id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

/**
 * Data de corte da igreja: pessoas cadastradas antes dela são tratadas como
 * "sem unidade" em /pessoas (regra espelhada em get_unit_counts/get_people_page).
 * Retorna 'YYYY-MM-DD' ou null quando a igreja não usa corte.
 */
export function useUnitCutoff(churchId: string) {
  return useQuery({
    queryKey: ['unit-cutoff', churchId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('churches')
        .select('unit_cutoff_date')
        .eq('id', churchId)
        .single()
      if (error) throw new Error(error.message)
      return (data?.unit_cutoff_date as string | null) ?? null
    },
    enabled: Boolean(churchId),
  })
}

export function useChurchUnits(churchId: string) {
  return useQuery({
    queryKey: ['church-units', churchId],
    queryFn: async (): Promise<ChurchUnit[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('church_units')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as ChurchUnit[]
    },
    enabled: Boolean(churchId),
  })
}
