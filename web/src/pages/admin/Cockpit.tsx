import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Building2, TrendingUp, TrendingDown,
  CreditCard, Users, Bot, Activity, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Tipos ──────────────────────────────────────────────────

interface CockpitData {
  mrr_total:           number
  mrr_prev:            number
  churches_total:      number
  churches_configured: number
  churches_onboarding: number
  churches_suspended:  number
  churn_rate:          number
  ticket_medio:        number
  new_this_month:      number
  mrr_series: Array<{ mes: string; mrr: number }>
  alerts: {
    late_payments:       number
    low_health:          number
    onboarding_stuck:    number
    agent_errors:        number
    tasks_pending:       number
  }
}

// ── Helpers ────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function pct(a: number, b: number): string {
  if (b === 0) return '—'
  const d = ((a - b) / b) * 100
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

// ── Componentes ────────────────────────────────────────────

function Metric({
  label, value, sub, trend, color = '#e13500', icon,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: string
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: '#8A8A8A' }}>{label}</p>
        {icon && <span style={{ color }}>{icon}</span>}
      </div>
      <p className="font-mono-ekthos text-3xl font-bold" style={{ color: '#161616' }}>{value}</p>
      <div className="flex items-center gap-2 mt-1.5">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {trend && (
          <span className={`text-xs font-semibold ${trend.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}

function AlertCard({
  label, count, severity = 'warn',
}: {
  label: string
  count: number
  severity?: 'warn' | 'error' | 'info'
}) {
  const colorMap = {
    warn:  { bg: '#FFF8EC', border: '#C4841D', text: '#C4841D' },
    error: { bg: '#FFF0EC', border: '#e13500', text: '#e13500' },
    info:  { bg: '#F0F4FF', border: '#4F6EE1', text: '#4F6EE1' },
  }
  const c = colorMap[severity]
  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3"
      style={{ background: c.bg, borderColor: c.border + '40' }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: c.border + '20' }}
      >
        <span className="font-mono-ekthos text-sm font-bold" style={{ color: c.border }}>
          {count}
        </span>
      </div>
      <p className="text-sm font-medium" style={{ color: c.text }}>{label}</p>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────

export default function AdminCockpit() {
  const [data,    setData]    = useState<CockpitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Não autenticado'); return }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-metrics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar métricas')
      const json = await res.json() as CockpitData
      setData(json)
    } catch (err: unknown) {
      // Fallback com dados simulados enquanto a Edge Function não existe
      setData({
        mrr_total:           0,
        mrr_prev:            0,
        churches_total:      0,
        churches_configured: 0,
        churches_onboarding: 0,
        churches_suspended:  0,
        churn_rate:          0,
        ticket_medio:        0,
        new_this_month:      0,
        mrr_series:          [],
        alerts: { late_payments: 0, low_health: 0, onboarding_stuck: 0, agent_errors: 0, tasks_pending: 0 },
      })
      void err
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
          <h1 className="font-display text-3xl font-bold text-gray-900">Cockpit Ekthos</h1>
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

      {loading && (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Métricas principais — 4 cards */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric
                label="MRR Total"
                value={fmt(data.mrr_total)}
                trend={pct(data.mrr_total, data.mrr_prev)}
                sub="vs mês anterior"
                icon={<TrendingUp size={18} strokeWidth={1.75} />}
              />
              <Metric
                label="Igrejas Ativas"
                value={data.churches_configured}
                sub={`de ${data.churches_total} total`}
                color="#2D7A4F"
                icon={<Building2 size={18} strokeWidth={1.75} />}
              />
              <Metric
                label="Churn Rate"
                value={`${data.churn_rate.toFixed(1)}%`}
                sub="últimos 30 dias"
                color={data.churn_rate > 5 ? '#e13500' : '#2D7A4F'}
                icon={<TrendingDown size={18} strokeWidth={1.75} />}
              />
              <Metric
                label="Ticket Médio"
                value={fmt(data.ticket_medio)}
                sub={`+${data.new_this_month} novo${data.new_this_month !== 1 ? 's' : ''} este mês`}
                color="#670000"
                icon={<CreditCard size={18} strokeWidth={1.75} />}
              />
            </div>
          </section>

          {/* Status das igrejas — 3 cards menores */}
          <section>
            <h2 className="font-display text-lg font-semibold text-gray-800 mb-3">Status das Igrejas</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-black/5 p-4 text-center">
                <p className="font-mono-ekthos text-2xl font-bold text-emerald-600">{data.churches_configured}</p>
                <p className="text-xs text-gray-500 mt-1">Configuradas</p>
              </div>
              <div className="bg-white rounded-xl border border-black/5 p-4 text-center">
                <p className="font-mono-ekthos text-2xl font-bold" style={{ color: '#C4841D' }}>{data.churches_onboarding}</p>
                <p className="text-xs text-gray-500 mt-1">Em onboarding</p>
              </div>
              <div className="bg-white rounded-xl border border-black/5 p-4 text-center">
                <p className="font-mono-ekthos text-2xl font-bold" style={{ color: '#e13500' }}>{data.churches_suspended}</p>
                <p className="text-xs text-gray-500 mt-1">Suspensas</p>
              </div>
            </div>
          </section>

          {/* Gráfico MRR */}
          <section>
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
              <div className="px-5 py-4 border-b border-black/5">
                <h3 className="text-sm font-semibold text-gray-800">Evolução do MRR</h3>
                <p className="text-xs text-gray-400 mt-0.5">Últimos 12 meses</p>
              </div>
              <div className="p-4" style={{ height: 260 }}>
                {data.mrr_series.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-gray-400">Sem dados de MRR ainda</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.mrr_series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f9eedc" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tickFormatter={(v: number) => fmt(v)}
                      />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(v: any) => [fmt(v as number), 'MRR']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="mrr" stroke="#e13500" strokeWidth={2.5} dot={{ fill: '#e13500', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>

          {/* Alertas rápidos */}
          <section>
            <h2 className="font-display text-lg font-semibold text-gray-800 mb-3">Alertas Operacionais</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <AlertCard
                label="Pagamentos atrasados"
                count={data.alerts.late_payments}
                severity="error"
              />
              <AlertCard
                label="Saúde abaixo de 40"
                count={data.alerts.low_health}
                severity="warn"
              />
              <AlertCard
                label="Onboarding travado"
                count={data.alerts.onboarding_stuck}
                severity="warn"
              />
              <AlertCard
                label="Erros de agente"
                count={data.alerts.agent_errors}
                severity="info"
              />
              <AlertCard
                label="Tarefas pendentes"
                count={data.alerts.tasks_pending}
                severity="info"
              />
            </div>
          </section>

          {/* Quick links */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <QuickLink
              icon={<Building2 size={20} strokeWidth={1.75} />}
              title="Ver todas as igrejas"
              sub="Filtrar por plano, status e saúde"
              href="/admin/churches"
            />
            <QuickLink
              icon={<Users size={20} strokeWidth={1.75} />}
              title="Gestão de usuários"
              sub="Permissões e acessos por igreja"
              href="/admin/churches"
            />
            <QuickLink
              icon={<Bot size={20} strokeWidth={1.75} />}
              title="Monitorar agentes"
              sub="Status e erros em tempo real"
              href="/admin/churches"
            />
          </section>
        </>
      )}
    </div>
  )
}

function QuickLink({ icon, title, sub, href }: {
  icon: React.ReactNode
  title: string
  sub: string
  href: string
}) {
  return (
    <a
      href={href}
      className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-all group"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
        style={{ background: '#f9eedc', color: '#e13500' }}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      <Activity size={14} strokeWidth={1.75} className="ml-auto text-gray-300 group-hover:text-gray-500 transition-colors" />
    </a>
  )
}
