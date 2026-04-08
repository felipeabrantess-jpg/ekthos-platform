import { useAuth } from '@/hooks/useAuth'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'
import Badge from '@/components/ui/Badge'

function StatCard({
  label,
  value,
  sub,
  color = 'blue',
}: {
  label: string
  value: string | number
  sub?: string
  color?: 'blue' | 'green' | 'purple' | 'yellow'
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && (
        <span className={`inline-block text-xs font-medium rounded-full px-2 py-0.5 mt-2 ${colors[color]}`}>
          {sub}
        </span>
      )}
    </div>
  )
}

type BadgeVariant = 'blue' | 'purple' | 'gray'

function InteractionBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    whatsapp: { label: 'WhatsApp', variant: 'blue' },
    instagram: { label: 'Instagram', variant: 'purple' },
    manual: { label: 'Manual', variant: 'gray' },
    system: { label: 'Sistema', variant: 'blue' },
    n8n: { label: 'Automação', variant: 'blue' },
  }
  const config = map[type] ?? { label: type, variant: 'gray' as BadgeVariant }
  return <Badge label={config.label} variant={config.variant} />
}

export default function Dashboard() {
  const { churchId } = useAuth()
  const { data, isLoading, isError, refetch } = useDashboardStats(churchId ?? '')

  if (!churchId) {
    return (
      <ErrorState message="Igreja não identificada. Faça login novamente." />
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !data) {
    return <ErrorState onRetry={() => void refetch()} />
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Visão geral da operação —{' '}
          {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Pessoas"
          value={data.totalPeople}
          sub="cadastradas"
          color="blue"
        />
        <StatCard
          label="Novos este Mês"
          value={data.newThisMonth}
          sub="novos contatos"
          color="green"
        />
        <StatCard
          label="Interações Recentes"
          value={data.activeInteractions}
          sub="últimas 8"
          color="purple"
        />
        <StatCard
          label="Dízimos e Ofertas"
          value={formatCurrency(data.monthlyDonations)}
          sub="mês atual"
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Summary */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Pipeline Espiritual</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pessoas por estágio</p>
          </div>
          <div className="px-5 py-3 space-y-2">
            {data.pipelineSummary.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nenhum dado de pipeline</p>
            ) : (
              data.pipelineSummary.map((stage) => {
                const pct = data.totalPeople > 0
                  ? Math.round((stage.count / data.totalPeople) * 100)
                  : 0
                return (
                  <div key={stage.stage_slug} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-32 truncate">{stage.stage_name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">
                      {stage.count}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Recent Interactions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Interações Recentes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Últimas atividades do sistema</p>
          </div>
          <div className="divide-y divide-gray-50">
            {data.recentInteractions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nenhuma interação ainda</p>
            ) : (
              data.recentInteractions.map((interaction) => {
                const content = interaction.content as { text?: string }
                const time = new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                }).format(new Date(interaction.created_at))

                return (
                  <div key={interaction.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-shrink-0 pt-0.5">
                      <InteractionBadge type={interaction.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {interaction.people?.name ?? 'Contato não identificado'}
                      </p>
                      {content.text && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{content.text}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
