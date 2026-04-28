import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users2, Building2, Network } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

interface Leader {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  roles: { type: 'celula' | 'coleider' | 'ministerio'; name: string }[]
}

function LeaderAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-brand-600 font-semibold text-sm">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function RoleBadge({ type, name }: { type: 'celula' | 'coleider' | 'ministerio'; name: string }) {
  const config = {
    celula:    { bg: 'bg-brand-50 text-brand-700', icon: <Network className="w-3 h-3" />, label: 'Célula' },
    coleider:  { bg: 'bg-cream text-gray-600',     icon: <Network className="w-3 h-3" />, label: 'Co-líder' },
    ministerio: { bg: 'bg-purple-50 text-purple-700', icon: <Building2 className="w-3 h-3" />, label: 'Ministério' },
  }
  const c = config[type]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${c.bg}`}>
      {c.icon}
      {name}
    </span>
  )
}

function LeaderCard({ leader }: { leader: Leader }) {
  return (
    <div className="bg-white rounded-2xl border border-black/10 p-4 flex gap-3">
      <LeaderAvatar name={leader.name} photoUrl={leader.avatar_url} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ekthos-black text-sm truncate">{leader.name}</p>
        {leader.email && (
          <p className="text-xs text-gray-400 truncate">{leader.email}</p>
        )}
        {leader.phone && (
          <p className="text-xs text-gray-400">{leader.phone}</p>
        )}
        {leader.roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {leader.roles.map((r, i) => (
              <RoleBadge key={i} type={r.type} name={r.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Leaders() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')

  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ['leaders', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      // Fetch group leaders
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name, leader_id, co_leader_id')
        .eq('church_id', churchId!)
        .eq('status', 'active')

      // Fetch ministry leaders
      const { data: ministries } = await supabase
        .from('ministries')
        .select('id, name, leader_id')
        .eq('church_id', churchId!)
        .eq('is_active', true)

      // Collect unique person IDs from groups (leader_id/co_leader_id → people.id directly)
      const personIds = new Set<string>()
      groups?.forEach(g => {
        if (g.leader_id) personIds.add(g.leader_id)
        if (g.co_leader_id) personIds.add(g.co_leader_id)
      })

      // ministries.leader_id → leaders.id (intermediary table) → leaders.person_id → people.id
      const ministryLeaderIds = (ministries ?? []).map(m => m.leader_id).filter(Boolean) as string[]
      const ministryLeaderPersonMap: Record<string, string[]> = {} // ministryId → [personId]

      if (ministryLeaderIds.length > 0) {
        const { data: leadersData } = await supabase
          .from('leaders')
          .select('id, person_id, ministry_id')
          .in('id', ministryLeaderIds)

        leadersData?.forEach(l => {
          if (l.person_id) {
            personIds.add(l.person_id)
            if (l.ministry_id) {
              if (!ministryLeaderPersonMap[l.ministry_id]) ministryLeaderPersonMap[l.ministry_id] = []
              ministryLeaderPersonMap[l.ministry_id].push(l.person_id)
            }
          }
        })
      }

      if (personIds.size === 0) return []

      const { data: people } = await supabase
        .from('people')
        .select('id, name, email, phone, avatar_url')
        .in('id', Array.from(personIds))

      if (!people) return []

      // Build leaders array with roles
      return people.map(p => {
        const roles: Leader['roles'] = []
        groups?.forEach(g => {
          if (g.leader_id === p.id) roles.push({ type: 'celula', name: g.name })
          if (g.co_leader_id === p.id) roles.push({ type: 'coleider', name: g.name })
        })
        ministries?.forEach(m => {
          // Check via the resolved person map (ministryLeaderPersonMap)
          const personIds = ministryLeaderPersonMap[m.id] ?? []
          if (personIds.includes(p.id)) roles.push({ type: 'ministerio', name: m.name })
        })
        return { ...p, roles } as Leader
      }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    },
  })

  const filtered = leaders.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalCelulas = leaders.filter(l => l.roles.some(r => r.type === 'celula')).length
  const totalMinisterios = leaders.filter(l => l.roles.some(r => r.type === 'ministerio')).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
          <Users2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Líderes</h1>
          <p className="text-sm text-gray-500">Responsáveis por células e ministérios</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: leaders.length, icon: <Users2 className="w-4 h-4" /> },
          { label: 'De Células', value: totalCelulas, icon: <Network className="w-4 h-4" /> },
          { label: 'De Ministérios', value: totalMinisterios, icon: <Building2 className="w-4 h-4" /> },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-black/10 p-3 text-center">
            <div className="flex justify-center text-brand-600 mb-1">{stat.icon}</div>
            <p className="text-xl font-bold text-ekthos-black">{stat.value}</p>
            <p className="text-xs text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar líder..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Nenhum líder encontrado.' : 'Nenhum líder cadastrado ainda.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(leader => (
            <LeaderCard key={leader.id} leader={leader} />
          ))}
        </div>
      )}
    </div>
  )
}
