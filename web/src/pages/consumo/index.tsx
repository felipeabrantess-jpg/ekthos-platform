/**
 * ConsumePage — /consumo
 *
 * Tela de consumo de créditos da igreja:
 * - Cards resumo: total mês atual + comparativo MoM%
 * - Saldo por escopo (cycle + topup)
 * - Banners threshold: 70/90/100%
 * - Tabela: consumo por agente (com pesos canon visíveis)
 * - Tabela: consumo por tipo de operação
 * - Card: projeção de esgotamento
 * - Filtro de período: 7 / 30 / 90 dias
 * - Link para /recargas
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CreditCard,
  Clock,
  BarChart3,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ConsumoAgente {
  agent_slug: string
  total_credits: number
  total_operacoes: number
}

interface ConsumoOperacao {
  operation_type: string
  total_credits: number
  total_operacoes: number
  media_por_op: number
}

interface SaldoEscopo {
  agent_scope: string
  cycle_credits: number
  topup_credits: number
  total_disponivel: number
  cycle_end: string
}

interface ProjecaoEscopo {
  agent_scope: string
  saldo_total: number
  media_diaria_creditos: number
  dias_estimados: number | null
}

interface PesosCanon {
  message: number
  extraction: number
  synthesis: number
  confirmation: number
}

interface SummaryData {
  consumo_por_agente: ConsumoAgente[]
  consumo_por_operacao: ConsumoOperacao[]
  consumo_total_periodo: number
  consumo_total_mes_atual: number
  consumo_total_mes_anterior: number
  comparativo_mom_pct: number | null
  saldo_atual: SaldoEscopo[]
  projecao_esgotamento: ProjecaoEscopo[]
  pesos_canon: PesosCanon
  period_days: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
]

const AGENT_LABELS: Record<string, string> = {
  'agent-acolhimento':  'Acolhimento',
  'agent-reengajamento': 'Reengajamento',
  'agent-operacao':     'Operação',
  'pool-iniciante':     'Pool Iniciante',
  'pool-crescimento':   'Pool Crescimento',
  'pool-avivamento':    'Pool Avivamento',
  'pool-escala':        'Pool Escala',
}

const OPERATION_LABELS: Record<string, string> = {
  message:      'Mensagem',
  extraction:   'Extração de dados',
  synthesis:    'Síntese / resumo',
  confirmation: 'Confirmação',
}

function agentLabel(slug: string) {
  return AGENT_LABELS[slug] ?? slug
}

function opLabel(type: string) {
  return OPERATION_LABELS[type] ?? type
}

function fmtPct(n: number | null) {
  if (n === null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}%`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ── Threshold banner ──────────────────────────────────────────────────────────

function ThresholdBanner({ scope }: { scope: SaldoEscopo }) {
  const CANON_CREDITS: Record<string, number> = {
    'agent-acolhimento': 600,
    'agent-reengajamento': 600,
    'agent-operacao': 800,
    'pool-iniciante': 2000,
    'pool-crescimento': 4000,
    'pool-avivamento': 7500,
    'pool-escala': 12000,
  }
  const canon = CANON_CREDITS[scope.agent_scope] ?? scope.total_disponivel
  if (canon === 0) return null

  // pct consumed = (canon - saldo) / canon
  const consumed = canon - scope.total_disponivel
  const pct = Math.max(0, Math.round((consumed / canon) * 100))

  if (pct < 70) return null

  const is100 = pct >= 100
  const is90  = pct >= 90 && !is100

  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-3
      ${is100
        ? 'bg-[#FDE8E0] border-[#e13500]/30'
        : is90
          ? 'bg-[#FFF3E0] border-[#C4841D]/30'
          : 'bg-[#FFF3E0] border-[#C4841D]/20'
      }`}
    >
      <AlertTriangle
        size={16}
        className={is100 || is90 ? 'text-[#e13500]' : 'text-[#C4841D]'}
      />
      <p className="text-sm flex-1">
        <span className="font-semibold text-[#161616]">
          {agentLabel(scope.agent_scope)}: {pct}% consumido
        </span>
        {' — '}
        <span className="text-[#5A5A5A]">
          {is100
            ? 'Créditos esgotados. Agente pausado.'
            : is90
              ? 'Créditos quase esgotados. Recarregue agora.'
              : 'Considere recarregar em breve.'}
        </span>
      </p>
      <Link
        to="/recargas"
        className="shrink-0 text-xs font-semibold text-[#e13500] hover:underline whitespace-nowrap"
      >
        {is100 ? 'Recarregar ou Upgrade →' : 'Recarregar →'}
      </Link>
    </div>
  )
}

// ── Tooltip customizado Recharts ───────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-black/[0.08] rounded-xl shadow-md px-3 py-2 text-xs">
      <p className="text-[#5A5A5A] mb-1">{label}</p>
      <p className="font-mono font-semibold text-[#161616]">
        {payload[0].value} créditos
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ConsumePage() {
  const { churchId } = useAuth()
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!churchId) return
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    setError(null)

    const { data: result, error: err } = await supabase.rpc(
      'get_church_consumo_summary',
      { p_church_id: churchId, p_period_days: period }
    )

    if (err) {
      setError(err.message ?? 'Erro ao carregar consumo')
    } else {
      setData(result as SummaryData)
    }

    setLoading(false)
    setRefreshing(false)
  }, [churchId, period])

  useEffect(() => { void load() }, [load])

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#5A5A5A]">
          <Loader2 size={20} className="animate-spin text-[#e13500]" />
          <span className="text-sm">Carregando consumo…</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-6 max-w-sm w-full text-center">
          <AlertTriangle size={24} className="text-[#e13500] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#161616] mb-2">Erro ao carregar</p>
          <p className="text-xs text-[#5A5A5A] mb-4">{error}</p>
          <button onClick={() => load()} className="text-sm text-[#e13500] font-medium hover:underline">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const momPct = data.comparativo_mom_pct
  const momPositive = momPct !== null && momPct > 0
  const momNeutral  = momPct === null || momPct === 0

  // BarChart data (consumo por agente)
  const chartData = data.consumo_por_agente.map(a => ({
    name: agentLabel(a.agent_slug),
    creditos: a.total_credits,
  }))

  return (
    <div className="min-h-screen bg-[#f9eedc]">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="px-6 py-6 mb-2">
        <div className="max-w-5xl mx-auto">
          <Link
            to="/agentes"
            className="inline-flex items-center gap-1.5 text-sm text-[#5A5A5A] hover:text-[#161616] mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Agentes
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-serif text-3xl font-semibold text-[#161616] leading-tight">
                Consumo de Créditos
              </h1>
              <p className="text-[#5A5A5A] text-sm mt-1">
                Rastreio de uso por agente e por tipo de operação
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {/* Filtro período */}
              <div className="flex bg-white rounded-xl border border-black/[0.08] overflow-hidden">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPeriod(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors
                      ${period === opt.value
                        ? 'bg-[#e13500] text-white'
                        : 'text-[#5A5A5A] hover:bg-[#f9eedc]'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 text-xs text-[#5A5A5A] font-medium
                           hover:text-[#161616] disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-12 space-y-6">

        {/* ── Threshold banners ─────────────────────────────── */}
        {data.saldo_atual.length > 0 && (
          <div className="space-y-3">
            {data.saldo_atual.map(scope => (
              <ThresholdBanner key={scope.agent_scope} scope={scope} />
            ))}
          </div>
        )}

        {/* ── Cards resumo ──────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total período */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm col-span-2 md:col-span-1">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#FDE8E0] mb-3">
              <BarChart3 size={18} className="text-[#e13500]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">
              Consumo {period}d
            </p>
            <p className="font-mono text-2xl font-bold text-[#161616]">
              {data.consumo_total_periodo.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-[#8A8A8A] mt-1">créditos no período</p>
          </div>

          {/* Mês atual */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#E8F5E9] mb-3">
              <CreditCard size={18} className="text-[#2D7A4F]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">
              Mês atual
            </p>
            <p className="font-mono text-2xl font-bold text-[#161616]">
              {data.consumo_total_mes_atual.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-[#8A8A8A] mt-1">créditos</p>
          </div>

          {/* Mês anterior */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#f9eedc] mb-3">
              <Clock size={18} className="text-[#C4841D]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">
              Mês anterior
            </p>
            <p className="font-mono text-2xl font-bold text-[#161616]">
              {data.consumo_total_mes_anterior.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-[#8A8A8A] mt-1">créditos</p>
          </div>

          {/* MoM % */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3
              ${momPositive ? 'bg-[#FDE8E0]' : momNeutral ? 'bg-[#f9eedc]' : 'bg-[#E8F5E9]'}`}
            >
              {momNeutral
                ? <Minus size={18} className="text-[#8A8A8A]" />
                : momPositive
                  ? <TrendingUp size={18} className="text-[#e13500]" />
                  : <TrendingDown size={18} className="text-[#2D7A4F]" />
              }
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">
              Variação MoM
            </p>
            <p className={`font-mono text-2xl font-bold
              ${momPositive ? 'text-[#e13500]' : momNeutral ? 'text-[#8A8A8A]' : 'text-[#2D7A4F]'}`}
            >
              {fmtPct(momPct)}
            </p>
            <p className="text-xs text-[#8A8A8A] mt-1">vs. mês anterior</p>
          </div>
        </div>

        {/* ── Saldo por escopo ──────────────────────────────── */}
        {data.saldo_atual.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6">
            <h3 className="font-semibold text-[#161616] text-sm mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-[#e13500]" />
              Saldo disponível
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f9eedc]">
                    <th className="text-left text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Agente</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Ciclo</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Recarga</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Total</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Renova em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.saldo_atual.map(scope => (
                    <tr key={scope.agent_scope} className="border-b border-[#f9eedc] last:border-0">
                      <td className="py-3 font-medium text-[#161616]">{agentLabel(scope.agent_scope)}</td>
                      <td className="py-3 text-right font-mono text-[#5A5A5A]">{scope.cycle_credits}</td>
                      <td className="py-3 text-right font-mono text-[#5A5A5A]">{scope.topup_credits}</td>
                      <td className="py-3 text-right font-mono font-semibold text-[#161616]">{scope.total_disponivel}</td>
                      <td className="py-3 text-right text-[#5A5A5A]">{fmtDate(scope.cycle_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Chart + Tabela por agente ─────────────────────── */}
        <div className={`grid gap-6 ${chartData.length > 0 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>

          {/* BarChart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6">
              <h3 className="font-semibold text-[#161616] text-sm mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-[#e13500]" />
                Consumo por agente ({period}d)
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f9eedc" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#5A5A5A' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#5A5A5A' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9eedc' }} />
                  <Bar dataKey="creditos" fill="#e13500" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela por agente */}
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6">
            <h3 className="font-semibold text-[#161616] text-sm mb-4">
              Detalhamento por agente
            </h3>
            {data.consumo_por_agente.length === 0 ? (
              <EmptyTabela texto="Nenhum consumo no período selecionado" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f9eedc]">
                      <th className="text-left text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Agente</th>
                      <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Créditos</th>
                      <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Operações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consumo_por_agente.map(a => (
                      <tr key={a.agent_slug} className="border-b border-[#f9eedc] last:border-0">
                        <td className="py-2.5 font-medium text-[#161616]">{agentLabel(a.agent_slug)}</td>
                        <td className="py-2.5 text-right font-mono font-semibold text-[#161616]">
                          {a.total_credits.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#5A5A5A]">
                          {a.total_operacoes.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabela por operação (com pesos) ──────────────── */}
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <h3 className="font-semibold text-[#161616] text-sm">
              Consumo por tipo de operação
            </h3>
            {/* Legenda pesos canon */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.pesos_canon).map(([op, peso]) => (
                <span
                  key={op}
                  className="inline-flex items-center gap-1 rounded-full bg-[#f9eedc] px-2.5 py-0.5 text-xs font-medium text-[#5A5A5A]"
                >
                  <Info size={10} className="text-[#8A8A8A]" />
                  {opLabel(op)} = {peso} cr
                </span>
              ))}
            </div>
          </div>

          {data.consumo_por_operacao.length === 0 ? (
            <EmptyTabela texto="Nenhum consumo no período selecionado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f9eedc]">
                    <th className="text-left text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Operação</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Peso canon</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Total créditos</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Operações</th>
                    <th className="text-right text-xs font-semibold uppercase tracking-[0.05em] text-[#5A5A5A] pb-2">Média/op</th>
                  </tr>
                </thead>
                <tbody>
                  {data.consumo_por_operacao.map(op => {
                    const canonWeight = (data.pesos_canon as Record<string, number>)[op.operation_type] ?? '—'
                    return (
                      <tr key={op.operation_type} className="border-b border-[#f9eedc] last:border-0">
                        <td className="py-2.5 font-medium text-[#161616]">{opLabel(op.operation_type)}</td>
                        <td className="py-2.5 text-right">
                          <span className="inline-block rounded-full bg-[#FDE8E0] text-[#e13500] text-xs font-semibold px-2 py-0.5">
                            {canonWeight} cr
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-[#161616]">
                          {op.total_credits.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#5A5A5A]">
                          {op.total_operacoes.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#5A5A5A]">
                          {Number(op.media_por_op).toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Projeção esgotamento ──────────────────────────── */}
        {data.projecao_esgotamento.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-6">
            <h3 className="font-semibold text-[#161616] text-sm mb-4 flex items-center gap-2">
              <Clock size={16} className="text-[#C4841D]" />
              Projeção de esgotamento
              <span className="text-[#8A8A8A] text-xs font-normal ml-1">
                (baseada na média dos últimos {period} dias)
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.projecao_esgotamento.map(p => (
                <div
                  key={p.agent_scope}
                  className={`rounded-xl border p-4
                    ${p.dias_estimados !== null && p.dias_estimados <= 7
                      ? 'border-[#e13500]/30 bg-[#FDE8E0]'
                      : p.dias_estimados !== null && p.dias_estimados <= 14
                        ? 'border-[#C4841D]/30 bg-[#FFF3E0]'
                        : 'border-[#EDE0CC] bg-[#FDF6EB]'
                    }`}
                >
                  <p className="text-xs font-semibold text-[#5A5A5A] mb-2">{agentLabel(p.agent_scope)}</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="font-mono text-2xl font-bold text-[#161616]">
                        {p.dias_estimados === null ? '∞' : `${p.dias_estimados}d`}
                      </p>
                      <p className="text-xs text-[#8A8A8A]">estimativa até esgotamento</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-[#161616]">{p.saldo_total}</p>
                      <p className="text-xs text-[#8A8A8A]">créditos restantes</p>
                      <p className="font-mono text-xs text-[#5A5A5A]">
                        {Number(p.media_diaria_creditos).toFixed(1)} cr/dia
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Link Recargas ─────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <Link
            to="/recargas"
            className="inline-flex items-center gap-2 bg-[#e13500] text-white font-semibold
                       rounded-xl px-5 py-2.5 text-sm hover:bg-[#FF4D1A] transition-colors duration-150"
          >
            <Zap size={15} />
            Recarregar créditos
          </Link>
          <Link
            to="/agentes"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-5 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            Ver agentes
          </Link>
        </div>
      </main>
    </div>
  )
}

// ── Empty table state ─────────────────────────────────────────────────────────

function EmptyTabela({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#f9eedc] mb-3">
        <BarChart3 size={18} className="text-[#8A8A8A]" />
      </div>
      <p className="text-sm text-[#8A8A8A]">{texto}</p>
    </div>
  )
}
