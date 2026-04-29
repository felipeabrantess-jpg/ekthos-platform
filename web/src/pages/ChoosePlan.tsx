import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader, Star, Zap, Crown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Plan {
  slug: 'chamado' | 'missao' | 'avivamento'
  name: string
  price: string
  priceCents: number
  maxUsers: number
  includedAgents: number
  description: string
  icon: React.ReactNode
  badge?: string
  features: string[]
  color: string
}

const PLANS: Plan[] = [
  {
    slug:           'chamado',
    name:           'Chamado',
    price:          'R$389',
    priceCents:     38900,
    maxUsers:       2,
    includedAgents: 0,
    description:    'Para igrejas que estão começando a digitalizar a operação pastoral.',
    icon:           <Star size={24} strokeWidth={1.75} />,
    color:          '#5A5A5A',
    features: [
      'Até 2 usuários',
      'Agente Suporte 24h (grátis)',
      'Dashboard pastoral',
      'Cadastro de membros',
      'Caminho de discipulado',
      'Rede de células',
      'Suporte por email',
    ],
  },
  {
    slug:           'missao',
    name:           'Missão',
    price:          'R$698',
    priceCents:     69800,
    maxUsers:       3,
    includedAgents: 3,
    description:    'Para igrejas em crescimento que querem automação inteligente.',
    icon:           <Zap size={24} strokeWidth={1.75} />,
    badge:          'Mais escolhido',
    color:          'var(--color-primary)',
    features: [
      'Até 3 usuários',
      'Agente Suporte 24h (grátis)',
      '3 agentes elegíveis inclusos',
      'Tudo do Chamado',
      'Relatórios automáticos',
      'Automações pastorais',
      'Suporte prioritário',
    ],
  },
  {
    slug:           'avivamento',
    name:           'Avivamento',
    price:          'R$1.015,67',
    priceCents:     101567,
    maxUsers:       4,
    includedAgents: 6,
    description:    'Para igrejas grandes com operação pastoral complexa e multi-site.',
    icon:           <Crown size={24} strokeWidth={1.75} />,
    color:          '#670000',
    features: [
      'Até 4 usuários',
      'Agente Suporte 24h (grátis)',
      '6 agentes elegíveis inclusos',
      'Tudo do Missão',
      'Multi-site (múltiplas sedes)',
      'Importação de dados',
      'Suporte dedicado',
    ],
  },
]

export default function ChoosePlan() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleSelectPlan(plan: Plan) {
    setError('')
    setLoading(plan.slug)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/signup')
        return
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_slug:   plan.slug,
          success_url: `${window.location.origin}/onboarding?plan=${plan.slug}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:  `${window.location.origin}/choose-plan`,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Erro ao iniciar pagamento')
      }

      const { url } = await res.json() as { url: string }
      window.location.href = url
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Erro ao processar. Tente novamente.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>Ekthos</h1>
          <h2 className="font-display text-2xl font-semibold text-gray-800 mt-4">Escolha seu plano</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Todos os planos incluem o Agente Suporte 24h gratuitamente.
            <br />
            Cancele quando quiser. Sem fidelidade.
          </p>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div
              key={plan.slug}
              className={`bg-white rounded-2xl border shadow-sm flex flex-col relative overflow-hidden transition-all hover:shadow-md ${
                plan.badge ? 'border-2' : 'border-black/5'
              }`}
              style={{ borderColor: plan.badge ? plan.color : undefined }}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  className="absolute top-0 left-0 right-0 text-center text-xs font-bold py-1.5 text-white"
                  style={{ background: plan.color }}
                >
                  {plan.badge}
                </div>
              )}

              <div className={`p-6 flex flex-col flex-1 ${plan.badge ? 'pt-10' : ''}`}>
                {/* Icon + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${plan.color}15`, color: plan.color }}
                  >
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-gray-900">{plan.name}</h3>
                    <p className="text-xs text-gray-400">{plan.description.slice(0, 40)}...</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono-ekthos text-3xl font-bold" style={{ color: plan.color }}>
                      {plan.price}
                    </span>
                    <span className="text-sm text-gray-400">/mês</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {plan.includedAgents > 0
                      ? `${plan.includedAgents} agentes inclusos · ${plan.maxUsers} usuários`
                      : `${plan.maxUsers} usuários · agentes a partir de R$97,89`}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check size={14} strokeWidth={2} style={{ color: plan.color, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loading !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: plan.color }}
                >
                  {loading === plan.slug && <Loader size={16} strokeWidth={1.75} className="animate-spin" />}
                  {loading === plan.slug ? 'Aguarde...' : 'Começar agora'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Addons */}
        <div className="mt-8 bg-white rounded-2xl border border-black/5 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Complementos disponíveis em qualquer plano</h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <Check size={14} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
              Usuário extra: <strong>R$69,90/mês</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} strokeWidth={2} style={{ color: 'var(--color-primary)' }} />
              Agente de IA adicional: <strong>a partir de R$97,89/mês</strong>
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Pagamento seguro via Stripe · Cancele quando quiser · LGPD compliant
        </p>
      </div>
    </div>
  )
}
