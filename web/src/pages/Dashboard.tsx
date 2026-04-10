import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import {
  UserCheck, UserPlus, Users, Network, Droplets,
  GraduationCap, Wallet, AlertTriangle, CheckCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { canManageFinancial, canManageDepartments } from '@/hooks/useRole'
import type { AppRole } from '@/hooks/useRole'
import { usePastoralDashboard } from '@/features/dashboard/hooks/usePastoralDashboard'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'

// Paleta Ekthos para graficos
const BRAND   = '#e13500'
const BRAND_L = '#F9A890'
const SUCCESS = '#2D7A4F'
const WARN    = '#C4841D'

const STAGE_COLORS = [
  '#e13500', '#F25830', '#F9A890', '#FCCFBF',
  '#2D7A4F', '#4DA070', '#C4841D', '#D9A84F',
  '#670000', '#8B1A1A', '#B85C00',
]

// Labels de estagio
const STAGE_LABELS: Record<string, string> = {
  visitante:    'Visitante',
  contato:      'Contato',
  frequentador: 'Frequentador',
  consolidado:  'Consolidado',
  discipulo:    'Discipulo',
  lider:        'Lider',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function relativeDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `${days} dias atras`
}

// Titulo de secao
function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-semibold text-ekthos-black">{title}</h2>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// Metric card com design Ekthos
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
    default: 'border-black/5',
    green:   'border-success/20',
    yellow:  'border-warning/20',
    red:     'border-brand-200',
    purple:  'border-purple-200',
    blue:    'border-blue-200',
  }
  const valueColorMap = {
    default: 'text-ekthos-black',
    green:   'text-success',
    yellow:  'text-warning',
    red:     'text-brand-600',
    purple:  'text-purple-700',
    blue:    'text-blue-700',
  }

  const borderClass = borderMap[alert ? 'red' : color]
  const valueClass  = valueColorMap[alert ? 'red' : color]

  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm relative overflow-hidden ${borderClass}`}>
      {/* Decoracao de fundo */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5"
        style={{ background: '#f9eedc', transform: 'translate(30%, -30%)' }}
      />
      <div className="flex items-start justify-between relative">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">
          {label}
        </p>
        {icon && (
          <span className={`${alert ? 'text-brand-600' : 'text-gray-300'}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`font-mono-ekthos text-3xl font-bold mt-2 relative ${valueClass}`}>
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap relative">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {meta && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            alert ? 'bg-brand-50 text-brand-600' : 'bg-cream text-ekthos-black'
          }`}>
            {meta}
          </span>
        )}
      </div>
    </div>
  )
}

// Alerta critico de visitantes
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
            {items.length} visitante{items.length > 1 ? 's' : ''} sem consolidacao
          </p>
          <p className="text-xs text-brand-600/80">
            Entraram ha mais de 24h e ainda nao foram acompanhados
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

// Tabela de alerta operacional
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
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
      <div className="px-5 py-4 border-b border-black/5">
        <h3 className="text-sm font-semibold text-ekthos-black">{title}</h3>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-sm text-gray-400">
          <CheckCircle size={16} strokeWidth={1.75} className="text-success shrink-0" />
          {empty ?? 'Nenhum registro'}
        </div>
      ) : (
        <div className="divide-y divide-black/[0.03]">
          {data.map((row, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              {columns.map(col => (
                <div key={String(col.key)} className="flex-1 min-w-0">
                  {col.render ? col.render(row[col.key], row) : (
                    <span className="text-sm text-gray-700 truncate block">{String(row[col.key] ?? '-')}</span>
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

// Card de grafico
function ChartCard({ title, sub, children, height = 220 }: {
  title: string
  sub?: string
  children: React.ReactNode
  height?: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
      <div className="px-5 py-4 border-b border-black/5">
        <h3 className="text-sm font-semibold text-ekthos-black">{title}</h3>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

// Pagina principal
export default function Dashboard() {
  const { churchId, role } = useAuth()
  const { data, isLoading, isError, refetch } = usePastoralDashboard(churchId ?? '')

  if (!churchId) {
    return <ErrorState message="Igreja nao identificada. Faca login novamente." />
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
    <div className="space-y-8 pb-8">

      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-ekthos-black">
          Dashboard Pastoral
        </h1>
        <p className="text-sm text-gray-400 mt-1 capitalize">{now}</p>
      </div>

      {/* Alerta critico — visitantes sem consolidacao */}
      <AlertaCritico items={data.visitantesSemConsolidacao} />

      {/* Saude pastoral */}
      <section>
        <SectionTitle title="Saude Pastoral" sub="Indicadores principais da semana" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            label="Taxa de Consolidacao"
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
          <MetricCard
            label="Celulas Ativas"
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
      </section>

      {/* Metricas secundarias */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Escola da Fe"
            value={data.alunosEscolaDaFe}
            sub="alunos ativos no pipeline"
            meta="Meta: 30/turma"
            color={data.alunosEscolaDaFe >= 30 ? 'green' : 'default'}
            icon={<GraduationCap size={18} strokeWidth={1.75} />}
          />
          {showFinancial && (
            <MetricCard
              label="Dizimos e Ofertas"
              value={formatCurrency(data.dizimosOfertasMes)}
              sub="mes atual (confirmados)"
              color="green"
              icon={<Wallet size={18} strokeWidth={1.75} />}
            />
          )}
        </div>
      </section>

      {/* Charts: Caminho de Discipulado + Evolucao de Membros */}
      <section>
        <SectionTitle title="Tendencias e Crescimento" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard title="Caminho de Discipulado" sub="Pessoas por etapa do pipeline" height={280}>
            {data.caminhoDiscipulado.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Nenhum dado de pipeline
              </div>
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

          <ChartCard title="Evolucao de Membros" sub="Crescimento acumulado - ultimos 12 meses" height={280}>
            {data.evolucaoMembros.every(m => m.total === 0) ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Nenhum dado de crescimento
              </div>
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

      {/* Charts: Celulas + Voluntarios/Top Celulas */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <ChartCard title="Crescimento de Celulas" sub="Novas celulas por trimestre (meta: +10%/tri)" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.crescimentoCelulas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f9eedc" vertical={false} />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip formatter={(v: any) => [v, 'Celulas criadas']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="celulas" fill={SUCCESS} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {showDepartments ? (
            <ChartCard title="Voluntarios por Departamento" sub="Total de voluntarios ativos por ministerio" height={240}>
              {data.voluntariosPorDept.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Nenhum voluntario cadastrado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.voluntariosPorDept} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f9eedc" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip formatter={(v: any) => [v, 'Voluntarios']} contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="total" fill={WARN} radius={[0, 6, 6, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          ) : (
            <ChartCard title="Celulas com Mais Membros" sub="Top celulas por numero de membros cadastrados" height={240}>
              {data.topCelulas.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Nenhum membro com celula cadastrada
                </div>
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
          <ChartCard title="Celulas com Mais Membros" sub="Top celulas por numero de membros cadastrados" height={220}>
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
        <SectionTitle title="Alertas Operacionais" sub="Requerem atencao pastoral" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <AlertaTable
            title="Membros Ausentes"
            sub="Sem registro de contato ha mais de 14 dias"
            empty="Nenhum membro ausente detectado"
            data={data.membrosAusentes}
            columns={[
              {
                label: 'Nome',
                key: 'nome',
                render: (v) => <span className="text-sm font-medium text-ekthos-black">{String(v)}</span>,
              },
              {
                label: 'Estagio',
                key: 'person_stage',
                render: (v) => (
                  <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                    {STAGE_LABELS[String(v)] ?? String(v)}
                  </span>
                ),
              },
              {
                label: 'Ultimo Contato',
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
            title="Celulas em Alerta"
            sub="Celulas com menos de 3 membros cadastrados"
            empty="Todas as celulas estao com bom numero de membros"
            data={data.celulasEmAlerta}
            columns={[
              {
                label: 'Celula',
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
