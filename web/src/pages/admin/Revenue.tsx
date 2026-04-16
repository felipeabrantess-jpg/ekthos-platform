import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { TrendingUp, RefreshCw, DollarSign, Bot, Building2, Zap, CheckCircle, AlertTriangle, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Tipos ──────────────────────────────────────────────────

interface StripePrice {
  id:              string
  plan_slug:       string
  nickname:        string
  stripe_price_id: string
  amount_cents:    number
  active:          boolean
}

interface BootstrapResult {
  created: number
  skipped: number
  prices:  Array<{ plan_slug: string; nickname: string; stripe_price_id: string; action: string }>
}

interface RevenueData {
  mrr_total:        number
  arr:              number
  mrr_by_plan: Array<{ plan: string; mrr: number; churches: number }>
  mrr_by_type: Array<{ type: string; value: number }>
  mrr_series:  Array<{ mes: string; total: number; chamado: number; missao: number; avivamento: number }>
  dre: {
    receita_bruta:    number
    descontos:        number
    receita_liquida:  number
    stripe_fees:      number
    resultado:        number
  }
}

// ── Helpers ────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtPct = (v: number, total: number) =>
  total === 0 ? '0%' : `${((v / total) * 100).toFixed(1)}%`

const PLAN_COLORS: Record<string, string> = {
  chamado:    '#5A5A5A',
  missao:     '#e13500',
  avivamento: '#670000',
}

const TYPE_COLORS = ['#e13500', '#C4841D', '#4F6EE1']

// ── Componentes ────────────────────────────────────────────

function BigMetric({ label, value, sub, icon }: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: '#8A8A8A' }}>{label}</p>
        {icon && <span style={{ color: '#e13500' }}>{icon}</span>}
      </div>
      <p className="font-mono-ekthos text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function DreRow({ label, value, bold, color, indent }: {
  label: string
  value: number
  bold?: boolean
  color?: string
  indent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-black/[0.04] last:border-0 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{label}</span>
      <span
        className={`font-mono-ekthos text-sm font-bold ${bold ? '' : 'font-normal'}`}
        style={{ color: color ?? (bold ? '#161616' : '#8A8A8A') }}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

// ── Seção Stripe Bootstrap ─────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const NICKNAME_LABEL: Record<string, string> = {
  plan_base:   'Plano base',
  extra_user:  'Usuário extra',
  extra_agent: 'Agente extra',
}

function StripeBootstrapCard() {
  const [prices,      setPrices]      = useState<StripePrice[]>([])
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [running,     setRunning]     = useState(false)
  const [lastResult,  setLastResult]  = useState<BootstrapResult | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [forceRe,     setForceRe]     = useState(false)

  const loadPrices = useCallback(async () => {
    setLoadingPrices(true)
    try {
      const { data } = await supabase
        .from('stripe_prices')
        .select('id, plan_slug, nickname, stripe_price_id, amount_cents, active')
        .eq('active', true)
        .order('plan_slug')
        .order('nickname')
      setPrices((data as StripePrice[]) ?? [])
    } finally {
      setLoadingPrices(false)
    }
  }, [])

  useEffect(() => { void loadPrices() }, [loadPrices])

  const bootstrapDone = prices.length > 0
  const canRun = !bootstrapDone || forceRe

  async function runBootstrap() {
    setRunning(true)
    setError(null)
    setLastResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')
      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-bootstrap`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json() as BootstrapResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setLastResult(json)
      setForceRe(false)
      await loadPrices()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const fmtCents = (c: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
      {/* Header do card */}
      <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Zap size={15} strokeWidth={1.75} style={{ color: '#e13500' }} />
            Configuração de Pricing (Stripe Bootstrap)
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Popula <code className="bg-gray-100 px-1 rounded text-[11px]">stripe_prices</code> com produtos e prices padrão.
            Idempotente — só cria o que não existe.
          </p>
        </div>

        {/* Badge de status */}
        {loadingPrices ? (
          <Loader size={16} strokeWidth={1.75} className="animate-spin text-gray-300" />
        ) : bootstrapDone ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: '#2D7A4F18', color: '#2D7A4F' }}>
            <CheckCircle size={13} strokeWidth={2} />
            Bootstrap executado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: '#C4841D18', color: '#C4841D' }}>
            <AlertTriangle size={13} strokeWidth={2} />
            Bootstrap pendente
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Lista de prices existentes */}
        {loadingPrices ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : prices.length > 0 ? (
          <div className="rounded-xl border border-black/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500">Plano</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Valor/mês</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">Stripe Price ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {prices.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-700 capitalize">{p.plan_slug}</td>
                    <td className="px-4 py-2.5 text-gray-500">{NICKNAME_LABEL[p.nickname] ?? p.nickname}</td>
                    <td className="px-4 py-2.5 font-mono-ekthos font-bold text-gray-800">{fmtCents(p.amount_cents)}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-[10px]">
                      {p.stripe_price_id.slice(0, 20)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            Nenhum price encontrado em <code className="bg-gray-100 px-1 rounded text-[11px]">stripe_prices</code>.
            Execute o bootstrap para popular.
          </div>
        )}

        {/* Resultado do último run */}
        {lastResult && (
          <div className="rounded-xl px-4 py-3 text-xs font-medium"
            style={{ background: '#2D7A4F10', color: '#2D7A4F' }}>
            ✓ Bootstrap concluído — {lastResult.created} criados, {lastResult.skipped} ignorados (já existiam)
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">
            Erro: {error}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => void runBootstrap()}
            disabled={running || !canRun}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: '#e13500' }}
          >
            {running
              ? <><Loader size={14} strokeWidth={2} className="animate-spin" /> Executando...</>
              : <><Zap size={14} strokeWidth={2} /> Executar Bootstrap</>
            }
          </button>

          {bootstrapDone && !forceRe && (
            <button
              onClick={() => setForceRe(true)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
            >
              Re-executar (re-configurar preços)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────

const EMPTY: RevenueData = {
  mrr_total: 0, arr: 0,
  mrr_by_plan: [], mrr_by_type: [], mrr_series: [],
  dre: { receita_bruta: 0, descontos: 0, receita_liquida: 0, stripe_fees: 0, resultado: 0 },
}

export default function AdminRevenue() {
  const [data,    setData]    = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-revenue-metrics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro')
      setData(await res.json() as RevenueData)
    } catch {
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const now = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900">Receita Global</h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{now}</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 bg-white border border-black/5 hover:bg-gray-50 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stripe Bootstrap — sempre visível, independente do loading de métricas */}
      <StripeBootstrapCard />

      {loading && (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Métricas topo */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <BigMetric
                label="MRR Total"
                value={fmt(data.mrr_total)}
                sub="Receita recorrente mensal"
                icon={<DollarSign size={18} strokeWidth={1.75} />}
              />
              <BigMetric
                label="ARR"
                value={fmt(data.arr)}
                sub="Receita recorrente anual"
                icon={<TrendingUp size={18} strokeWidth={1.75} />}
              />
              <BigMetric
                label="Planos ativos"
                value={String(data.mrr_by_plan.reduce((s, p) => s + p.churches, 0))}
                sub="Igrejas com assinatura paga"
                icon={<Building2 size={18} strokeWidth={1.75} />}
              />
              <BigMetric
                label="Receita líquida"
                value={fmt(data.dre.resultado)}
                sub="Após tarifas Stripe"
                icon={<Bot size={18} strokeWidth={1.75} />}
              />
            </div>
          </section>

          {/* MRR por plano + Breakdown */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* MRR por plano */}
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
              <div className="px-5 py-4 border-b border-black/5">
                <h3 className="text-sm font-semibold text-gray-800">MRR por Plano</h3>
              </div>
              <div className="p-5 space-y-3">
                {data.mrr_by_plan.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Nenhum dado disponível</p>
                ) : (
                  data.mrr_by_plan.map(p => (
                    <div key={p.plan} className="flex items-center gap-4">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: PLAN_COLORS[p.plan] ?? '#8A8A8A' }}
                      />
                      <span className="text-sm text-gray-600 capitalize flex-1">{p.plan}</span>
                      <span className="text-xs text-gray-400">{p.churches} igrejas</span>
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: data.mrr_total > 0 ? `${(p.mrr / data.mrr_total) * 100}%` : '0%',
                            background: PLAN_COLORS[p.plan] ?? '#8A8A8A',
                          }}
                        />
                      </div>
                      <span className="font-mono-ekthos text-sm font-bold text-gray-800 w-24 text-right">
                        {fmt(p.mrr)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Breakdown por tipo (planos / usuários / agentes) */}
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
              <div className="px-5 py-4 border-b border-black/5">
                <h3 className="text-sm font-semibold text-gray-800">Composição da Receita</h3>
              </div>
              <div className="p-5">
                {data.mrr_by_type.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum dado disponível</p>
                ) : (
                  <div className="flex items-center gap-6">
                    <div style={{ height: 160, width: 160, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.mrr_by_type}
                            dataKey="value"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            strokeWidth={0}
                          >
                            {data.mrr_by_type.map((_, i) => (
                              <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                            ))}
                          </Pie>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <Tooltip formatter={(v: any) => [fmt(v as number), '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {data.mrr_by_type.map((t, i) => (
                        <div key={t.type} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[i] }} />
                          <span className="text-xs text-gray-500 flex-1">{t.type}</span>
                          <span className="font-mono-ekthos text-xs font-bold text-gray-700">
                            {fmtPct(t.value, data.mrr_total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Gráfico MRR 12 meses empilhado */}
          <section>
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
              <div className="px-5 py-4 border-b border-black/5">
                <h3 className="text-sm font-semibold text-gray-800">Evolução do MRR por Plano</h3>
                <p className="text-xs text-gray-400 mt-0.5">Últimos 12 meses</p>
              </div>
              <div className="p-4" style={{ height: 280 }}>
                {data.mrr_series.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    Histórico ainda não disponível
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.mrr_series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f9eedc" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tickFormatter={(v: number) => fmt(v)}
                      />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any, name: any) => [fmt(v as number), name as string]} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="chamado"    fill={PLAN_COLORS.chamado}    stackId="a" radius={[0, 0, 0, 0]} name="Chamado" />
                      <Bar dataKey="missao"     fill={PLAN_COLORS.missao}     stackId="a" name="Missão" />
                      <Bar dataKey="avivamento" fill={PLAN_COLORS.avivamento} stackId="a" radius={[4, 4, 0, 0]} name="Avivamento" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>

          {/* DRE simplificado */}
          <section>
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
              <div className="px-5 py-4 border-b border-black/5">
                <h3 className="text-sm font-semibold text-gray-800">DRE Simplificado</h3>
                <p className="text-xs text-gray-400 mt-0.5">Demonstração de resultado — mês atual</p>
              </div>
              <div className="px-5 py-2">
                <DreRow label="Receita Bruta"   value={data.dre.receita_bruta}   bold />
                <DreRow label="Descontos"        value={-data.dre.descontos}      indent color="#C4841D" />
                <DreRow label="Receita Líquida"  value={data.dre.receita_liquida} bold />
                <DreRow label="Tarifas Stripe"   value={-data.dre.stripe_fees}    indent color="#C4841D" />
                <DreRow
                  label="Resultado"
                  value={data.dre.resultado}
                  bold
                  color={data.dre.resultado >= 0 ? '#2D7A4F' : '#e13500'}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
