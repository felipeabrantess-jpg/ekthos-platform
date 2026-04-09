import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePlan, type Agent } from '@/hooks/usePlan'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

function AgentCard({
  agent,
  isActive,
  canActivate,
  onActivate,
  onDeactivate,
}: {
  agent: Agent
  isActive: boolean
  canActivate: boolean
  onActivate: (slug: string) => void
  onDeactivate: (slug: string) => void
}) {
  const tierLabel =
    agent.pricing_tier === 'free'
      ? 'Grátis'
      : agent.pricing_tier === 'always_paid'
      ? 'Sempre incluído'
      : isActive
      ? 'Ativo'
      : 'Disponível'

  const tierVariant: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' =
    agent.pricing_tier === 'free'
      ? 'green'
      : agent.pricing_tier === 'always_paid'
      ? 'blue'
      : isActive
      ? 'green'
      : 'gray'

  return (
    <div
      className={`relative bg-white border rounded-xl p-5 space-y-3 ${
        isActive ? 'border-brand-300' : 'border-gray-200'
      }`}
    >
      {isActive && (
        <div className="absolute top-3 right-3">
          <svg className="h-4 w-4 text-brand-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight">{agent.name}</h3>
        <Badge label={tierLabel} variant={tierVariant} />
      </div>

      <p className="text-xs text-gray-500">{agent.short_description}</p>

      <ul className="space-y-1">
        {agent.features.slice(0, 4).map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
            <svg
              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {agent.pain_solved && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-100">
          <strong>Resolve:</strong> {agent.pain_solved}
        </p>
      )}

      {agent.pricing_tier === 'eligible' && (
        <div className="pt-1">
          {isActive ? (
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50"
              onClick={() => onDeactivate(agent.slug)}
            >
              Desativar agente
            </Button>
          ) : canActivate ? (
            <Button
              size="sm"
              variant="primary"
              className="w-full text-xs"
              onClick={() => onActivate(agent.slug)}
            >
              Ativar agente
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="w-full text-xs" disabled>
              Sem slots disponíveis
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function Agents() {
  const {
    subscription,
    freeAgents,
    alwaysPaidAgents,
    eligibleAgents,
    activeAgentSlugs,
    hasAgent,
    canAddMoreAgents,
    maxAgentSlots,
  } = usePlan()
  const queryClient = useQueryClient()

  const activateMutation = useMutation({
    mutationFn: async (agentSlug: string) => {
      if (!subscription?.id) throw new Error('No subscription')
      const { error } = await supabase.from('subscription_agents').insert({
        subscription_id: subscription.id,
        agent_slug: agentSlug,
        active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription_agents'] })
    },
    onError: (err: Error) => console.error('Erro ao ativar:', err.message),
  })

  const deactivateMutation = useMutation({
    mutationFn: async (agentSlug: string) => {
      if (!subscription?.id) throw new Error('No subscription')
      const { error } = await supabase
        .from('subscription_agents')
        .update({ active: false })
        .eq('subscription_id', subscription.id)
        .eq('agent_slug', agentSlug)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription_agents'] })
    },
    onError: (err: Error) => console.error('Erro ao desativar:', err.message),
  })

  const eligibleActive = activeAgentSlugs.filter(slug =>
    eligibleAgents.some(a => a.slug === slug)
  ).length

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Agentes IA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure os agentes disponíveis para sua igreja
          </p>
        </div>
        {maxAgentSlots > 0 && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {eligibleActive}/{maxAgentSlots} slots usados
            </p>
            <p className="text-xs text-gray-400">agentes elegíveis ativos</p>
          </div>
        )}
      </div>

      {/* Free */}
      {freeAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-medium text-sm text-gray-700">Incluídos gratuitamente</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {freeAgents.map(agent => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                isActive={true}
                canActivate={false}
                onActivate={() => {}}
                onDeactivate={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {/* Always paid */}
      {alwaysPaidAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-medium text-sm text-gray-700">Incluídos no plano</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alwaysPaidAgents.map(agent => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                isActive={hasAgent(agent.slug)}
                canActivate={false}
                onActivate={() => {}}
                onDeactivate={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {/* Eligible */}
      {eligibleAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-medium text-sm text-gray-700">
              Agentes elegíveis — escolha os seus
            </h2>
            <span className="text-xs text-gray-400">
              ({eligibleActive}/{maxAgentSlots} slots)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {eligibleAgents.map(agent => (
              <AgentCard
                key={agent.slug}
                agent={agent}
                isActive={activeAgentSlugs.includes(agent.slug)}
                canActivate={
                  canAddMoreAgents || activeAgentSlugs.includes(agent.slug)
                }
                onActivate={slug => activateMutation.mutate(slug)}
                onDeactivate={slug => deactivateMutation.mutate(slug)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
