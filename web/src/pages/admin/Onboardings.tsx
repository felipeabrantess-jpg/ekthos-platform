import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Clock, ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

interface OnboardingChurch {
  id:          string
  name:        string
  city:        string | null
  state:       string | null
  created_at:  string
  plan_slug:   string | null
  user_count:  number
  health_score: number | null
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function relDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso))
}

const PLAN_NAMES: Record<string, string> = {
  chamado: 'Chamado', missao: 'Missão', avivamento: 'Avivamento',
}

export default function AdminOnboardings() {
  const navigate = useNavigate()
  const [data,    setData]    = useState<OnboardingChurch[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-churches-list?status=onboarding&limit=100`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) throw new Error()
      const json = await res.json() as { data: OnboardingChurch[] }
      setData(json.data ?? [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const stuck   = data.filter(c => daysSince(c.created_at) >= 14)
  const recent  = data.filter(c => daysSince(c.created_at) < 14)

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900">Onboardings</h1>
          <p className="text-sm text-gray-400 mt-1">
            {data.length} igreja{data.length !== 1 ? 's' : ''} em onboarding
            {stuck.length > 0 && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#e1350018', color: '#e13500' }}>
                {stuck.length} travada{stuck.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
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

      {!loading && data.length === 0 && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-12 text-center">
          <Building2 size={40} strokeWidth={1.5} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma igreja em onboarding</p>
          <p className="text-sm text-gray-400 mt-1">Todas as igrejas já foram configuradas.</p>
        </div>
      )}

      {!loading && stuck.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3" style={{ color: '#e13500' }}>
            ⚠️ Travadas há mais de 14 dias ({stuck.length})
          </h2>
          <OnboardingTable rows={stuck} onSelect={id => navigate(`/admin/churches/${id}`)} />
        </section>
      )}

      {!loading && recent.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold text-gray-800 mb-3">
            Em andamento ({recent.length})
          </h2>
          <OnboardingTable rows={recent} onSelect={id => navigate(`/admin/churches/${id}`)} />
        </section>
      )}
    </div>
  )
}

function OnboardingTable({ rows, onSelect }: {
  rows: OnboardingChurch[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/5">
            <th className="text-left text-xs font-semibold text-gray-400 px-5 py-3">Igreja</th>
            <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">Plano</th>
            <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">Cadastrada</th>
            <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">Dias</th>
            <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">Usuários</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.03]">
          {rows.map(c => {
            const days  = daysSince(c.created_at)
            const stuck = days >= 14
            return (
              <tr
                key={c.id}
                className="hover:bg-gray-50/60 cursor-pointer transition-colors"
                onClick={() => onSelect(c.id)}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: '#e13500' }}
                    >
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{c.name}</p>
                      {(c.city || c.state) && (
                        <p className="text-xs text-gray-400">{[c.city, c.state].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {PLAN_NAMES[c.plan_slug ?? ''] ?? c.plan_slug ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{relDate(c.created_at)}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={stuck
                      ? { background: '#e1350018', color: '#e13500' }
                      : { background: '#C4841D18', color: '#C4841D' }
                    }
                  >
                    <Clock size={10} strokeWidth={2} />
                    {days}d
                  </span>
                </td>
                <td className="px-4 py-3 font-mono-ekthos text-xs text-gray-600">{c.user_count}</td>
                <td className="px-4 py-3">
                  <ExternalLink size={14} strokeWidth={1.75} className="text-gray-300 hover:text-gray-600 transition-colors" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
