import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { useAuth } from '@/hooks/useAuth'
import { canManageFinancial, canManageDepartments } from '@/hooks/useRole'
import type { AppRole } from '@/hooks/useRole'
import { usePastoralDashboard } from '@/features/dashboard/hooks/usePastoralDashboard'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'

// â”€â”€â”€ Paleta de cores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BRAND   = '#6366f1'
const BRAND_L = '#a5b4fc'
const SUCCESS = '#22c55e'
const WARN    = '#f59e0b'

const STAGE_COLORS = [
  '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe',
  '#4ade80', '#86efac', '#fbbf24', '#f87171',
  '#34d399', '#2dd4bf', '#60a5fa',
]

// â”€â”€â”€ Componentes base â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  meta,
  alert,
  color = 'default',
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  meta?: string
  alert?: boolean
  color?: 'default' | 'green' | 'yellow' | 'red' | 'purple' | 'blue'
  icon?: string
}) {
  const colorMap = {
    default: 'border-gray-100',
    green:   'border-green-200 bg-green-50/40',
    yellow:  'border-yellow-200 bg-yellow-50/40',
    red:     'border-red-200 bg-red-50/40',
    purple:  'border-purple-200 bg-purple-50/40',
    blue:    'border-blue-200 bg-blue-50/40',
  }
  const valueColor = {
    default: 'text-gray-900',
    green:   'text-green-700',
    yellow:  'text-yellow-700',
    red:     'text-red-700',
    purple:  'text-purple-700',
    blue:    'text-blue-700',
  }

  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${colorMap[alert ? 'red' : color]}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`text-3xl font-bold mt-2 ${valueColor[alert ? 'red' : color]}`}>{value}</p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {meta && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            alert
              ? 'bg-red-100 text-red-700'
              : 'bg-indigo-50 text-indigo-700'
          }`}>
            {meta}
          </span>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ Alerta crÃ­tico (W13) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AlertaCritico({ items }: {
  items: Array<{ id: string; nome: string; created_at: string }>
}) {
  if (items.length === 0) return null
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-600 text-lg">âš ï¸</span>
        <div>
          <p className="text-sm font-bold text-red-800">
            {items.length} visitante{items.length > 1 ? 's' : ''} sem consolidaÃ§Ã£o
          </p>
          <p className="text-xs text-red-600">Entraram hÃ¡ mais de 24h e ainda nÃ£o foram acompanhados</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 8).map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded-full">
            {p.nome}
            <span className="text-red-500">Â· {formatDate(p.created_at)}</span>
          </span>
        ))}
        {items.length > 8 && (
          <span className="text-xs text-red-600 font-medium self-center">+{items.length - 8} outros</span>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ Tabela de alerta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AlertaTable<T extends Record<string, unknown>>({
  title,
  sub,
  columns,
  data,
  empty,
}: {
  title: string
  sub?: string
  columns: Array<{ label: string; key: keyof T; render?: (v: T[keyof T], row: T) => React.ReactNode }>
  data: T[]
  empty?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {data.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">{empty ?? 'Nenhum registro'}</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {data.map((row, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              {columns.map(col => (
                <div key={String(col.key)} className="flex-1 min-w-0">
                  {col.render ? col.render(row[col.key], row) : (
                    <span className="text-sm text-gray-700 truncate block">{String(row[col.key] ?? 'â€”')}</span>
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

// â”€â”€â”€ Widget container â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ChartCard({ title, sub, children, height = 220 }: {
  title: string
  sub?: string
  children: React.ReactNode
  height?: number
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

// â”€â”€â”€ Helpers de formataÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STAGE_LABELS: Record<string, string> = {
  visitante:    'Visitante',
  contato:      'Contato',
  frequentador: 'Frequentador',
  consolidado:  'Consolidado',
  discipulo:    'DiscÃ­pulo',
  lider:        'LÃ­der',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function relativeDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `${days} dias atrÃ¡s`
}

// â”€â”€â”€ PÃ¡gina principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Dashboard() {
  const { churchId, role } = useAuth()
  const { data, isLoading, isError, refetch } = usePastoralDashboard(churchId ?? '')

  if (!churchId) {
    return <ErrorState message="Igreja nÃ£o identificada. FaÃ§a login novamente." />
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
    ? `âœ“ Meta atingida (80%)`
    : data.taxaConsolidacao >= 50
      ? `Meta: 80%`
      : `âš  Abaixo de 50%`

  const now = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="space-y-8 pb-8">

      {/* â”€â”€ Header â”€â”€ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Pastoral</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">{now}</p>
        </div>
      </div>

      {/* â”€â”€ W13: Alerta crÃ­tico â€” Visitantes sem consolidaÃ§Ã£o â”€â”€ */}
      <AlertaCritico items={data.visitantesSemConsolidacao} />

      {/* â”€â”€ MÃ©tricas de saÃºde pastoral (W1, W2, W3, W4, W9) â”€â”€ */}
      <section>
        <SectionTitle title="SaÃºde Pastoral" sub="Indicadores principais da semana" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            label="Taxa de ConsolidaÃ§Ã£o"
            value={`${data.taxaConsolidacao}%`}
            meta={metaConsolidacao}
            alert={data.taxaConsolidacaoAlert}
            color={data.taxaConsolidacao >= 80 ? 'green' : data.taxaConsolidacaoAlert ? 'red' : 'yellow'}
            icon="ðŸ“ˆ"
          />
          <MetricCard
            label="Visitantes esta Semana"
            value={data.visitantesSemana}
            sub="novos esta semana"
            color="blue"
            icon="ðŸ™‹"
          />
          <MetricCard
            label="Membros Ativos"
            value={data.membrosAtivos}
            sub="frequentadores ou acima"
            color="purple"
            icon="ðŸ‘¥"
          />
          <MetricCard
            label="CÃ©lulas Ativas"
            value={data.celulasAtivas}
            sub={`de ${data.totalCelulas} cadastradas`}
            meta={`Meta: 45`}
            color={data.celulasAtivas >= 45 ? 'green' : 'default'}
            icon="ðŸ¡"
          />
          <MetricCard
            label="Batismos no Trimestre"
            value={data.batismosTrimestre}
            meta="Meta: 15/tri"
            color={data.batismosTrimestre >= 15 ? 'green' : 'default'}
            icon="âœï¸"
          />
        </div>
      </section>

      {/* â”€â”€ MÃ©tricas secundÃ¡rias (W15 + W10 financeiro) â”€â”€ */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Escola da FÃ©"
            value={data.alunosEscolaDaFe}
            sub="alunos ativos no pipeline"
            meta="Meta: 30/turma"
            color={data.alunosEscolaDaFe >= 30 ? 'green' : 'default'}
            icon="ðŸ“š"
          />
          {showFinancial && (
            <MetricCard
              label="DÃ­zimos e Ofertas"
              value={formatCurrency(data.dizimosOfertasMes)}
              sub="mÃªs atual (confirmados)"
              color="green"
              icon="ðŸ’°"
            />
          )}
        </div>
      </section>

      {/* â”€â”€ Charts: Caminho de Discipulado (W5) + EvoluÃ§Ã£o de Membros (W14) â”€â”€ */}
      <section>
        <SectionTitle title="TendÃªncias e Crescimento" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* W5: Caminho de Discipulado â€” BarChart horizontal */}
          <ChartCard
            title="Caminho de Discipulado"
            sub="Pessoas por etapa do pipeline"
            height={280}
          >
            {data.caminhoDiscipulado.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Nenhum dado de pipeline
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.caminhoDiscipulado}
                  layout="vertical"
                  margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip                    formatter={(v: any) => [v, 'Pessoas']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {data.caminhoDiscipulado.map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* W14: EvoluÃ§Ã£o de Membros â€” LineChart */}
          <ChartCard
            title="EvoluÃ§Ã£o de Membros"
            sub="Crescimento acumulado â€” Ãºltimos 12 meses"
            height={280}
          >
            {data.evolucaoMembros.every(m => m.total === 0) ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Nenhum dado de crescimento
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.evolucaoMembros}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip                    formatter={(v: any) => [v, 'Membros']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    dot={{ fill: BRAND, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* â”€â”€ Charts: Crescimento de CÃ©lulas (W7) + VoluntÃ¡rios por Dept (W8) â”€â”€ */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* W7: Crescimento de CÃ©lulas */}
          <ChartCard
            title="Crescimento de CÃ©lulas"
            sub="Novas cÃ©lulas por trimestre (meta: +10%/tri)"
            height={240}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.crescimentoCelulas}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip                  formatter={(v: any) => [v, 'CÃ©lulas criadas']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="celulas" fill={SUCCESS} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* W8: VoluntÃ¡rios por Departamento â€” apenas admin/admin_departments */}
          {showDepartments ? (
            <ChartCard
              title="VoluntÃ¡rios por Departamento"
              sub="Total de voluntÃ¡rios ativos por ministÃ©rio"
              height={240}
            >
              {data.voluntariosPorDept.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Nenhum voluntÃ¡rio cadastrado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.voluntariosPorDept}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={110}
                    />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip                      formatter={(v: any) => [v, 'VoluntÃ¡rios']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="total" fill={WARN} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          ) : (
            /* W6: Top CÃ©lulas por Membros (para roles sem acesso a departamentos) */
            <ChartCard
              title="CÃ©lulas com Mais Membros"
              sub="Top cÃ©lulas por nÃºmero de membros cadastrados"
              height={240}
            >
              {data.topCelulas.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Nenhum membro com cÃ©lula cadastrada
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.topCelulas}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={110}
                    />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip                      formatter={(v: any) => [v, 'Membros']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="membros" fill={BRAND_L} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          )}
        </div>
      </section>

      {/* W6: Top CÃ©lulas (se showDepartments, mostra aqui tambÃ©m) */}
      {showDepartments && data.topCelulas.length > 0 && (
        <section>
          <ChartCard
            title="CÃ©lulas com Mais Membros"
            sub="Top cÃ©lulas por nÃºmero de membros cadastrados"
            height={220}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.topCelulas}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip                  formatter={(v: any) => [v, 'Membros']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="membros" fill={BRAND_L} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {/* â”€â”€ Alertas Operacionais (W11 + W12) â”€â”€ */}
      <section>
        <SectionTitle title="Alertas Operacionais" sub="Requerem atenÃ§Ã£o pastoral" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* W11: Membros ausentes > 14 dias */}
          <AlertaTable
            title="Membros Ausentes"
            sub="Sem registro de contato hÃ¡ mais de 14 dias"
            empty="âœ“ Nenhum membro ausente detectado"
            data={data.membrosAusentes}
            columns={[
              {
                label: 'Nome',
                key: 'nome',
                render: (v) => <span className="text-sm font-medium text-gray-800">{String(v)}</span>,
              },
              {
                label: 'EstÃ¡gio',
                key: 'person_stage',
                render: (v) => (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {STAGE_LABELS[String(v)] ?? String(v)}
                  </span>
                ),
              },
              {
                label: 'Ãšltimo Contato',
                key: 'last_contact_at',
                render: (v) => (
                  <span className="text-xs text-red-600 font-medium text-right block">
                    {relativeDate(v as string | null)}
                  </span>
                ),
              },
            ]}
          />

          {/* W12: CÃ©lulas com poucos membros */}
          <AlertaTable
            title="CÃ©lulas em Alerta"
            sub="CÃ©lulas com menos de 3 membros cadastrados"
            empty="âœ“ Todas as cÃ©lulas estÃ£o com bom nÃºmero de membros"
            data={data.celulasEmAlerta}
            columns={[
              {
                label: 'CÃ©lula',
                key: 'name',
                render: (v) => <span className="text-sm font-medium text-gray-800">{String(v)}</span>,
              },
              {
                label: 'Membros',
                key: 'membros',
                render: (v) => {
                  const n = v as number
                  return (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      n === 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
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
