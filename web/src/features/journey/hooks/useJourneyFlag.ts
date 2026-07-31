import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useJourneyFlag() {
  const { churchId } = useAuth()

  return useQuery({
    queryKey: ['feature-flag', 'journey_unification', churchId],
    queryFn: async (): Promise<boolean> => {
      if (!churchId) return false
      const { data } = await supabase
        .from('church_feature_flags')
        .select('enabled')
        .eq('church_id', churchId)
        .eq('flag_key', 'journey_unification')
        .maybeSingle()
      return data?.enabled === true
    },
    enabled: !!churchId,
    staleTime: 60_000,
  })
}
