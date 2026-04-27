/**
 * Celulas.tsx — Fase 2: tabs de categorias
 *
 * Tabs:
 *  - Visão geral   → cards com agrupamento ativo/inativo (default)
 *  - Lista         → tabela compacta de todas as células
 *  - Relatórios    → TODO Fase 3 (placeholder)
 */

import { useState } from 'react'
import { X, BarChart2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useCellMembers,
  useAddCellMember,
  useRemoveCellMember,
  useCellMeetings,
  useCreateCellMeeting,
} from '@/features/celulas/hooks/useGroups'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { Group, CellMeeting } from '@/lib/types/joins'

type CelulasTab = 'geral' | 'lista' | 'relatorios'

const TABS: { id: CelulasTab; label: string }[] = [
  { id: 'geral',      label: 'Visão geral' },
  { id: 'lista',      label: 'Lista'       },
  { id: 'relatorios', label: 'Relatórios'  },
]

// ──────────────────────────────────────────────────────────────────────
// Formulário de grupo
// ──────────────────────────────────────────────────────────────────────
interface GroupFormData {
  name: string
  description: string
  meeting_day: string
  meeting_time: string
  location: string
  notes: string
}

const emptyGroupForm: GroupFormData = {
  name: '', description: '', meeting_day: '', meeting_time: '', location: '', notes: '',
}

interface GroupModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  editing: Group | null
}

function GroupModal({ open, onClose, churchId, editing }: GroupModalProps) {
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const [form, setForm] = useState<GroupFormData>(
    editing
      ? { name: editing.name, description: editing.description ?? '', meeting_day: editing.meeting_day ?? '', meeting_time: editing.meeting_time ?? '', location: editing.location ?? '', notes: editing.notes ?? '' }
      : emptyGroupForm
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: keyof GroupFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await updateGroup.mutateAsync({ id: editing.id, church_id: churchId, name: form.name.trim(), description: form.description.trim() || undefined, meeting_day: form.meeting_day.trim() || undefined, meeting_time: form.meeting_time.trim() || undefined, location: form.location.trim() || undefined, notes: form.notes.trim() || undefined })
      } else {
        await createGroup.mutateAsync({ church_id: churchId, name: form.name.trim(), description: form.description.trim() || undefined, meeting_day: form.meeting_day.trim() || undefined, meeting_time: form.meeting_time.trim() || undefined, location: form.location.trim() || undefined, notes: form.notes.trim() || undefined })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar célula')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Célula' : 'Nova Célula'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Nome *</label>
          <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Nome da célula" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Descrição</label>
          <Input value={form.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Breve descrição" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Dia da reunião</label>
            <Input value={form.meeting_day} onChange={(e) => handleChange('meeting_day', e.target.value)} placeholder="Ex: Quinta-feira" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Horário</label>
            <Input value={form.meeting_time} onChange={(e) => handleChange('meeting_time', e.target.value)} placeholder="Ex: 19:30" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Local</label>
          <Input value={form.location} onChange={(e) => handleChange('location', e.target.value)} placeholder="Endereço ou nome do local" />
        </div>
        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Observações</label>
          <Input value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Informações adicionais" />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Painel de detalhes
// ──────────────────────────────────────────────────────────────────────
interface CellDetailPanelProps {
  group: Group
  churchId: string
  onClose: () => void
}

function CellDetailPanel({ group, churchId, onClose }: CellDetailPanelProps) {
  const { data: members, isLoading: membersLoading } = useCellMembers(group.id)
  const { data: meetings, isLoading: meetingsLoading } = useCellMeetings(group.id)
  const addMember = useAddCellMember()
  const removeMember = useRemoveCellMember()
  const createMeeting = useCreateCellMeeting()
  const [newPersonId, setNewPersonId] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [addingMeeting, setAddingMeeting] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [meetingError, setMeetingError] = useState<string | null>(null)

  async function handleAddMember() {
    if (!newPersonId.trim()) return
    setAddingMember(true)
    setMemberError(null)
    try {
      await addMember.mutateAsync({ church_id: churchId, group_id: group.id, person_id: newPersonId.trim() })
      setNewPersonId('')
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Erro ao adicionar membro')
    } finally {
      setAddingMember(false)
    }
  }

  async function handleAddMeeting() {
    if (!meetingDate) return
    setAddingMeeting(true)
    setMeetingError(null)
    try {
      await createMeeting.mutateAsync({ church_id: churchId, group_id: group.id, meeting_date: meetingDate })
      setMeetingDate('')
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : 'Erro ao registrar reunião')
    } finally {
      setAddingMeeting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-dark/50 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ekthos-black">{group.name}</h2>
            {group.meeting_day && (
              <p className="text-sm text-ekthos-black/50">
                {group.meeting_day}{group.meeting_time ? ` às ${group.meeting_time}` : ''}{group.location ? ` — ${group.location}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-ekthos-black/30 hover:text-ekthos-black/70 hover:bg-cream-dark/40 transition-all">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-ekthos-black mb-3">Membros</h3>
            {membersLoading ? <Spinner size="sm" /> : (members ?? []).length === 0 ? (
              <p className="text-sm text-ekthos-black/40">Nenhum membro cadastrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {(members ?? []).map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-cream-dark/30">
                    <div>
                      <p className="text-sm font-medium text-ekthos-black">{m.people?.name ?? m.person_id}</p>
                      <p className="text-xs text-ekthos-black/40 capitalize">{m.role}</p>
                    </div>
                    <button onClick={() => void removeMember.mutateAsync({ id: m.id, group_id: group.id })} className="text-xs text-red-400 hover:text-red-600">
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Input value={newPersonId} onChange={(e) => setNewPersonId(e.target.value)} placeholder="UUID da pessoa" className="flex-1 text-sm" />
              <Button onClick={() => void handleAddMember()} disabled={addingMember || !newPersonId.trim()}>{addingMember ? '...' : 'Adicionar'}</Button>
            </div>
            {memberError && <p className="text-xs text-red-500 mt-1">{memberError}</p>}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ekthos-black mb-3">Reuniões Recentes</h3>
            {meetingsLoading ? <Spinner size="sm" /> : (meetings ?? []).length === 0 ? (
              <p className="text-sm text-ekthos-black/40">Nenhuma reunião registrada.</p>
            ) : (
              <ul className="space-y-2">
                {(meetings ?? []).slice(0, 5).map((m: CellMeeting) => (
                  <li key={m.id} className="py-1.5 px-3 rounded-lg bg-cream-dark/30 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ekthos-black">
                        {new Date(m.meeting_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-xs text-ekthos-black/40">{m.visitors_count} visitante{m.visitors_count !== 1 ? 's' : ''}</span>
                    </div>
                    {m.theme && <p className="text-xs text-ekthos-black/50 mt-0.5">{m.theme}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="flex-1 text-sm" />
              <Button onClick={() => void handleAddMeeting()} disabled={addingMeeting || !meetingDate}>{addingMeeting ? '...' : 'Registrar'}</Button>
            </div>
            {meetingError && <p className="text-xs text-red-500 mt-1">{meetingError}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Card de célula
// ──────────────────────────────────────────────────────────────────────
interface GroupCardProps {
  group: Group
  onEdit: (g: Group) => void
  onView: (g: Group) => void
}

function GroupCard({ group, onEdit, onView }: GroupCardProps) {
  const statusColor = group.status === 'active' ? 'green' : 'gray'
  const statusLabel = group.status === 'active' ? 'Ativa' : 'Inativa'

  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-ekthos-black truncate">{group.name}</h3>
          {group.description && <p className="text-sm text-ekthos-black/50 mt-0.5 line-clamp-2">{group.description}</p>}
        </div>
        <Badge label={statusLabel} variant={statusColor as 'green' | 'gray'} />
      </div>

      {(group.meeting_day || group.location) && (
        <div className="text-sm text-ekthos-black/60 space-y-0.5">
          {group.meeting_day && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-ekthos-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{group.meeting_day}{group.meeting_time ? ` às ${group.meeting_time}` : ''}</span>
            </div>
          )}
          {group.location && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-ekthos-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{group.location}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-cream-dark/40">
        <button onClick={() => onView(group)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Ver detalhes</button>
        <button onClick={() => onEdit(group)} className="text-xs text-ekthos-black/50 hover:text-ekthos-black/80 font-medium">Editar</button>
      </div>
    </div>
  )
}

// ── Tab: Lista compacta ──────────────────────────────────────────────
function ListaTab({ groups, onEdit, onView }: { groups: Group[]; onEdit: (g: Group) => void; onView: (g: Group) => void }) {
  if (groups.length === 0) {
    return <EmptyState title="Nenhuma célula cadastrada" description="Crie a primeira célula pelo botão 'Nova Célula'." />
  }
  return (
    <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-cream-dark/40 border-b border-cream-dark/60">
            <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Nome</th>
            <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Dia / Horário</th>
            <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Local</th>
            <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-dark/40">
          {groups.map(g => (
            <tr key={g.id} className="hover:bg-cream-dark/20 transition-colors cursor-pointer" onClick={() => onView(g)}>
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-ekthos-black">{g.name}</p>
                {g.description && <p className="text-xs text-ekthos-black/40 truncate max-w-xs">{g.description}</p>}
              </td>
              <td className="px-4 py-3 text-sm text-ekthos-black/60">
                {g.meeting_day ? `${g.meeting_day}${g.meeting_time ? ` às ${g.meeting_time}` : ''}` : '—'}
              </td>
              <td className="px-4 py-3 text-sm text-ekthos-black/60">{g.location ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge label={g.status === 'active' ? 'Ativa' : 'Inativa'} variant={g.status === 'active' ? 'green' : 'gray'} />
              </td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(g)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tab: Relatórios (placeholder) ────────────────────────────────────
function RelatoriosTab() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-2xl bg-cream-dark/60 flex items-center justify-center mb-4">
        <BarChart2 size={22} className="text-ekthos-black/30" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-lg font-semibold text-ekthos-black/60 mb-1">Relatórios em breve</h2>
      <p className="text-sm text-ekthos-black/40 max-w-xs">
        Relatórios de presença, crescimento e desempenho das células estarão disponíveis na Fase 3.
      </p>
      {/* TODO Fase 3: implementar relatórios de célula — frequência, crescimento, reuniões */}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────────
export default function Celulas() {
  const { churchId } = useAuth()
  const [activeTab, setActiveTab] = useState<CelulasTab>('geral')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Group | null>(null)
  const [viewing, setViewing]     = useState<Group | null>(null)

  const { data: groups, isLoading, isError, refetch } = useGroups(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(g: Group) { setEditing(g); setModalOpen(true) }
  function handleNew()          { setEditing(null); setModalOpen(true) }

  const activeGroups   = (groups ?? []).filter(g => g.status === 'active')
  const inactiveGroups = (groups ?? []).filter(g => g.status !== 'active')
  const allGroups      = groups ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Células</h1>
          <p className="text-sm text-ekthos-black/50 mt-1">
            {groups
              ? `${activeGroups.length} ativa${activeGroups.length !== 1 ? 's' : ''}${inactiveGroups.length > 0 ? ` · ${inactiveGroups.length} inativa${inactiveGroups.length !== 1 ? 's' : ''}` : ''}`
              : 'Carregando...'}
          </p>
        </div>
        <Button onClick={handleNew}>+ Nova Célula</Button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-cream-dark/50 -mb-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ekthos-black/50 hover:text-ekthos-black/80 hover:border-cream-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content por tab */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as células." onRetry={() => void refetch()} />
      ) : activeTab === 'relatorios' ? (
        <RelatoriosTab />
      ) : activeTab === 'lista' ? (
        <ListaTab groups={allGroups} onEdit={handleEdit} onView={setViewing} />
      ) : (
        // Visão geral — cards com agrupamento
        allGroups.length === 0 ? (
          <EmptyState
            title="Nenhuma célula cadastrada"
            description="Crie a primeira célula clicando em 'Nova Célula'."
            action={<Button onClick={handleNew}>+ Nova Célula</Button>}
          />
        ) : (
          <div className="space-y-6">
            {activeGroups.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Ativas</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeGroups.map(g => <GroupCard key={g.id} group={g} onEdit={handleEdit} onView={setViewing} />)}
                </div>
              </div>
            )}
            {inactiveGroups.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Inativas</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveGroups.map(g => <GroupCard key={g.id} group={g} onEdit={handleEdit} onView={setViewing} />)}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {modalOpen && (
        <GroupModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
        />
      )}
      {viewing && (
        <CellDetailPanel group={viewing} churchId={churchId} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
