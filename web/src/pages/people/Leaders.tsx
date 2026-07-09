import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users2, Building2, Network, Plus, X, Pencil, Trash2, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateGroup } from '@/features/celulas/hooks/useGroups'
import { useUpdateMinistry } from '@/features/ministerios/hooks/useMinisterios'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import PersonSelect from '@/components/ui/PersonSelect'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Tipos ─────────────────────────────────────────────────────────────────────
// Cada papel guarda a origem (refId = id da célula/ministério) e o tipo (kind),
// para que Editar/Transferir/Remover saibam exatamente qual coluna atualizar.
type LeaderRoleKind = 'group_leader' | 'group_coleader' | 'ministry_leader'

interface LeaderRole {
  kind: LeaderRoleKind
  refId: string
  name: string
}

interface Leader {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  roles: LeaderRole[]
}

const roleKey = (r: LeaderRole) => `${r.kind}:${r.refId}`

function LeaderAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-brand-600 font-semibold text-sm">
      {(name?.charAt(0) ?? '?').toUpperCase()}
    </div>
  )
}

function RoleBadge({ kind, name }: { kind: LeaderRoleKind; name: string }) {
  const config: Record<LeaderRoleKind, { bg: string; icon: JSX.Element; label: string }> = {
    group_leader:    { bg: 'bg-brand-50 text-brand-700',     icon: <Network className="w-3 h-3" />,   label: 'Célula' },
    group_coleader:  { bg: 'bg-cream text-gray-600',         icon: <Network className="w-3 h-3" />,   label: 'Co-líder' },
    ministry_leader: { bg: 'bg-purple-50 text-purple-700',   icon: <Building2 className="w-3 h-3" />,  label: 'Ministério' },
  }
  const c = config[kind]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${c.bg}`}>
      {c.icon}
      {name}
    </span>
  )
}

function roleLabel(r: LeaderRole): string {
  if (r.kind === 'group_leader')    return `Célula: ${r.name} (Líder)`
  if (r.kind === 'group_coleader')  return `Célula: ${r.name} (Co-líder)`
  return `Ministério: ${r.name} (Líder)`
}

function LeaderCard({
  leader, onView, onEdit, onRemove,
}: {
  leader: Leader
  onView: (l: Leader) => void
  onEdit: (l: Leader) => void
  onRemove: (l: Leader) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/10 p-4 flex flex-col gap-3">
      <div className="flex gap-3">
        <LeaderAvatar name={leader.name} photoUrl={leader.avatar_url} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ekthos-black text-sm truncate">{leader.name}</p>
          {leader.email && <p className="text-xs text-gray-400 truncate">{leader.email}</p>}
          {leader.phone && <p className="text-xs text-gray-400">{leader.phone}</p>}
          {leader.roles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {leader.roles.map((r) => (
                <RoleBadge key={roleKey(r)} kind={r.kind} name={r.name} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ações do card */}
      <div className="flex items-center gap-2 pt-2 border-t border-black/5">
        <button
          onClick={() => onView(leader)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          title="Ver detalhe do líder"
        >
          <Eye className="w-3.5 h-3.5" /> Detalhe
        </button>
        <button
          onClick={() => onEdit(leader)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-ekthos-black"
          title="Editar / transferir papel"
        >
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
        <button
          onClick={() => onRemove(leader)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600"
          title="Remover papel de líder (a pessoa continua cadastrada)"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remover papel
        </button>
      </div>
    </div>
  )
}

// ── EditLeaderModal ────────────────────────────────────────────────────────────
// Lista cada atribuição do líder. Por linha: transferir para outra pessoa
// (MESMO PersonSelect compartilhado) ou remover aquele papel específico.

function useLeaderRoleMutations(churchId: string) {
  const queryClient = useQueryClient()
  const updateGroup = useUpdateGroup()
  const updateMinistry = useUpdateMinistry()

  async function applyRole(r: LeaderRole, newPersonId: string | null) {
    if (r.kind === 'ministry_leader') {
      await updateMinistry.mutateAsync({ id: r.refId, church_id: churchId, leaderPersonId: newPersonId })
    } else if (r.kind === 'group_coleader') {
      await updateGroup.mutateAsync({ id: r.refId, church_id: churchId, co_leader_id: newPersonId })
    } else {
      await updateGroup.mutateAsync({ id: r.refId, church_id: churchId, leader_id: newPersonId })
    }
    // Ao transferir, marca o novo líder como is_leader=true (dado histórico,
    // espelha AssignLeaderModal). Em remoção (newPersonId=null) não mexe em people.
    if (newPersonId) {
      await supabase.from('people').update({ is_leader: true }).eq('id', newPersonId)
    }
    await queryClient.invalidateQueries({ queryKey: ['leaders', churchId] })
  }

  return { applyRole }
}

function EditLeaderModal({ leader, churchId, onClose }: { leader: Leader; churchId: string; onClose: () => void }) {
  const { applyRole } = useLeaderRoleMutations(churchId)
  const [targets, setTargets] = useState<Record<string, string | null>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(r: LeaderRole, newPersonId: string | null) {
    setBusyKey(roleKey(r))
    setError(null)
    try {
      await applyRole(r, newPersonId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar papel')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-ekthos-black">Editar papéis de {leader.name}</h2>
            <p className="text-xs text-gray-400">Transferir para outra pessoa ou remover um papel.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {leader.roles.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Este líder não possui papéis ativos.</p>
        ) : (
          <div className="space-y-4">
            {leader.roles.map((r) => {
              const k = roleKey(r)
              const target = targets[k] ?? null
              const isBusy = busyKey === k
              return (
                <div key={k} className="rounded-xl border border-black/10 p-3 space-y-2">
                  <p className="text-sm font-medium text-ekthos-black">{roleLabel(r)}</p>
                  <label className="block text-xs font-medium text-gray-500">Transferir para</label>
                  <PersonSelect
                    value={target}
                    onChange={(id) => setTargets((prev) => ({ ...prev, [k]: id }))}
                    placeholder="Buscar pessoa pelo nome..."
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => { void handle(r, target) }}
                      loading={isBusy}
                      disabled={isBusy || !target || target === leader.id}
                      className="flex-1"
                    >
                      Transferir
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => { void handle(r, null) }}
                      loading={isBusy}
                      disabled={isBusy}
                      className="flex-1"
                    >
                      Remover papel
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="pt-1">
          <Button variant="secondary" onClick={onClose} className="w-full">Fechar</Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── RemoveLeaderModal ──────────────────────────────────────────────────────────
// Remove TODOS os papéis de líder da pessoa (a pessoa permanece em people).

function RemoveLeaderModal({ leader, churchId, onClose }: { leader: Leader; churchId: string; onClose: () => void }) {
  const { applyRole } = useLeaderRoleMutations(churchId)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setRemoving(true)
    setError(null)
    try {
      for (const r of leader.roles) {
        await applyRole(r, null)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover papéis')
      setRemoving(false)
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
        <h3 className="font-semibold text-ekthos-black">Remover papel de líder?</h3>
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-ekthos-black">{leader.name}</span> deixará de ser líder de:
        </p>
        <ul className="text-sm text-gray-600 list-disc pl-5 space-y-0.5">
          {leader.roles.map((r) => <li key={roleKey(r)}>{roleLabel(r)}</li>)}
        </ul>
        <p className="text-xs text-gray-400">
          A pessoa continua cadastrada normalmente — apenas o vínculo de liderança é desfeito.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={removing} className="flex-1">Cancelar</Button>
          <Button onClick={() => { void confirm() }} loading={removing} disabled={removing} className="flex-1">
            Remover papel
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── AssignLeaderModal (inalterado) ──────────────────────────────────────────────

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
      // BUG-2 fix: sem guard de 2 chars — retorna até 8 pessoas ao abrir,
      // filtra por nome quando digitado
      let q = supabase
        .from('people')
        .select('id, name, email')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .is('left_at', null)
        .limit(8)
      if (personSearch.trim().length > 0) {
        q = q.ilike('name', `%${personSearch}%`)
      }
      const { data } = await q
      return (data ?? []) as PersonResult[]
    },
    enabled: !selectedPerson,
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
      const update = role === 'leader'
        ? { leader_id: selectedPerson.id }
        : { co_leader_id: selectedPerson.id }
      const { error: err } = await supabase
        .from('groups')
        .update(update)
        .eq('id', groupId)
      if (err) throw new Error(err.message)
      // Manter is_leader=true como dado histórico (PersonSelect não filtra mais por este campo)
      await supabase
        .from('people')
        .update({ is_leader: true })
        .eq('id', selectedPerson.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaders', churchId] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <ModalPortal>
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
              {!selectedPerson && (isFetching || searchResults.length > 0) && (
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
    </ModalPortal>
  )
}

export default function Leaders() {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [editing, setEditing] = useState<Leader | null>(null)
  const [removing, setRemoving] = useState<Leader | null>(null)

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
        .is('left_at', null)

      if (!people) return []

      // Build leaders array with roles (incluindo refId p/ edição/remoção)
      return people.map(p => {
        const roles: LeaderRole[] = []
        groups?.forEach(g => {
          if (g.leader_id === p.id) roles.push({ kind: 'group_leader', refId: g.id, name: g.name })
          if (g.co_leader_id === p.id) roles.push({ kind: 'group_coleader', refId: g.id, name: g.name })
        })
        ministries?.forEach(m => {
          if (m.leader_id === p.id) roles.push({ kind: 'ministry_leader', refId: m.id, name: m.name })
        })
        return { ...p, roles } as Leader
      }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
    },
  })

  const filtered = leaders.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalCelulas = leaders.filter(l => l.roles.some(r => r.kind === 'group_leader' || r.kind === 'group_coleader')).length
  const totalMinisterios = leaders.filter(l => l.roles.some(r => r.kind === 'ministry_leader')).length

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

      {/* Edit / Remove modals */}
      {editing && churchId && (
        <EditLeaderModal leader={editing} churchId={churchId} onClose={() => setEditing(null)} />
      )}
      {removing && churchId && (
        <RemoveLeaderModal leader={removing} churchId={churchId} onClose={() => setRemoving(null)} />
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
            <LeaderCard
              key={leader.id}
              leader={leader}
              onView={(l) => navigate(`/lideres/${l.id}`)}
              onEdit={setEditing}
              onRemove={setRemoving}
            />
          ))}
        </div>
      )}
    </div>
  )
}
