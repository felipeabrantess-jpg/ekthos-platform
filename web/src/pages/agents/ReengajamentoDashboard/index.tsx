/**
 * ReengajamentoDashboard — /agentes/agent-reengajamento/dashboard
 *
 * Métricas em tempo real do agente de reengajamento:
 * 5 cards + empty states por situação.
 *
 * Empty states:
 *  - subscription_status ausente/null → sem contrato → CTA "Contratar Reengajamento"
 *  - subscription_status = 'pending_activation' → aguardando ativação (até 1h)
 *  - acoes_tomadas = 0 e creditos_consumidos_mes = 0 → aguardando primeira varredura
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  TrendingUp,
  Target,
  CreditCard,
  Clock,
  RefreshCw,
  AlertTriangle,
  Zap,
  Loader2,
  BarChart3,
  CheckCircle2,
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
  activation_status: string | null
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

// ── Empty States ──────────────────────────────────────────────────────────────

function EmptyNoSubscription() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDE8E0] mb-6">
          <Target size={28} className="text-[#e13500]" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#161616] mb-3">
          Agente de Reengajamento
        </h2>
        <p className="text-[#5A5A5A] text-sm leading-relaxed mb-6">
          O Agente de Reengajamento não está ativo na sua conta.
          Ele identifica membros inativos e envia mensagens pastorais de forma automática,
          trazendo pessoas de volta à comunidade.
        </p>
        <Link
          to="/agentes/agent-reengajamento"
          className="inline-flex items-center justify-center gap-2 bg-[#e13500] text-white
                     font-semibold rounded-xl px-6 py-3 text-sm hover:bg-[#FF4D1A]
                     transition-colors duration-150"
        >
          <Target size={16} />
          Contratar Reengajamento
        </Link>
      </div>
    </div>
  )
}

function EmptyPendingActivation() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFF3E0] mb-6">
          <Clock size={28} className="text-[#C4841D]" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#161616] mb-3">
          Ativando agente…
        </h2>
        <p className="text-[#5A5A5A] text-sm leading-relaxed mb-4">
          Seu pagamento foi confirmado. O agente de reengajamento está sendo configurado
          automaticamente — isso leva até <strong>1 hora</strong>.
        </p>
        <div className="flex items-center justify-center gap-2 text-[#C4841D] text-sm font-medium">
          <Loader2 size={14} className="animate-spin" />
          Ativação em andamento
        </div>
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
        <p className="font-semibold text-[#161616] text-sm mb-1">Aguardando primeira varredura</p>
        <p className="text-[#5A5A5A] text-sm leading-relaxed">
          O agente de reengajamento roda diariamente às 09h e identifica membros inativos.
          Certifique-se de que há membros cadastrados em{' '}
          <Link to="/pessoas" className="text-[#e13500] underline underline-offset-2">
            Pessoas
          </Link>
          .
        </p>
      </div>
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
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#5A5A5A]">
          <Loader2 size={20} className="animate-spin text-[#e13500]" />
          <span className="text-sm">Carregando dashboard…</span>
        </div>
      </div>
    )
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
  if (!data?.subscription_status && !data?.activation_status) {
    return (
      <div className="min-h-screen bg-[#f9eedc]">
        <Header onRefresh={() => load(true)} refreshing={refreshing} />
        <div className="max-w-5xl mx-auto px-6">
          <EmptyNoSubscription />
        </div>
      </div>
    )
  }

  // ── Empty: pending_activation ──────────────────────────────
  if (data?.activation_status === 'pending_activation') {
    return (
      <div className="min-h-screen bg-[#f9eedc]">
        <Header onRefresh={() => load(true)} refreshing={refreshing} />
        <div className="max-w-5xl mx-auto px-6">
          <EmptyPendingActivation />
        </div>
      </div>
    )
  }

  // ── Crédito esgotado? ──────────────────────────────────────
  const creditosRestantes = data?.creditos_restantes ?? 0
  const creditosCanon = 600 // agent-reengajamento = 600cr
  const pctUsado = creditosCanon > 0
    ? Math.round(((creditosCanon - creditosRestantes) / creditosCanon) * 100)
    : 0
  const emAlerta = creditosRestantes !== null && pctUsado >= 70

  return (
    <div className="min-h-screen bg-[#f9eedc]">
      <Header onRefresh={() => load(true)} refreshing={refreshing} />

      <main className="max-w-5xl mx-auto px-6 pb-12">

        {/* Empty: sem atividade */}
        {(data?.acoes_tomadas === 0 && data?.creditos_consumidos_mes === 0) && (
          <EmptyNoActivity />
        )}

        {/* Alerta de créditos */}
        {emAlerta && (
          <div className={`mb-6 rounded-2xl border p-4 flex items-center gap-3
            ${pctUsado >= 100
              ? 'bg-[#FDE8E0] border-[#e13500]/30'
              : pctUsado >= 90
                ? 'bg-[#FFF3E0] border-[#C4841D]/30'
                : 'bg-[#FFF3E0] border-[#C4841D]/20'
            }`}
          >
            <AlertTriangle
              size={16}
              className={pctUsado >= 90 ? 'text-[#e13500]' : 'text-[#C4841D]'}
            />
            <p className="text-sm flex-1">
              <span className="font-semibold text-[#161616]">
                {pctUsado}% dos créditos consumidos
              </span>
              {' — '}
              <span className="text-[#5A5A5A]">
                {pctUsado >= 100
                  ? 'Créditos esgotados. O agente pausou.'
                  : 'Recarregue para garantir continuidade.'}
              </span>
            </p>
            <Link
              to="/recargas"
              className="shrink-0 text-xs font-semibold text-[#e13500] hover:underline"
            >
              Recarregar
            </Link>
          </div>
        )}

        {/* ── 5 Metric Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <MetricCard
            icon={Users}
            iconBg="bg-[#FDE8E0]"
            iconColor="text-[#e13500]"
            label="Pessoas em risco"
            value={data?.pessoas_em_risco_semana ?? 0}
            sub="inativos há 14+ dias sem jornada"
          />
          <MetricCard
            icon={Target}
            iconBg="bg-[#E3F2FD]"
            iconColor="text-[#2B6CB0]"
            label="Ações / 7 dias"
            value={data?.acoes_tomadas ?? 0}
            sub="jornadas tocadas na semana"
          />
          <MetricCard
            icon={TrendingUp}
            iconBg="bg-[#E8F5E9]"
            iconColor="text-[#2D7A4F]"
            label="Taxa de retorno"
            value={`${data?.taxa_retorno ?? 0}%`}
            sub="jornadas completadas no mês"
          />
          <MetricCard
            icon={CreditCard}
            iconBg="bg-[#F5E0E0]"
            iconColor="text-[#670000]"
            label="Créditos restantes"
            value={creditosRestantes === null ? '—' : creditosRestantes}
            sub={`${data?.creditos_consumidos_mes ?? 0} consumidos este mês`}
          />
          <MetricCard
            icon={Clock}
            iconBg="bg-[#f9eedc]"
            iconColor="text-[#C4841D]"
            label="Última execução"
            value={timeAgo(data?.ultima_execucao ?? null)}
            sub={fmtDate(data?.ultima_execucao ?? null)}
          />
          <MetricCard
            icon={CheckCircle2}
            iconBg="bg-[#E8F5E9]"
            iconColor="text-[#2D7A4F]"
            label="Varredura diária"
            value="09h00"
            sub="execução automática todos os dias"
          />
        </div>

        {/* ── Insights de engajamento ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-[#e13500]" />
            <h3 className="font-semibold text-[#161616] text-sm">Como funciona</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: '1',
                title: 'Identificação',
                desc: 'O agente varre diariamente e identifica membros sem contato há mais de 14 dias.',
              },
              {
                step: '2',
                title: 'Contato pastoral',
                desc: 'Envia mensagem via WhatsApp com linguagem pastoral, apresentando-se como assistente da igreja.',
              },
              {
                step: '3',
                title: 'Acompanhamento',
                desc: 'Realiza até 3 touchpoints. Se houver resposta, encaminha ao pastor automaticamente.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#FDE8E0] flex items-center justify-center">
                  <span className="text-xs font-bold text-[#e13500]">{step}</span>
                </div>
                <div>
                  <p className="font-semibold text-[#161616] text-sm mb-1">{title}</p>
                  <p className="text-xs text-[#5A5A5A] leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
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
            <Target size={14} />
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
              Métricas em tempo real — reativação de membros inativos
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
