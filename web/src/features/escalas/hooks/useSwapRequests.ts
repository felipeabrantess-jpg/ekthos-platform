// D9 — Hooks de troca de escala (service_schedule_swap_requests)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SwapRequest {
  id: string
  church_id: string
  assignment_id: string
  requester_volunteer_id: string
  target_volunteer_id: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  requester_note: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export function useSwapRequests(churchId: string) {
  return useQuery({
    queryKey: ['swap-requests', churchId],
    queryFn: async (): Promise<SwapRequest[]> => {
      const { data, error } = await supabase
        .from('service_schedule_swap_requests')
        .select('*')
        .eq('church_id', churchId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return (data ?? []) as SwapRequest[]
    },
    enabled: Boolean(churchId),
  })
}

interface RequestSwapInput {
  churchId: string
  assignmentId: string
  requesterVolunteerId: string
  note?: string | null
}

export function useRequestSwap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ churchId, assignmentId, requesterVolunteerId, note }: RequestSwapInput) => {
      const { data, error } = await supabase
        .from('service_schedule_swap_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: churchId,
          assignment_id: assignmentId,
          requester_volunteer_id: requesterVolunteerId,
          requester_note: note ?? null,
          status: 'pending',
        } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['swap-requests', churchId] })
    },
  })
}

interface ResolveSwapInput {
  id: string
  churchId: string
  status: 'accepted' | 'declined' | 'cancelled'
}

export function useResolveSwap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId, status }: ResolveSwapInput) => {
      const { error } = await supabase
        .from('service_schedule_swap_requests')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status, resolved_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['swap-requests', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['escalas', churchId] })
    },
  })
}
