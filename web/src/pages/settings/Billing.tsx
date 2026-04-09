import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePlan } from '@/hooks/usePlan'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

const PLAN_LABELS: Record<string, string> = {
  chamado: 'Chamado',
  missao: 'Missão',
  avivamento: 'Avivamento',
}

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  trialing:   { label: 'Período de teste', variant: 'yellow' },
  active:     { label: 'Ativo',            variant: 'green'  },
  past_due:   { label: 'Pagamento pendente', variant: 'red'  },
  canceled:   { label: 'Cancelado',        variant: 'red'    },
  incomplete: { label: 'Incompleto',       variant: 'gray'   },
  paused:     { label: 'Pausado',          variant: 'gray'   },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function trialDaysLeft(trialEnd: string) {
  const ms = new Date(trialEnd).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
      <div
        className="bg-brand-600 h-1.5 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Billing() {
  const {
    subscription, plan, isTrial, maxUsers, maxAgentSlots,
    activeAgentSlugs, includedAgents, extraAgents,
  } = usePlan()
  const [isUpgrading, setIsUpgrading] = useState(false)

  const { data: userCount = 0 } = useQuery({
    queryKey: ['user_count_billing'],
    queryFn: async () => {
      const { count } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(12)
      return data ?? []
    },
  })

  const daysLeft = subscription?.trial_end ? trialDaysLeft(subscription.trial_end) : 0
  const statusConfig = STATUS_CONFIG[subscription?.status ?? 'incomplete'] ?? STATUS_CONFIG.incomplete
  const eligibleActive = activeAgentSlugs.length

  const handleUpgrade = async (planSlug: string) => {
    setIsUpgrading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            plan_slug: planSlug,
            success_url: `${window.location.origin}/settings/billing?upgrade=success`,
            cancel_url: `${window.location.origin}/settings/billing`,
          }),
        }
      )
      const { url, error } = (await res.json()) as { url?: string; error?: string }
      if (error) throw new Error(error)
      if (url) window.location.href = url
    } catch (err) {
      console.error('Upgrade failed:', err)
    } finally {
      setIsUpgrading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Assinatura</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie seu plano e formas de pagamento</p>
      </div>

      {/* Current Plan */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-600">Plano atual</h2>
          <Badge label={statusConfig.label} variant={statusConfig.variant} />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {PLAN_LABELS[subscription?.plan_slug ?? 'chamado']}
            </p>
            {plan && (
              <p className="text-sm text-gray-500 mt-1">
                R$ {(plan.price_cents / 100).toFixed(2).replace('.', ',')}/mês
              </p>
            )}
          </div>
          {isTrial && (
            <div className="text-right">
              <p className="text-sm font-medium text-amber-600">{daysLeft} dias restantes</p>
              <p className="text-xs text-gray-400">no período de teste</p>
            </div>
          )}
        </div>

        {subscription?.current_period_end && (
          <p className="text-xs text-gray-400">
            Próxima renovação: {formatDate(subscription.current_period_end)}
          </p>
        )}

        {subscription?.plan_slug !== 'avivamento' && (
          <div className="flex gap-2 pt-2">
            {subscription?.plan_slug === 'chamado' && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleUpgrade('missao')}
                  disabled={isUpgrading}
                  loading={isUpgrading}
                >
                  Ir para Missão
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleUpgrade('avivamento')}
                  disabled={isUpgrading}
                  loading={isUpgrading}
                >
                  Ir para Avivamento
                </Button>
              </>
            )}
            {subscription?.plan_slug === 'missao' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade('avivamento')}
                disabled={isUpgrading}
                loading={isUpgrading}
              >
                Ir para Avivamento
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Usuários</p>
          <p className="text-2xl font-bold text-gray-900">
            {userCount}
            <span className="text-lg font-normal text-gray-400">/{maxUsers}</span>
          </p>
          <ProgressBar value={(userCount / maxUsers) * 100} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Slots de agentes</p>
          <p className="text-2xl font-bold text-gray-900">
            {eligibleActive}
            <span className="text-lg font-normal text-gray-400">/{maxAgentSlots}</span>
          </p>
          <ProgressBar value={maxAgentSlots > 0 ? (eligibleActive / maxAgentSlots) * 100 : 0} />
          {includedAgents > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {includedAgents} incluídos no plano{extraAgents > 0 ? ` + ${extraAgents} extras` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Histórico de faturas</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma fatura ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(invoices as Array<{
              id: string
              amount_cents: number
              paid_at: string | null
              status: string
              hosted_invoice_url: string | null
            }>).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    R$ {(inv.amount_cents / 100).toFixed(2).replace('.', ',')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {inv.paid_at
                      ? new Date(inv.paid_at).toLocaleDateString('pt-BR')
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    label={inv.status === 'paid' ? 'Pago' : inv.status}
                    variant={inv.status === 'paid' ? 'green' : 'gray'}
                  />
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-700 underline"
                    >
                      Ver
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
