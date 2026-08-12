import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MinistryReferral {
  journey_id:      string
  journey_version: number
  person_id:       string
  person_name:     string
  person_phone:    string | null
  etapa_nome:      string | null
  ministry_id:     string
  ministry_name:   string
  encaminhado_em:  string
  encaminhado_por: string
  dias_esperando:  number
  anotacao:        string | null
}

export function useMinistryReferrals(ministryId?: string | null) {
  return useQuery({
    queryKey: ['ministry-referrals', ministryId ?? 'all'],
    queryFn: async (): Promise<MinistryReferral[]> => {
      const { data, error } = await supabase.rpc('get_ministry_referrals', {
        p_ministry_id: ministryId ?? null,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as MinistryReferral[]
    },
    staleTime: 30_000,
  })
}
