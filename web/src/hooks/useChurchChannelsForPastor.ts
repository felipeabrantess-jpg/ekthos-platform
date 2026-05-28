/**
 * useChurchChannelsForPastor
 *
 * Read-only hook para pastores/membros visualizarem os canais da sua igreja.
 * Reusa a RPC list_church_channels (PASSO 7) que já tem permissão para pastores
 * via SECURITY DEFINER + profiles.church_id check.
 *
 * Polling 60s — captura atualizações de status do n8n callback.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ChurchChannel } from '@/hooks/useChurchChannels'

export function useChurchChannelsForPastor() {
  const { churchId } = useAuth()

  return useQuery({
    queryKey: ['pastor-channels', churchId],
    queryFn: async (): Promise<ChurchChannel[]> => {
      if (!churchId) return []
      const { data, error } = await supabase.rpc('list_church_channels', {
        p_church_id: churchId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as ChurchChannel[]
    },
    enabled: !!churchId,
    staleTime: 30_000,
    refetchInterval: 60_000,  // polling mais lento que o cockpit admin
  })
}
