// ============================================================
// useAgentSubscriptionStatus — hook C1
//
// Retorna o estado de ativação do agente para a igreja logada.
// Usa TanStack Query para cache + Supabase Realtime para
// atualização instantânea quando o admin Ekthos muda o status.
//
// Estados possíveis:
//   loading           → aguardando fetch inicial
//   error             → falha na query
//   internal_included → agente free (incluso no plano)
//   not_contracted    → sem registro em subscription_agents
//   pending_activation → pago, aguardando setup do time Ekthos
//   in_setup          → setup em andamento
//   active            → operando normalmente
//   paused            → pausado pelo pastor
//   cancelled         → assinatura cancelada
// ============================================================

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlan } from '@/hooks/usePlan'

export type ActivationStatus =
  | 'pending_activation'
  | 'in_setup'
  | 'active'
  | 'paused'
  | 'cancelled'

export interface AgentSubscriptionRecord {
  id: string
  subscription_id: string
  agent_slug: string
  active: boolean
  activation_status: ActivationStatus
  created_at: string
}

export type AgentStatusResult =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'internal_included' }
  | { state: 'not_contracted' }
  | { state: ActivationStatus; record: AgentSubscriptionRecord }

export function useAgentSubscriptionStatus(slug: string): AgentStatusResult {
  const { subscription, allAgents, isLoading: planLoading } = usePlan()
  const queryClient = useQueryClient()
  const subscriptionId = subscription?.id ?? null

  // Agente free = incluso no plano, não precisa de subscription_agents
  const catalogAgent = allAgents.find(a => a.slug === slug)
  const isFreeAgent = catalogAgent?.pricing_tier === 'free'

  const queryKey = ['agent_subscription_status', subscriptionId, slug]

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: !!subscriptionId && !isFreeAgent && !planLoading,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_agents')
        .select('*')
        .eq('subscription_id', subscriptionId!)
        .eq('agent_slug', slug)
        .maybeSingle()
      if (error) throw error
      return data as AgentSubscriptionRecord | null
    },
  })

  // Realtime: revalida query quando admin muda activation_status
  useEffect(() => {
    if (!subscriptionId || isFreeAgent) return

    const channel = supabase
      .channel(`agent_status_${subscriptionId}_${slug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_agents',
          filter: `subscription_id=eq.${subscriptionId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId, slug, isFreeAgent])

  if (planLoading || isLoading) return { state: 'loading' }
  if (isFreeAgent) return { state: 'internal_included' }
  if (error) return { state: 'error', message: (error as Error).message }
  if (!data) return { state: 'not_contracted' }

  return {
    state: data.activation_status,
    record: data,
  }
}
