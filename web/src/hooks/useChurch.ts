import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface ChurchBranding {
  id: string
  name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
}

export function useChurch() {
  const { churchId } = useAuth()

  return useQuery({
    queryKey: ['church-branding', churchId],
    queryFn: async (): Promise<ChurchBranding | null> => {
      if (!churchId) return null
      const { data, error } = await supabase
        .from('churches')
        .select('id, name, logo_url, primary_color, secondary_color')
        .eq('id', churchId)
        .single()
      if (error) throw error
      return data as ChurchBranding
    },
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  })
}
