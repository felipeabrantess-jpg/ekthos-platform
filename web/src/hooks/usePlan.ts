import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface Plan {
  slug: string
  name: string
  price_cents: number
  max_users: number
  included_agents: number
  included_agent_slugs: string[]
}

export interface Agent {
  slug: string
  name: string
  short_description: string
  full_description: string | null
  features: string[]
  pain_solved: string | null
  without_me: string | null
  pricing_tier: 'free' | 'always_paid' | 'eligible' | 'coming_soon' | 'premium' | 'internal'
  price_cents: number
}

export interface Subscription {
  id: string
  plan_slug: string
  status: string
  trial_end: string
  cancel_at_period_end: boolean
  extra_users: number
  extra_agents: number
  current_period_start: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: Plan | null
}

export function usePlan() {
  const { churchId } = useAuth()

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plan:plans(*)')
        .eq('church_id', churchId!)
        .maybeSingle()
      if (error) throw error
      return data as Subscription | null
    },
  })

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents_catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents_catalog')
        .select('*')
        .eq('active', true)
        .order('pricing_tier')
      if (error) throw error
      return (data ?? []).map(a => ({ ...a, features: a.features as string[] })) as Agent[]
    },
  })

  const { data: activeAgentSlugs = [] } = useQuery({
    queryKey: ['subscription_agents', subscription?.id],
    enabled: !!subscription?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_agents')
        .select('agent_slug')
        .eq('subscription_id', subscription!.id)
        .eq('active', true)
      if (error) throw error
      return (data ?? []).map(a => a.agent_slug)
    },
  })

  const planSlug = subscription?.plan_slug ?? 'chamado'
  const isTrial = subscription?.status === 'trialing'
  const isActive = subscription?.status === 'active' || isTrial
  const includedAgents = subscription?.plan?.included_agents ?? 0
  const extraAgents = subscription?.extra_agents ?? 0
  const maxAgentSlots = includedAgents + extraAgents

  // Free agents are always available
  const freeAgents = allAgents.filter(a => a.pricing_tier === 'free')
  // Always paid agents are available when subscription is active
  const alwaysPaidAgents = allAgents.filter(a => a.pricing_tier === 'always_paid')
  // Eligible agents that the church has chosen
  const eligibleAgents = allAgents.filter(a => a.pricing_tier === 'eligible')
  // Coming soon agents — not yet available, shown as preview
  const comingSoonAgents = allAgents.filter(a => a.pricing_tier === 'coming_soon')

  const hasAgent = (slug: string): boolean => {
    if (!isActive) return false
    const agent = allAgents.find(a => a.slug === slug)
    if (agent?.pricing_tier === 'free' || agent?.pricing_tier === 'internal') return true
    // always_paid: disponível para qualquer assinatura ativa (sem slot — nunca vai para subscription_agents)
    if (agent?.pricing_tier === 'always_paid') return true
    if (subscription?.plan?.included_agent_slugs?.includes(slug)) return true
    return activeAgentSlugs.includes(slug)
  }

  const canAddMoreAgents = activeAgentSlugs.filter(slug => {
    const agent = allAgents.find(a => a.slug === slug)
    return agent?.pricing_tier === 'eligible'
  }).length < maxAgentSlots

  return {
    subscription,
    planSlug,
    plan: subscription?.plan ?? null,
    isLoading: subLoading,
    isTrial,
    isActive,
    allAgents,
    freeAgents,
    alwaysPaidAgents,
    eligibleAgents,
    comingSoonAgents,
    activeAgentSlugs,
    hasAgent,
    canAddMoreAgents,
    maxAgentSlots,
    includedAgents,
    extraAgents,
    maxUsers: (subscription?.plan?.max_users ?? 2) + (subscription?.extra_users ?? 0),
  }
}
