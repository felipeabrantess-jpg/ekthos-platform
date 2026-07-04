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
