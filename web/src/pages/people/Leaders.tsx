import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users2, Building2, Network, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
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

// ── AssignLeaderModal ─────────────────────────────────────────────────────────

interface PersonResult { id: string; name: string; email: string | null }
interface GroupOption  { id: string; name: string }

function AssignLeaderModal({ onClose, churchId }: { onClose: () => void; churchId: string }) {
  const queryClient = useQueryClient()
  const [personSearch, setPersonSearch]   = useState('')
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null)
  const [groupId, setGroupId]             = useState('')
  const [role, setRole]                   = useState<'leader' | 'co_leader'>('leader')
  const [error, setError]                 = useState<string | null>(null)

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ['people_search_leaders', churchId, personSearch],
    queryFn: async () => {
      if (personSearch.trim().length < 2) return []
      const { data } = await supabase
        .from('people')
        .select('id, name, email')
        .eq('church_id', churchId)
        .ilike('name', `%${personSearch}%`)
        .is('deleted_at', null)
        .limit(8)
      return (data ?? []) as PersonResult[]
    },
    enabled: personSearch.trim().length >= 2,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups_for_leaders', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('groups')
        .select('id, name')
        .eq('church_id', churchId)
        .eq('status', 'active')
        .order('name')
      return (data ?? []) as GroupOption[]
    },
    enabled: Boolean(churchId),
  })

  const assign = useMutation({
    mutationFn: async () => {
      if (!selectedPerson || !groupId) throw new Error('Selecione pessoa e célula')
      const field = role === 'leader' ? 'leader_id' : 'co_leader_id'
      const { error: err } = await supabase
        .from('groups')
        .update({ [field]: selectedPerson.id })
        .eq('id', groupId)
      if (err) throw new Error(err.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaders', churchId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ekthos-black">Atribuir Líder à Célula</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Person search */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Pessoa *</label>
          {selectedPerson ? (
            <div className="flex items-center justify-between bg-brand-50 rounded-xl px-3 py-2.5">
              <span className="text-sm font-medium text-brand-700">{selectedPerson.name}</span>
              <button onClick={() => { setSelectedPerson(null); setPersonSearch('') }}
                className="p-1 rounded text-brand-400 hover:text-brand-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input placeholder="Buscar por nome..." value={personSearch}
                onChange={e => setPersonSearch(e.target.value)} />
              {personSearch.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-black/10 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {isFetching ? (
                    <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">Nenhuma pessoa encontrada</p>
                  ) : searchResults.map(p => (
                    <button key={p.id}
                      onClick={() => { setSelectedPerson(p); setPersonSearch('') }}
                      className="w-full text-left px-4 py-2.5 hover:bg-cream transition-colors">
                      <p className="text-sm font-medium text-ekthos-black">{p.name}</p>
                      {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cell select */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Célula *</label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
            <option value="">Selecionar célula...</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Papel</label>
          <select value={role} onChange={e => setRole(e.target.value as 'leader' | 'co_leader')}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600">
            <option value="leader">Líder</option>
            <option value="co_leader">Co-líder</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={() => { assign.mutate() }}
            loading={assign.isPending}
            disabled={!selectedPerson || !groupId || assign.isPending}
            className="flex-1"
          >
            Atribuir
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Leaders() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)

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

      // ministries.leader_id → people.id (direto, sem tabela intermediária)
      ministries?.forEach(m => {
        if (m.leader_id) personIds.add(m.leader_id)
      })

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
          if (m.leader_id === p.id) roles.push({ type: 'ministerio', name: m.name })
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
            <Users2 className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ekthos-black">Líderes</h1>
            <p className="text-sm text-gray-500">Responsáveis por células e ministérios</p>
          </div>
        </div>
        <Button onClick={() => setAssignOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Atribuir Líder</span>
        </Button>
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

      {/* Assign leader modal */}
      {assignOpen && churchId && (
        <AssignLeaderModal
          onClose={() => setAssignOpen(false)}
          churchId={churchId}
        />
      )}

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
