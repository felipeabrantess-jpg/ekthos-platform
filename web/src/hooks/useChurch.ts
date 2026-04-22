import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface EnabledModules {
  pessoas:      boolean
  aniversarios: boolean
  pipeline:     boolean
  celulas:      boolean
  ministerios:  boolean
  voluntarios:  boolean
  escalas:      boolean
  financeiro:   boolean
  agenda:       boolean
  gabinete:     boolean
  [key: string]: boolean
}

export const DEFAULT_MODULES: EnabledModules = {
  pessoas:      true,
  aniversarios: true,
  pipeline:     true,
  celulas:      false,
  ministerios:  true,
  voluntarios:  false,
  escalas:      false,
  financeiro:   true,
  agenda:       true,
  gabinete:     false,
}

export interface ChurchBranding {
  id:              string
  name:            string
  logo_url:        string | null
  primary_color:   string
  secondary_color: string
  enabled_modules: EnabledModules
}

export function useChurch() {
  const { churchId } = useAuth()

  return useQuery({
    queryKey: ['church-branding', churchId],
    queryFn: async (): Promise<ChurchBranding | null> => {
      if (!churchId) return null
      const { data, error } = await supabase
        .from('churches')
        .select('id, name, logo_url, primary_color, secondary_color, enabled_modules')
        .eq('id', churchId)
        .single()
      if (error) throw error

      return {
        ...(data as Omit<ChurchBranding, 'enabled_modules'>),
        enabled_modules: (data.enabled_modules as EnabledModules | null) ?? DEFAULT_MODULES,
      }
    },
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  })
}
