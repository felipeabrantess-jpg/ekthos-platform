/**
 * ReengajamentoDashboard — /agentes/agent-reengajamento/dashboard
 *
 * Métricas em tempo real do agente de reengajamento:
 * 5 cards + empty states por situação.
 *
 * Empty states:
 *  - subscription_status ausente/null → sem contrato → CTA "Contratar Reengajamento"
 *  - activation_status = 'inactive' → agente não ativado
 *  - acoes_tomadas = 0 e creditos_consumidos_mes = 0 → aguardando primeira ação
 *
 * ThresholdBanner:
 *  - warn  se creditos_restantes < 180 (30% de 600cr canon)
 *  - danger se creditos_restantes < 60  (10% de 600cr canon)
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  TrendingUp,
  Zap,
  Clock,
  CreditCard,
  RefreshCw,
  AlertTriangle,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  pessoas_em_risco_semana: number
  acoes_tomadas: number
  taxa_retorno: number
  creditos_restantes: number | null
  creditos_consumidos_mes: number
  ultima_execucao: string | null
  subscription_status: string | null
  activation_status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string | null) {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm
                 hover:shadow-md hover:-translate-y-px transition-all duration-200 relative overflow-hidden"
    >
      {/* Radial glow */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-30 -translate-y-1/2 translate-x-1/2"
        style={{ background: 'radial-gradient(circle, #f9eedc 0%, transparent 70%)' }}
      />
      <div className="relative">
        <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 ${iconBg}`}>
          <Icon size={18} className={iconColor} strokeWidth={2} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">{label}</p>
        <p className="font-mono text-2xl font-bold text-[#161616]">{value}</p>
        {sub && <p className="text-xs text-[#8A8A8A] mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#f9eedc]">
      {/* Header skeleton */}
      <div className="px-6 py-6 mb-2">
        <div className="max-w-5xl mx-auto">
          <div className="h-4 w-20 bg-[#e8d9c0] rounded animate-pulse mb-4" />
          <div className="h-8 w-64 bg-[#e8d9c0] rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-[#e8d9c0] rounded animate-pulse" />
        </div>
      </div>
      {/* Cards skeleton */}
      <main className="max-w-5xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm"
            >
              <div className="w-9 h-9 rounded-xl bg-[#f9eedc] animate-pulse mb-3" />
              <div className="h-3 w-24 bg-[#f0e4cc] rounded animate-pulse mb-2" />
              <div className="h-7 w-16 bg-[#f0e4cc] rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-[#f9eedc] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

// ── Empty States ──────────────────────────────────────────────────────────────

function EmptyNoSubscription() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDE8E0] mb-6">
          <RotateCcw size={28} className="text-[#e13500]" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#161616] mb-3">
          Agente de Reengajamento
        </h2>
        <p className="text-[#5A5A5A] text-sm leading-relaxed mb-6">
          O Agente de Reengajamento não está ativo na sua conta.
          Ele identifica membros inativos e inicia contato pastoral automaticamente,
          recuperando vínculos antes que se percam.
        </p>
        <Link
          to="/agentes/agent-reengajamento"
          className="inline-flex items-center justify-center gap-2 bg-[#e13500] text-white
                     font-semibold rounded-xl px-6 py-3 text-sm hover:bg-[#FF4D1A]
                     transition-colors duration-150"
        >
          <Zap size={16} />
          Contratar Reengajamento
        </Link>
      </div>
    </div>
  )
}

function EmptyInactive() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFF3E0] mb-6">
          <Clock size={28} className="text-[#C4841D]" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#161616] mb-3">
          Agente não ativado
        </h2>
        <p className="text-[#5A5A5A] text-sm leading-relaxed mb-4">
          Seu plano foi registrado, mas o Agente de Reengajamento ainda não foi ativado.
          Acesse as configurações para ativar e definir os critérios de identificação de inativos.
        </p>
        <Link
          to="/agentes/agent-reengajamento/configurar"
          className="inline-flex items-center justify-center gap-2 bg-[#e13500] text-white
                     font-semibold rounded-xl px-6 py-3 text-sm hover:bg-[#FF4D1A]
                     transition-colors duration-150"
        >
          <Zap size={16} />
          Ativar agente
        </Link>
      </div>
    </div>
  )
}

function EmptyNoActivity() {
  return (
    <div className="mb-6 rounded-2xl border border-[#EDE0CC] bg-[#FDF6EB] p-5 flex items-start gap-4">
      <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#f9eedc] shrink-0 mt-0.5">
        <Users size={18} className="text-[#e13500]" />
      </div>
      <div>
        <p className="font-semibold text-[#161616] text-sm mb-1">Aguardando primeira análise</p>
        <p className="text-[#5A5A5A] text-sm leading-relaxed">
          O agente escaneia inativos diariamente às 9h. Assim que identificar membros em risco,
          iniciará o contato automaticamente. Certifique-se de que os{' '}
          <Link to="/agentes/agent-reengajamento/configurar" className="text-[#e13500] underline underline-offset-2">
            critérios de inatividade
          </Link>{' '}
          estão configurados.
        </p>
      </div>
    </div>
  )
}

// ── ThresholdBanner ───────────────────────────────────────────────────────────

function ThresholdBanner({
  creditosRestantes,
  creditosCanon,
}: {
  creditosRestantes: number
  creditosCanon: number
}) {
  const pctRestante = creditosCanon > 0
    ? Math.round((creditosRestantes / creditosCanon) * 100)
    : 100
  const pctUsado = 100 - pctRestante

  // warn: restante < 30% (< 180cr de 600)
  // danger: restante < 10% (< 60cr de 600)
  const isDanger = creditosRestantes < Math.round(creditosCanon * 0.10)
  const isWarn = !isDanger && creditosRestantes < Math.round(creditosCanon * 0.30)

  if (!isDanger && !isWarn) return null

  return (
    <div
      className={`mb-6 rounded-2xl border p-4 flex items-center gap-3
        ${isDanger
          ? 'bg-[#FDE8E0] border-[#e13500]/30'
          : 'bg-[#FFF3E0] border-[#C4841D]/20'
        }`}
    >
      <AlertTriangle
        size={16}
        className={isDanger ? 'text-[#e13500]' : 'text-[#C4841D]'}
      />
      <p className="text-sm flex-1">
        <span className="font-semibold text-[#161616]">
          {pctUsado}% dos créditos consumidos
        </span>
        {' — '}
        <span className="text-[#5A5A5A]">
          {isDanger
            ? 'Créditos críticos. Recarregue para evitar pausa do agente.'
            : 'Reserve créditos para garantir continuidade do reengajamento.'}
        </span>
      </p>
      <Link
        to="/recargas"
        className="shrink-0 text-xs font-semibold text-[#e13500] hover:underline"
      >
        Recarregar
      </Link>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ReengajamentoDashboard() {
  const { churchId } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!churchId) return
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    setError(null)

    const { data: result, error: err } = await supabase.rpc(
      'get_agent_reengajamento_dashboard',
      { p_church_id: churchId }
    )

    if (err) {
      if (err.message?.includes('forbidden')) {
        navigate('/agentes')
        return
      }
      setError(err.message ?? 'Erro ao carregar dashboard')
    } else {
      setData(result as DashboardData)
    }

    setLoading(false)
    setRefreshing(false)
  }, [churchId, navigate])

  useEffect(() => { void load() }, [load])

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return <LoadingSkeleton />
  }

  // ── Error ──────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-6 max-w-sm w-full text-center">
          <AlertTriangle size={24} className="text-[#e13500] mx-auto mb-3" />
          <p className="text-sm text-[#161616] font-medium mb-2">Erro ao carregar</p>
          <p className="text-xs text-[#5A5A5A] mb-4">{error}</p>
          <button
            onClick={() => load()}
            className="text-sm text-[#e13500] font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // ── Empty: sem subscription ────────────────────────────────
  if (!data?.subscription_status) {
    return (
      <div className="min-h-screen bg-[#f9eedc]">
        <Header onRefresh={() => load(true)} refreshing={refreshing} />
        <div className="max-w-5xl mx-auto px-6">
          <EmptyNoSubscription />
        </div>
      </div>
    )
  }

  // ── Empty: agente inactive ─────────────────────────────────
  if (data.activation_status === 'inactive') {
    return (
      <div className="min-h-screen bg-[#f9eedc]">
        <Header onRefresh={() => load(true)} refreshing={refreshing} />
        <div className="max-w-5xl mx-auto px-6">
          <EmptyInactive />
        </div>
      </div>
    )
  }

  const creditosRestantes = data.creditos_restantes ?? 0
  const creditosCanon = 600 // agent-reengajamento (canon)

  return (
    <div className="min-h-screen bg-[#f9eedc]">
      <Header onRefresh={() => load(true)} refreshing={refreshing} />

      <main className="max-w-5xl mx-auto px-6 pb-12">

        {/* Empty: sem atividade */}
        {data.acoes_tomadas === 0 && data.creditos_consumidos_mes === 0 && (
          <EmptyNoActivity />
        )}

        {/* ThresholdBanner 30% / 10% */}
        <ThresholdBanner
          creditosRestantes={creditosRestantes}
          creditosCanon={creditosCanon}
        />

        {/* ── 5 Metric Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <MetricCard
            icon={Users}
            iconBg="bg-[#FDE8E0]"
            iconColor="text-[#e13500]"
            label="Pessoas em risco / 7d"
            value={data.pessoas_em_risco_semana}
            sub="identificadas para reengajamento"
          />
          <MetricCard
            icon={RotateCcw}
            iconBg="bg-[#E3F2FD]"
            iconColor="text-[#2B6CB0]"
            label="Ações tomadas / 7d"
            value={data.acoes_tomadas}
            sub="contatos iniciados na semana"
          />
          <MetricCard
            icon={TrendingUp}
            iconBg="bg-[#E8F5E9]"
            iconColor="text-[#2D7A4F]"
            label="Taxa de retorno"
            value={`${data.taxa_retorno}%`}
            sub="jornadas com status completed"
          />
          <MetricCard
            icon={CreditCard}
            iconBg="bg-[#F5E0E0]"
            iconColor="text-[#670000]"
            label="Créditos restantes"
            value={data.creditos_restantes === null ? '—' : creditosRestantes}
            sub={`${data.creditos_consumidos_mes} consumidos este mês`}
          />
          <MetricCard
            icon={Clock}
            iconBg="bg-[#f9eedc]"
            iconColor="text-[#C4841D]"
            label="Última execução"
            value={timeAgo(data.ultima_execucao)}
            sub={fmtDate(data.ultima_execucao)}
          />
        </div>

        {/* ── Links rápidos ─────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <Link
            to="/consumo"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-4 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            <CreditCard size={14} />
            Ver consumo detalhado
          </Link>
          <Link
            to="/recargas"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-4 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            <Zap size={14} />
            Recarregar créditos
          </Link>
          <Link
            to="/agentes/agent-reengajamento/configurar"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-4 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            <Zap size={14} />
            Configurar agente
          </Link>
        </div>
      </main>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="px-6 py-6 mb-2">
      <div className="max-w-5xl mx-auto">
        <Link
          to="/agentes"
          className="inline-flex items-center gap-1.5 text-sm text-[#5A5A5A]
                     hover:text-[#161616] mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          Agentes
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-[#161616] leading-tight">
              Agente de Reengajamento
            </h1>
            <p className="text-[#5A5A5A] text-sm mt-1">
              Métricas em tempo real — recuperação de membros inativos
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-xs text-[#5A5A5A] font-medium
                       hover:text-[#161616] disabled:opacity-40 transition-colors mt-1"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>
    </header>
  )
}
