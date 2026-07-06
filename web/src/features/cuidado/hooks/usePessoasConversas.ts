import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Carrega o conversation_id mais recente por person_id para toda a church.
 * Uma única query para todos os membros — evita N+1 por row.
 * Retorna Map<person_id, conversation_id>.
 */
export function usePessoasConversas(churchId: string) {
  return useQuery({
    queryKey: ['pessoas-conversas', churchId],
    queryFn: async (): Promise<Map<string, string>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('conversations')
        .select('id, person_id, last_message_at')
        .eq('church_id', churchId)
        .not('person_id', 'is', null)
        .order('last_message_at', { ascending: false })
      if (error) throw new Error((error as { message: string }).message)

      // First-wins: ordered DESC → primeiro registro de cada person_id é o mais recente
      const map = new Map<string, string>()
      for (const row of ((data as unknown[]) ?? []) as { id: string; person_id: string }[]) {
        if (!map.has(row.person_id)) map.set(row.person_id, row.id)
      }
      return map
    },
    enabled: Boolean(churchId),
  })
}
