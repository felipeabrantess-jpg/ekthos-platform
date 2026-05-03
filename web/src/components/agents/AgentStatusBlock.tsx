// ============================================================
// AgentStatusBlock — C1
//
// Bloco de status de ativação exibido no topo de /agentes/:slug.
// Renderiza visual diferenciado para cada activation_status.
//
// REGRA: Não renderiza nada para estados já cobertos pelo
// AgentCTA existente (not_contracted, internal_included, active
// com active=true). Evita duplicação de informação.
// ============================================================

import { Clock, Wrench, Pause, XCircle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { useAgentSubscriptionStatus } from '@/hooks/useAgentSubscriptionStatus'

interface Props {
  slug: string
}

export function AgentStatusBlock({ slug }: Props) {
  const status = useAgentSubscriptionStatus(slug)

  // Loading: skeleton sutil para não causar layout shift
  if (status.state === 'loading') {
    return (
      <div className="rounded-2xl p-4 border border-cream-dark/40 bg-white">
        <div className="flex items-center gap-3">
          <Skeleton width={20} height={20} className="rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton height={14} width="40%" />
            <Skeleton height={11} width="65%" />
          </div>
        </div>
      </div>
    )
  }

  // Esses estados são cobertos pelo AgentCTA existente — não duplicar
  if (
    status.state === 'not_contracted' ||
    status.state === 'internal_included' ||
    status.state === 'error'
  ) {
    return null
  }

  // active com active=true → AgentCTA já mostra o bloco verde "Agente ativo"
  if (status.state === 'active' && status.record.active) {
    return null
  }

  // ── Bloco de status real ──────────────────────────────────

  if (status.state === 'pending_activation') {
    const compradoEm = new Date(status.record.created_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    return (
      <div className="rounded-2xl p-5 border border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Clock size={16} className="text-amber-700" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Aguardando ativação</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Pagamento confirmado! Nossa equipe entrará em contato em até{' '}
              <strong>1 dia útil</strong> para configurar seu agente.
            </p>
            <p className="text-[11px] text-amber-600/70 mt-2">
              Comprado em {compradoEm}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status.state === 'in_setup') {
    return (
      <div className="rounded-2xl p-5 border border-orange-200 bg-orange-50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Wrench size={16} className="text-orange-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-orange-900">Em ativação</p>
            <p className="text-xs text-orange-700 mt-1 leading-relaxed">
              Nossa equipe está finalizando a configuração. Em breve seu agente estará operando.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // active com active=false (estado transitório — mostra como em setup)
  if (status.state === 'active' && !status.record.active) {
    return (
      <div className="rounded-2xl p-5 border border-orange-200 bg-orange-50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Wrench size={16} className="text-orange-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-orange-900">Ativando agente</p>
            <p className="text-xs text-orange-700 mt-1">
              Configuração quase concluída. O agente estará ativo em instantes.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status.state === 'paused') {
    return (
      <div className="rounded-2xl p-5 border border-ekthos-black/10 bg-ekthos-cream">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-xl bg-ekthos-black/5 flex items-center justify-center shrink-0">
            <Pause size={16} className="text-ekthos-black/50" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ekthos-black">Agente pausado</p>
            <p className="text-xs text-ekthos-black/55 mt-1">
              Este agente está pausado e não está respondendo. Reative para voltar a operar.
            </p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0 self-center">
            Reativar
          </Button>
        </div>
      </div>
    )
  }

  if (status.state === 'cancelled') {
    return (
      <div className="rounded-2xl p-5 border border-red-200 bg-red-50">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <XCircle size={16} className="text-red-600" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900">Assinatura cancelada</p>
            <p className="text-xs text-red-700 mt-1">
              Este agente foi cancelado. Contrate novamente para reativar.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Fallback seguro
  if (status.state === 'error') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-red-100 bg-red-50">
        <AlertCircle size={14} className="text-red-500 shrink-0" strokeWidth={1.75} />
        <p className="text-xs text-red-700">Erro ao carregar status do agente.</p>
      </div>
    )
  }

  return null
}
