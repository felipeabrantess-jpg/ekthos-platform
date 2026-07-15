import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ChurchEventFull } from './useEvents'

/**
 * Fetches pastoral appointments (church_events where is_pastoral=true)
 * for the given church and date range.
 * RLS guarantees non-admin/secretary roles receive zero rows.
 * The explicit .eq('is_pastoral', true) filter is defense-in-depth.
 */
export function usePastoralEvents(churchId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: [
      'pastoral_events',
      churchId,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    ],
    queryFn: async (): Promise<ChurchEventFull[]> => {
      const { data, error } = await supabase
        .from('church_events')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_pastoral', true)
        .eq('active', true)
        .gte('start_datetime', from.toISOString())
        .lte('start_datetime', to.toISOString())
        .order('start_datetime', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as ChurchEventFull[]
    },
    enabled: Boolean(churchId),
  })
}
