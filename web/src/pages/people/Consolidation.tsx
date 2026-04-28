import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, AlertTriangle, Search, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

interface ConsolidationPerson {
  id: string
  name: string
  email: string | null
  phone: string | null
  photo_url: string | null
  conversion_date: string | null
  first_visit_date: string | null
  stage_name: string | null
  days_in_stage: number
  at_risk: boolean
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function PersonRow({ person }: { person: ConsolidationPerson }) {
  return (
    <div className={`bg-white rounded-2xl border p-4 flex gap-3 items-start ${person.at_risk ? 'border-red-200' : 'border-black/10'}`}>
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-brand-600 font-semibold text-sm shrink-0">
        {person.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-ekthos-black text-sm truncate">{person.name}</p>
          {person.at_risk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 shrink-0">
              <AlertTriangle className="w-3 h-3" />
              em risco
            </span>
          )}
        </div>

        {person.email && <p className="text-xs text-gray-400 truncate">{person.email}</p>}
        {person.phone && <p className="text-xs text-gray-400">{person.phone}</p>}

        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {person.conversion_date && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-brand-600" />
              Convertido em {formatDate(person.conversion_date)}
            </span>
          )}
          {person.first_visit_date && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Primeira visita {formatDate(person.first_visit_date)}
            </span>
          )}
          {person.stage_name && (
            <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-lg font-medium">
              {person.stage_name} · {person.days_in_stage}d
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Consolidation() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'at_risk'>('all')

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['consolidation', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      // Get people with recent conversion or first visit (last 90 days)
      // Note: person_stage is an ENUM (visitante/contato/…), not a UUID FK to pipeline_stages.
      // The two systems aren't linked yet — filter only by conversion_date.
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const query = supabase
        .from('people')
        .select('id, name, email, phone, photo_url, conversion_date, first_visit_date, person_stage')
        .eq('church_id', churchId!)
        .gte('conversion_date', ninetyDaysAgo.toISOString().split('T')[0])

      const { data } = await query.order('conversion_date', { ascending: false })

      return (data ?? []).map(p => {
        // Days since conversion (or first visit as fallback)
        const refDate = p.first_visit_date ?? p.conversion_date
        const days = daysSince(refDate)
        // person_stage is ENUM — show its value as label directly
        const stageName = p.person_stage as string | null

        return {
          ...p,
          stage_name: stageName,
          days_in_stage: days,
          at_risk: days > 30,
        } as ConsolidationPerson
      })
    },
  })

  const filtered = people
    .filter(p => filter === 'all' || p.at_risk)
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const atRiskCount = people.filter(p => p.at_risk).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
          <Heart className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Consolidação</h1>
          <p className="text-sm text-gray-500">Pessoas nas etapas de entrada do discipulado</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-black/10 p-4 text-center">
          <p className="text-2xl font-bold text-ekthos-black">{people.length}</p>
          <p className="text-xs text-gray-400 mt-1">Em consolidação</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${atRiskCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-black/10'}`}>
          <p className={`text-2xl font-bold ${atRiskCount > 0 ? 'text-red-600' : 'text-ekthos-black'}`}>{atRiskCount}</p>
          <p className="text-xs text-gray-400 mt-1">Em risco (+30 dias)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar pessoa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex border border-black/10 rounded-xl overflow-hidden shrink-0">
          {(['all', 'at_risk'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-cream'
              }`}
            >
              {f === 'all' ? 'Todos' : 'Em risco'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search || filter === 'at_risk'
              ? 'Nenhuma pessoa encontrada.'
              : 'Nenhuma pessoa em consolidação.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(person => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  )
}
