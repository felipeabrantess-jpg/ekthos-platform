import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import {
  UserCheck, UserPlus, Users, Network, Droplets,
  GraduationCap, Wallet, AlertTriangle, CheckCircle, BarChart2, TrendingUp, Heart,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { canManageFinancial, canManageDepartments } from '@/hooks/useRole'
import type { AppRole } from '@/hooks/useRole'
import { usePastoralDashboard } from '@/features/dashboard/hooks/usePastoralDashboard'
import { useConsolidacaoStats, STAGE_COLORS as STAGE_PILL_COLORS } from '@/features/dashboard/hooks/useConsolidacaoStats'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'

const BRAND   = '#e13500'
const BRAND_L = '#F9A890'
const SUCCESS = '#2D7A4F'
const WARN    = '#C4841D'

const STAGE_COLORS = [
  '#e13500', '#F25830', '#F9A890', '#FCCFBF',
  '#2D7A4F', '#4DA070', '#C4841D', '#D9A84F',
  '#670000', '#8B1A1A', '#B85C00',
]

const STAGE_LABELS: Record<string, string> = {
  visitante:    'Visitante',
  contato:      'Contato',
  frequentador: 'Frequentador',
  consolidado:  'Consolidado',
  discipulo:    'Discípulo',
  lider:        'Líder',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function relativeDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `${days} dias atrás`
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-semibold text-ekthos-black">{title}</h2>
      {sub && <p className="text-xs text-ekthos-black/40 mt-0.5">{sub}</p>}
    </div>
  )
}

function MetricCard({
  label, value, sub, meta, alert, color = 'default', icon,
}: {
  label: string
  value: string | number
  sub?: string
  meta?: string
  alert?: boolean
  color?: 'default' | 'green' | 'yellow' | 'red' | 'purple' | 'blue'
  icon?: React.ReactNode
}) {
  const borderMap = {
    default: 'border-cream-dark/50',
    green:   'border-success/20',
    yellow:  'border-warning/20',
    red:     'border-brand-200',
    purple:  'border-wine/20',
    blue:    'border-brand-200',
  }
  const valueColorMap = {
    default: 'text-ekthos-black',
    green:   'text-success',
    yellow:  'text-warning',
    red:     'text-brand-600',
    purple:  'text-wine',
    blue:    'text-brand-600',
  }

  const borderClass = borderMap[alert ? 'red' : color]
  const valueClass  = valueColorMap[alert ? 'red' : color]

  return (
    <div className={`bg-cream-light rounded-2xl border p-5 shadow-sm ${borderClass}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium leading-tight text-ekthos-black/50">
          {label}
        </p>
        {icon && (
          <span className={`${alert ? 'text-brand-600' : 'text-ekthos-black/20'}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`font-mono-ekthos text-3xl font-bold mt-2 ${valueClass}`}>
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {sub && <span className="text-xs text-ekthos-black/40">{sub}</span>}
        {meta && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            alert ? 'bg-brand-50 text-brand-600' : 'bg-cream-dark/60 text-ekthos-black/60'
          }`}>
            {meta}
          </span>
        )}
      </div>
    </div>
  )
}

function AlertaCritico({ items }: {
  items: Array<{ id: string; nome: string; created_at: string }>
}) {
  if (items.length === 0) return null
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <AlertTriangle size={18} strokeWidth={1.75} className="text-brand-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-brand-700">
            {items.length} visitante{items.length > 1 ? 's' : ''} sem consolidação
          </p>
          <p className="text-xs text-brand-600/80">
            Entraram há mais de 24h e ainda não foram acompanhados
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 8).map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 bg-white text-brand-700 text-xs font-medium px-2.5 py-1 rounded-full border border-brand-100">
            {p.nome}
            <span className="text-brand-400">· {formatDate(p.created_at)}</span>
          </span>
        ))}
        {items.length > 8 && (
          <span className="text-xs text-brand-600 font-semibold self-center">
            +{items.length - 8} outros
          </span>
        )}
      </div>
    </div>
  )
}

function AlertaTable<T extends Record<string, unknown>>({
  title, sub, columns, data, empty,
}: {
  title: string
  sub?: string
  columns: Array<{ label: string; key: keyof T; render?: (v: T[keyof T], row: T) => React.ReactNode }>
  data: T[]
  empty?: string
}) {
  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm">
      <div className="px-5 py-4 border-b border-cream-dark/50">
        <h3 className="text-sm font-semibold text-ekthos-black">{title}</h3>
        {sub && <p className="text-xs text-ekthos-black/40 mt-0.5">{sub}</p>}
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-sm text-ekthos-black/40">
          <CheckCircle size={16} strokeWidth={1.75} className="text-success shrink-0" />
          {empty ?? 'Nenhum registro'}
        </div>
      ) : (
        <div className="divide-y divide-cream-dark/40">
          {data.map((row, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              {columns.map(col => (
                <div key={String(col.key)} className="flex-1 min-w-0">
                  {col.render ? col.render(row[col.key], row) : (
                    <span className="text-sm text-ekthos-black/70 truncate block">{String(row[col.key] ?? '-')}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, sub, children, height = 220 }: {
  title: string
  sub?: string
  children: React.ReactNode
  height?: number
}) {
  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm">
      <div className="px-5 py-4 border-b border-cream-dark/50">
        <h3 className="text-sm font-semibold text-ekthos-black">{title}</h3>
        {sub && <p className="text-xs text-ekthos-black/40 mt-0.5">{sub}</p>}
      </div>
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

function ChartEmptyState({ message = 'Nenhum dado no período' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <BarChart2 size={36} strokeWidth={1.25} style={{ color: '#EDE0CC' }} />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

export default function Dashboard() {
  const { churchId, role } = useAuth()
  const { data, isLoading, isError, refetch } = usePastoralDashboard(churchId ?? '')
  const { data: consolidacao } = useConsolidacaoStats(churchId ?? '')

  const { data: novosConvertidos = 0 } = useQuery({
    queryKey: ['novos_convertidos_30d', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { count } = await supabase
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId!)
        .is('deleted_at', null)
        .gte('conversion_date', thirtyDaysAgo.toISOString().split('T')[0])
      return count ?? 0
    },
  })

  if (!churchId) {
    return <ErrorState message="Igreja não identificada. Faça login novamente." />
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

  const appRole = role as AppRole | null
  const showFinancial   = canManageFinancial(appRole)
  const showDepartments = canManageDepartments(appRole)

  const metaConsolidacao = data.taxaConsolidacao >= 80
    ? 'Meta atingida (80%)'
    : data.taxaConsolidacao >= 50
      ? 'Meta: 80%'
      : 'Abaixo de 50%'

  const now = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="space-y-10 pb-8">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-ekthos-black">
          Dashboard Pastoral
        </h1>
        <p className="text-xs md:text-sm text-ekthos-black/40 mt-1 capitalize">{now}</p>
      </div>

      {/* Alerta critico */}
      <AlertaCritico items={data.visitantesSemConsolidacao} />

      {/* Saúde pastoral — linha 1: 3 cards */}
      <section>
        <SectionTitle title="Saúde Pastoral" sub="Indicadores principais da semana" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <MetricCard
            label="Taxa de Consolidação"
            value={`${data.taxaConsolidacao}%`}
            meta={metaConsolidacao}
            alert={data.taxaConsolidacaoAlert}
            color={data.taxaConsolidacao >= 80 ? 'green' : data.taxaConsolidacaoAlert ? 'red' : 'yellow'}
            icon={<UserCheck size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Visitantes esta Semana"
            value={data.visitantesSemana}
            sub="novos esta semana"
            color="blue"
            icon={<UserPlus size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Membros Ativos"
            value={data.membrosAtivos}
            sub="frequentadores ou acima"
            color="purple"
            icon={<Users size={18} strokeWidth={1.75} />}
          />
        </div>
        {/* linha 2: 2 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Células Ativas"
            value={data.celulasAtivas}
            sub={`de ${data.totalCelulas} cadastradas`}
            meta="Meta: 45"
            color={data.celulasAtivas >= 45 ? 'green' : 'default'}
            icon={<Network size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Batismos no Trimestre"
            value={data.batismosTrimestre}
            meta="Meta: 15/tri"
            color={data.batismosTrimestre >= 15 ? 'green' : 'default'}
            icon={<Droplets size={18} strokeWidth={1.75} />}
          />
        </div>
        {/* Novos Convertidos widget */}
        <div className="mt-4">
          <MetricCard
            label="Novos Convertidos (30 dias)"
            value={novosConvertidos}
            sub="com data de conversão nos últimos 30 dias"
            color={novosConvertidos > 0 ? 'green' : 'default'}
            icon={<Heart size={18} strokeWidth={1.75} />}
          />
        </div>
      </section>

      {/* Consolidação de Pessoas */}
      <section>
        <SectionTitle title="Consolidação de Pessoas" sub="Últimos 7, 14 e 90 dias" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <MetricCard
            label="Novos esta Semana"
            value={consolidacao?.novosSemana ?? '—'}
            sub="adicionados nos últimos 7 dias"
            color="blue"
            icon={<UserPlus size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Em Risco"
            value={consolidacao?.emRisco ?? '—'}
            sub="frequentadores+ sem presença há 14d"
            alert={(consolidacao?.emRisco ?? 0) > 0}
            color={(consolidacao?.emRisco ?? 0) > 0 ? 'red' : 'green'}
            icon={<AlertTriangle size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Consolidação 90 Dias"
            value={consolidacao ? `${consolidacao.consolidacao90d}%` : '—'}
            sub="visitantes/contatos avançados de stage"
            meta="Meta: 60%"
            color={
              (consolidacao?.consolidacao90d ?? 0) >= 60 ? 'green' :
              (consolidacao?.consolidacao90d ?? 0) >= 40 ? 'yellow' : 'red'
            }
            icon={<TrendingUp size={18} strokeWidth={1.75} />}
          />
        </div>

        {/* Distribuição por estágio */}
        {consolidacao && consolidacao.porStage.length > 0 && (
          <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(30,20,10,0.4)' }}>
              Distribuição por Estágio
            </p>
            <div className="space-y-2.5">
              {consolidacao.porStage.map(({ stage, label, count }) => {
                const pct = consolidacao.totalPeople > 0
                  ? Math.round((count / consolidacao.totalPeople) * 100)
                  : 0
                const colors = STAGE_PILL_COLORS[stage] ?? {
                  bg: 'bg-cream-dark/40', text: 'text-ekthos-black/50', bar: '#EDE0CC',
                }
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className={`text-xs font-medium w-24 shrink-0 ${colors.text}`}>{label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#EDE0CC' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: colors.bar }}
                      />
                    </div>
                    <span className="text-xs font-mono-ekthos text-ekthos-black/50 w-8 text-right shrink-0">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Métricas secundárias */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Escola da Fé"
            value={data.alunosEscolaDaFe}
            sub="alunos ativos no pipeline"
            meta="Meta: 30/turma"
            color={data.alunosEscolaDaFe >= 30 ? 'green' : 'default'}
            icon={<GraduationCap size={18} strokeWidth={1.75} />}
          />
          {showFinancial && (
            <MetricCard
              label="Dízimos e Ofertas"
              value={formatCurrency(data.dizimosOfertasMes)}
              sub="mês atual (confirmados)"
              color="green"
              icon={<Wallet size={18} strokeWidth={1.75} />}
            />
          )}
        </div>
      </section>

      {/* Charts: Caminho de Discipulado + Evolução de Membros */}
      <section>
        <SectionTitle title="Tendências e Crescimento" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard title="Caminho de Discipulado" sub="Pessoas por etapa do pipeline" height={280}>
            {data.caminhoDiscipulado.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.caminhoDiscipulado} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f9eedc" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [v, 'Pessoas']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {data.caminhoDiscipulado.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Evolução de Membros" sub="Crescimento acumulado — últimos 12 meses" height={280}>
            {data.evolucaoMembros.every(m => m.total === 0) ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.evolucaoMembros} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f9eedc" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={36} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [v, 'Membros']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="total" stroke={BRAND} strokeWidth={2.5} dot={{ fill: BRAND, r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* Charts: Células + Voluntários/Top Células */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard title="Crescimento de Células" sub="Novas células por trimestre (meta: +10%/tri)" height={240}>
            {data.crescimentoCelulas.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.crescimentoCelulas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f9eedc" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [v, 'Células criadas']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="celulas" fill={SUCCESS} radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {showDepartments ? (
            <ChartCard title="Voluntários por Departamento" sub="Total de voluntários ativos por ministério" height={240}>
              {data.voluntariosPorDept.length === 0 ? (
                <ChartEmptyState message="Nenhum voluntário cadastrado" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.voluntariosPorDept} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f9eedc" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip formatter={(v: any) => [v, 'Voluntários']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="total" fill={WARN} radius={[0, 6, 6, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          ) : (
            <ChartCard title="Células com Mais Membros" sub="Top células por número de membros cadastrados" height={240}>
              {data.topCelulas.length === 0 ? (
                <ChartEmptyState message="Nenhum membro com célula cadastrada" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topCelulas} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f9eedc" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip formatter={(v: any) => [v, 'Membros']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="membros" fill={BRAND_L} radius={[0, 6, 6, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          )}
        </div>
      </section>

      {showDepartments && data.topCelulas.length > 0 && (
        <section>
          <ChartCard title="Células com Mais Membros" sub="Top células por número de membros cadastrados" height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topCelulas} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f9eedc" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip formatter={(v: any) => [v, 'Membros']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="membros" fill={BRAND_L} radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {/* Alertas operacionais */}
      <section>
        <SectionTitle title="Alertas Operacionais" sub="Requerem atenção pastoral" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <AlertaTable
            title="Membros Ausentes"
            sub="Sem registro de contato há mais de 14 dias"
            empty="Nenhum membro ausente detectado"
            data={data.membrosAusentes}
            columns={[
              {
                label: 'Nome',
                key: 'nome',
                render: (v) => <span className="text-sm font-medium text-ekthos-black">{String(v)}</span>,
              },
              {
                label: 'Estágio',
                key: 'person_stage',
                render: (v) => (
                  <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                    {STAGE_LABELS[String(v)] ?? String(v)}
                  </span>
                ),
              },
              {
                label: 'Último Contato',
                key: 'last_contact_at',
                render: (v) => (
                  <span className="text-xs text-brand-600 font-semibold text-right block">
                    {relativeDate(v as string | null)}
                  </span>
                ),
              },
            ]}
          />

          <AlertaTable
            title="Células em Alerta"
            sub="Células com menos de 3 membros cadastrados"
            empty="Todas as células estão com bom número de membros"
            data={data.celulasEmAlerta}
            columns={[
              {
                label: 'Célula',
                key: 'name',
                render: (v) => <span className="text-sm font-medium text-ekthos-black">{String(v)}</span>,
              },
              {
                label: 'Membros',
                key: 'membros',
                render: (v) => {
                  const n = v as number
                  return (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      n === 0 ? 'bg-brand-50 text-brand-600' : 'bg-warning-bg text-warning'
                    }`}>
                      {n === 0 ? 'Vazia' : `${n} membro${n > 1 ? 's' : ''}`}
                    </span>
                  )
                },
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
