import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, Eye, MoreVertical, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Tipos ──────────────────────────────────────────────────

interface ChurchRow {
  id:                  string
  name:                string
  logo_url:            string | null
  city:                string | null
  state:               string | null
  status:              'onboarding' | 'configured' | 'suspended'
  created_at:          string
  plan_slug:           string | null
  subscription_status: string | null
  current_period_end:  string | null
  health_score:        number | null
  user_count:          number
  agent_count:         number
  last_activity:       string | null
}

// ── Helpers ────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  configured:  'Ativa',
  suspended:   'Suspensa',
}

const STATUS_COLOR: Record<string, string> = {
  onboarding: '#C4841D',
  configured:  '#2D7A4F',
  suspended:   '#e13500',
}

const PLAN_LABEL: Record<string, string> = {
  chamado:    'Chamado',
  missao:     'Missão',
  avivamento: 'Avivamento',
}

function HealthBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-300">—</span>
  const color = score >= 70 ? '#2D7A4F' : score >= 40 ? '#C4841D' : '#e13500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="font-mono-ekthos text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: ChurchRow['status'] }) {
  const label = STATUS_LABEL[status] ?? status
  const color = STATUS_COLOR[status] ?? '#8A8A8A'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '18', color }}
    >
      {label}
    </span>
  )
}

function PlanBadge({ slug }: { slug: string | null }) {
  if (!slug) return <span className="text-xs text-gray-300">—</span>
  const colors: Record<string, string> = {
    chamado:    '#5A5A5A',
    missao:     '#e13500',
    avivamento: '#670000',
  }
  const color = colors[slug] ?? '#8A8A8A'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '18', color }}
    >
      {PLAN_LABEL[slug] ?? slug}
    </span>
  )
}

function relDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 30) return `${days}d atrás`
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(new Date(iso))
}

function ChurchAvatar({ name, logo_url }: { name: string; logo_url: string | null }) {
  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={name}
        className="w-8 h-8 rounded-lg object-cover shrink-0"
      />
    )
  }
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold"
      style={{ background: '#e13500' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────

type FilterStatus = 'all' | 'onboarding' | 'configured' | 'suspended'
type FilterPlan   = 'all' | 'chamado' | 'missao' | 'avivamento'

export default function AdminChurches() {
  const navigate = useNavigate()
  const [rows,    setRows]    = useState<ChurchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState<FilterStatus>('all')
  const [plan,    setPlan]    = useState<FilterPlan>('all')

  async function load() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-churches-list`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro ao carregar igrejas')
      const json = await res.json() as ChurchRow[]
      setRows(json)
    } catch {
      // Fallback: query direta via Supabase (requer políticas admin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('admin_churches_overview')
        .select('*')
        .order('created_at', { ascending: false })
      setRows((data as ChurchRow[]) ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function startImpersonate(church: ChurchRow) {
    localStorage.setItem('impersonating', JSON.stringify({
      church_id:   church.id,
      church_name: church.name,
    }))
    navigate('/dashboard')
    window.location.reload()
  }

  const filtered = rows.filter(r => {
    if (status !== 'all' && r.status !== status) return false
    if (plan   !== 'all' && r.plan_slug !== plan) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.state ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-gray-900">Igrejas</h1>
        <p className="text-sm text-gray-400 mt-1">
          {rows.length} igrejas cadastradas
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, cidade..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': '#e13500' } as React.CSSProperties}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          <Filter size={13} strokeWidth={1.75} className="text-gray-400" />
          {(['all', 'configured', 'onboarding', 'suspended'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                status === s
                  ? 'text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={status === s ? { background: '#e13500' } : undefined}
            >
              {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Plan filter */}
        <div className="flex items-center gap-1">
          {(['all', 'chamado', 'missao', 'avivamento'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                plan === p
                  ? 'text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={plan === p ? { background: '#670000' } : undefined}
            >
              {p === 'all' ? 'Planos' : PLAN_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Building2 size={36} strokeWidth={1.25} className="text-gray-200" />
            <p className="text-sm text-gray-400">Nenhuma igreja encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Igreja</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Plano</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Saúde</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Usuários</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Último acesso</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Cadastro</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.03]">
                {filtered.map(church => (
                  <tr key={church.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Igreja */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ChurchAvatar name={church.name} logo_url={church.logo_url} />
                        <div>
                          <p className="font-medium text-gray-900 truncate max-w-[180px]">{church.name}</p>
                          {(church.city || church.state) && (
                            <p className="text-xs text-gray-400">
                              {[church.city, church.state].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Plano */}
                    <td className="px-3 py-3">
                      <PlanBadge slug={church.plan_slug} />
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <StatusBadge status={church.status} />
                    </td>

                    {/* Saúde */}
                    <td className="px-3 py-3">
                      <HealthBar score={church.health_score} />
                    </td>

                    {/* Usuários */}
                    <td className="px-3 py-3">
                      <span className="font-mono-ekthos text-sm text-gray-700">
                        {church.user_count}
                      </span>
                    </td>

                    {/* Último acesso */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-gray-500">{relDate(church.last_activity)}</span>
                    </td>

                    {/* Cadastro */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-gray-400">{relDate(church.created_at)}</span>
                    </td>

                    {/* Ações */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/admin/churches/${church.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                        >
                          <Eye size={12} strokeWidth={1.75} />
                          Ver
                        </button>
                        <div className="relative group">
                          <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
                            <MoreVertical size={14} strokeWidth={1.75} />
                          </button>
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-black/5 py-1 w-40 hidden group-focus-within:block z-10">
                            <button
                              onClick={() => startImpersonate(church)}
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              Entrar como pastor
                            </button>
                            <button
                              onClick={() => navigate(`/admin/churches/${church.id}`)}
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              Ver detalhes
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
