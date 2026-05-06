/**
 * usePendingActivations — Query RPC list_pending_activations
 * Atualiza automaticamente via polling a cada 30s (sem Realtime — tabela admin).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PendingActivation {
  sa_id:               string
  subscription_id:     string
  church_id:           string
  church_name:         string
  agent_slug:          string
  agent_name:          string
  activation_status:   'pending_activation' | 'in_setup' | 'active' | 'paused' | 'cancelled'
  package_type:        string | null
  credits_balance:     number | null
  credits_total:       number | null
  metadata:            Record<string, unknown> | null
  created_at:          string
  notification_id:     string | null
  notification_status: string | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePendingActivations() {
  return useQuery({
    queryKey: ['admin', 'pending-activations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_pending_activations')
      if (error) throw new Error(error.message)
      return (data ?? []) as PendingActivation[]
    },
    refetchInterval: 30_000, // polling 30s
    staleTime:       15_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useStartSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ saId, notes }: { saId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('start_agent_setup', {
        p_sa_id: saId,
        p_notes: notes ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pending-activations'] }),
  })
}

export function useActivateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saId: string) => {
      const { data, error } = await supabase.rpc('activate_agent', { p_sa_id: saId })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pending-activations'] }),
  })
}

export function usePauseAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saId: string) => {
      const { data, error } = await supabase.rpc('pause_agent', { p_sa_id: saId })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pending-activations'] }),
  })
}

export function useCancelAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saId: string) => {
      const { data, error } = await supabase.rpc('cancel_agent', { p_sa_id: saId })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pending-activations'] }),
  })
}
