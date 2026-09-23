import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import {
  UserCheck, UserPlus, Users, Network, Droplets,
  GraduationCap, Wallet, AlertTriangle, CheckCircle, BarChart2, TrendingUp, Heart,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canManageFinancial, canManageDepartments } from '@/hooks/useRole'
import type { AppRole } from '@/hooks/useRole'
import { useDashboardPeopleStats } from '@/features/dashboard/hooks/useDashboardPeopleStats'
import { useUnit } from '@/contexts/UnitContext'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'

const BRAND   = '#29B6FF'
const BRAND_L = '#7BE7FF'
const SUCCESS = '#0F6E56'
const WARN    = '#854F0B'

const STAGE_COLORS = [
  '#29B6FF', '#50C4FF', '#7BE7FF', '#B3F0FF',
  '#0F6E56', '#4CEAD8', '#854F0B', '#C4841D',
  '#185FA5', '#2B6CB0', '#0891B2',
]

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
      <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
      {sub && <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  )
}

function MetricCard({
  label, value, sub, meta, alert, color = 'default', icon, href,
}: {
  label: string
  value: string | number
  sub?: string
  meta?: string
  alert?: boolean
  color?: 'default' | 'green' | 'yellow' | 'red' | 'purple' | 'blue'
  icon?: React.ReactNode
  href?: string
}) {
  const navigate = useNavigate()
  const borderMap = {
    default: 'border-border-default',
    green:   'border-success/20',
    yellow:  'border-warning/20',
    red:     'border-border-default',
    purple:  'border-border-default',
    blue:    'border-border-default',
  }
  const valueColorMap = {
    default: 'text-text-primary',
    green:   'text-success',
    yellow:  'text-warning',
    red:     'text-primary-text',
    purple:  'text-text-primary',
    blue:    'text-primary-text',
  }

  const borderClass = borderMap[alert ? 'red' : color]
  const valueClass  = valueColorMap[alert ? 'red' : color]

  return (
    <div
      className={`bg-bg-primary rounded-2xl border p-5 shadow-sm ${borderClass}${href ? ' cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={href ? () => navigate(href) : undefined}
      role={href ? 'button' : undefined}
      tabIndex={href ? 0 : undefined}
      onKeyDown={href ? (e) => { if (e.key === 'Enter') navigate(href) } : undefined}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium leading-tight text-text-secondary">
          {label}
        </p>
        {icon && (
          <span className={`${alert ? 'text-primary-text' : 'text-text-tertiary'}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`font-mono-ekthos text-3xl font-bold mt-2 ${valueClass}`}>
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {sub && <span className="text-xs text-text-tertiary">{sub}</span>}
        {meta && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            alert ? 'bg-bg-hover text-primary-text' : 'bg-bg-hover text-text-secondary'
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
    <div className="rounded-2xl border-2 border-border-default bg-bg-hover p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <AlertTriangle size={18} strokeWidth={1.75} className="text-primary-text shrink-0" />
        <div>
          <p className="text-sm font-bold text-primary-text">
            {items.length} visitante{items.length > 1 ? 's' : ''} sem consolidação
          </p>
          <p className="text-xs text-primary-text/80">
            Entraram há mais de 24h e ainda não foram acompanhados
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 8).map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 bg-white text-primary-text text-xs font-medium px-2.5 py-1 rounded-full border border-border-default">
            {p.nome}
            <span className="text-text-tertiary">· {formatDate(p.created_at)}</span>
          </span>
        ))}
        {items.length > 8 && (
          <span className="text-xs text-primary-text font-semibold self-center">
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
    <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm">
      <div className="px-5 py-4 border-b border-border-default">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {sub && <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>}
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-sm text-text-tertiary">
          <CheckCircle size={16} strokeWidth={1.75} className="text-success shrink-0" />
          {empty ?? 'Nenhum registro'}
        </div>
      ) : (
        <div className="divide-y divide-border-default">
          {data.map((row, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              {columns.map(col => (
                <div key={String(col.key)} className="flex-1 min-w-0">
                  {col.render ? col.render(row[col.key], row) : (
                    <span className="text-sm text-text-primary/70 truncate block">{String(row[col.key] ?? '-')}</span>
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
    <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm">
      <div className="px-5 py-4 border-b border-border-default">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {sub && <p className="text-xs text-text-tertiary mt-0.5">{sub}</p>}
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
      <BarChart2 size={36} strokeWidth={1.25} style={{ color: 'var(--border-default)' }} />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

export default function Dashboard() {
  const { churchId, role } = useAuth()
  const { selectedUnit, selectedUnitRecord, isLoading: unitLoading } = useUnit()
  const { data: s, isLoading: statsLoading, isError, refetch } = useDashboardPeopleStats(churchId ?? '', selectedUnit)

  // Financeiro: fora do escopo de unidade neste PR (donations.unit_id existe; documentado)
  const { data: dizimosOfertasMes = 0 } = useQuery({
    queryKey: ['dashboard-dizimos-mes', churchId],
    enabled: !!churchId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { data } = await supabase
        .from('donations')
        .select('amount')
        .eq('church_id', churchId!)
        .eq('status', 'confirmed')
        .gte('confirmed_at', firstOfMonth)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).reduce((sum: number, d: any) => sum + (d.amount ?? 0), 0)
    },
  })

  if (!churchId) {
    return <ErrorState message="Igreja não identificada. Faça login novamente." />
  }

  if (unitLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !s) {
    return <ErrorState onRetry={() => void refetch()} />
  }

  const appRole = role as AppRole | null
  const showFinancial   = canManageFinancial(appRole)
  const showDepartments = canManageDepartments(appRole)

  const now = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())
  const unitLabel = selectedUnit === 'all' ? 'Todas as unidades'
    : selectedUnit === 'none' ? 'Sem unidade definida'
    : (selectedUnitRecord?.name ?? 'Unidade')
  const unitQuery = `unidade=${selectedUnit}`

  const caminhoDiscipulado = s.por_etapa.map(e => ({ name: e.name, count: e.cnt }))
  let acumulado = 0
  const evolucaoMembros = s.evolucao_12m.map(m => {
    acumulado += m.novos
    const [year, month] = m.mes.split('-')
    const label = new Date(+year, +month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return { mes: label, total: acumulado }
  })
  const totalComEtapa = s.total - s.sem_etapa

  return (
    <div className="space-y-10 pb-8">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-text-primary">
          Dashboard Pastoral
        </h1>
        <p className="text-xs md:text-sm text-text-tertiary mt-1">
          <span className="capitalize">{now}</span> · {unitLabel}
        </p>
      </div>

      {/* Alerta critico */}
      <AlertaCritico items={s.visitantes_sem_consolidacao.map(v => ({ id: v.id, nome: v.nome, created_at: v.created_at ?? '' }))} />

      {/* Saúde pastoral — linha 1: 3 cards */}
      <section>
        <SectionTitle title="Saúde Pastoral" sub={`Indicadores principais · ${unitLabel}`} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <MetricCard
            label="Pessoas ativas"
            value={s.total}
            sub={`${s.sem_etapa} sem etapa no pipeline`}
            color="purple"
            icon={<Users size={18} strokeWidth={1.75} />}
            href={`/pessoas?${unitQuery}`}
          />
          <MetricCard
            label="Novos Visitantes (30 dias)"
            value={s.visitantes_30d}
            sub="na etapa Visitante, cadastrados há até 30 dias"
            color="blue"
            icon={<UserPlus size={18} strokeWidth={1.75} />}
            href={`/pessoas?tab=visitante&periodo=30&${unitQuery}`}
          />
          <MetricCard
            label="Membros"
            value={s.membros}
            sub="na etapa Membro do pipeline"
            color="green"
            icon={<UserCheck size={18} strokeWidth={1.75} />}
            href={`/pessoas?tab=membro&${unitQuery}`}
          />
        </div>
        {/* linha 2: 2 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Células Ativas"
            value={s.celulas_ativas}
            sub={`de ${s.celulas_total} cadastradas`}
            meta="Meta: 45"
            color={s.celulas_ativas >= 45 ? 'green' : 'default'}
            icon={<Network size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Batismos no Trimestre"
            value={s.batismos_trimestre}
            meta="Meta: 15/tri"
            color={s.batismos_trimestre >= 15 ? 'green' : 'default'}
            icon={<Droplets size={18} strokeWidth={1.75} />}
          />
        </div>
        {/* Novos Convertidos widget — etapa canônica */}
        <div className="mt-4">
          <MetricCard
            label="Novos Convertidos"
            value={s.novos_convertidos}
            sub={`na etapa Novo Convertido · ${s.novos_convertidos_30d} entraram nos últimos 30 dias`}
            color={s.novos_convertidos > 0 ? 'green' : 'default'}
            icon={<Heart size={18} strokeWidth={1.75} />}
            href={`/pessoas?tab=novo_convertido&${unitQuery}`}
          />
        </div>
      </section>

      {/* Consolidação de Pessoas */}
      <section>
        <SectionTitle title="Consolidação de Pessoas" sub="Últimos 7 e 90 dias · prazo por etapa" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <MetricCard
            label="Novos esta Semana"
            value={s.novos_semana}
            sub="cadastrados nos últimos 7 dias"
            color="blue"
            icon={<UserPlus size={18} strokeWidth={1.75} />}
          />
          <MetricCard
            label="Parados além do prazo"
            value={s.parados}
            sub="acima do SLA da etapa atual"
            alert={s.parados > 0}
            color={s.parados > 0 ? 'red' : 'green'}
            icon={<AlertTriangle size={18} strokeWidth={1.75} />}
            href={`/pipeline?${unitQuery}`}
          />
          <MetricCard
            label="Consolidação 90 Dias"
            value={`${s.consolidacao_90d}%`}
            sub="cadastrados em 90 dias que avançaram além de Visitante"
            meta="Meta: 60%"
            color={s.consolidacao_90d >= 60 ? 'green' : s.consolidacao_90d >= 40 ? 'yellow' : 'red'}
            icon={<TrendingUp size={18} strokeWidth={1.75} />}
          />
        </div>

        {/* Distribuição por etapa do pipeline */}
        {s.por_etapa.length > 0 && (
          <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-tertiary)' }}>
              Distribuição por Etapa
            </p>
            <div className="space-y-2.5">
              {[...s.por_etapa.map(e => ({ key: e.stage_key ?? e.stage_id, label: e.name, count: e.cnt })),
                { key: '__none', label: 'Sem etapa', count: s.sem_etapa }].map(({ key, label, count }, i) => {
                const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-32 shrink-0 truncate text-text-secondary" title={label}>{label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: key === '__none' ? 'var(--border-default)' : STAGE_COLORS[i % STAGE_COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs font-mono-ekthos text-text-secondary w-12 text-right shrink-0 tabular-nums">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-text-tertiary mt-3">
              {totalComEtapa} com etapa · {s.sem_etapa} sem etapa · total {s.total}
            </p>
          </div>
        )}
      </section>

      {/* Métricas secundárias */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Escola da Fé"
            value={s.escola_da_fe}
            sub="na etapa Escola da Fé"
            meta="Meta: 30/turma"
            color={s.escola_da_fe >= 30 ? 'green' : 'default'}
            icon={<GraduationCap size={18} strokeWidth={1.75} />}
          />
          {showFinancial && (
            <MetricCard
              label="Dízimos e Ofertas"
              value={formatCurrency(dizimosOfertasMes)}
              sub="mês atual (confirmados) · toda a igreja"
              color="green"
              icon={<Wallet size={18} strokeWidth={1.75} />}
            />
          )}
        </div>
      </section>

      {/* Charts: Caminho de Discipulado + Evolução */}
      <section>
        <SectionTitle title="Tendências e Crescimento" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard title="Caminho de Discipulado" sub="Pessoas por etapa do pipeline" height={280}>
            {caminhoDiscipulado.every(c => c.count === 0) ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={caminhoDiscipulado} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--bg-hover)" />
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [v, 'Pessoas']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {caminhoDiscipulado.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Evolução de Pessoas" sub="Cadastros acumulados — últimos 12 meses" height={280}>
            {evolucaoMembros.every(m => m.total === 0) ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoMembros} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-hover)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={36} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(v: any) => [v, 'Pessoas']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
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
            {s.celulas_por_trimestre.length === 0 ? (
              <ChartEmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.celulas_por_trimestre} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-hover)" vertical={false} />
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
            <ChartCard title="Voluntários por Ministério" sub="Voluntários ativos (pessoas da unidade selecionada)" height={240}>
              {s.voluntarios_por_ministerio.length === 0 ? (
                <ChartEmptyState message="Nenhum voluntário cadastrado" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.voluntarios_por_ministerio} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--bg-hover)" />
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
            <TopCelulasChart data={s.top_celulas} height={240} />
          )}
        </div>
      </section>

      {showDepartments && s.top_celulas.length > 0 && (
        <section>
          <TopCelulasChart data={s.top_celulas} height={220} />
        </section>
      )}

      {/* Alertas operacionais */}
      <section>
        <SectionTitle title="Alertas Operacionais" sub="Requerem atenção pastoral" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <AlertaTable
            title="Membros Ausentes"
            sub="Etapa Membro, sem registro de contato há mais de 14 dias"
            empty="Nenhum membro ausente detectado"
            data={s.membros_ausentes as unknown as Record<string, unknown>[]}
            columns={[
              {
                label: 'Nome',
                key: 'nome',
                render: (v) => <span className="text-sm font-medium text-text-primary">{String(v)}</span>,
              },
              {
                label: 'Etapa',
                key: 'etapa',
                render: (v) => (
                  <span className="text-xs text-primary-text bg-bg-hover px-2 py-0.5 rounded-full font-medium">
                    {String(v ?? '—')}
                  </span>
                ),
              },
              {
                label: 'Último Contato',
                key: 'last_contact_at',
                render: (v) => (
                  <span className="text-xs text-primary-text font-semibold text-right block">
                    {relativeDate((v as string | null) ?? null)}
                  </span>
                ),
              },
            ]}
          />

          <AlertaTable
            title="Células em Alerta"
            sub="Células com menos de 3 membros cadastrados"
            empty="Todas as células estão com bom número de membros"
            data={s.celulas_em_alerta as unknown as Record<string, unknown>[]}
            columns={[
              {
                label: 'Célula',
                key: 'name',
                render: (v) => <span className="text-sm font-medium text-text-primary">{String(v)}</span>,
              },
              {
                label: 'Membros',
                key: 'membros',
                render: (v) => {
                  const n = v as number
                  return (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      n === 0 ? 'bg-bg-hover text-primary-text' : 'bg-warning-bg text-warning'
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

function TopCelulasChart({ data, height }: { data: Array<{ name: string; membros: number }>; height: number }) {
  return (
    <ChartCard title="Células com Mais Membros" sub="Top células por número de membros cadastrados" height={height}>
      {data.length === 0 ? (
        <ChartEmptyState message="Nenhum membro com célula cadastrada" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--bg-hover)" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip formatter={(v: any) => [v, 'Membros']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
            <Bar dataKey="membros" fill={BRAND_L} radius={[0, 6, 6, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}
