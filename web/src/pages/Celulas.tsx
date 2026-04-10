import { useState } from 'react'
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
  name: '',
  description: '',
  meeting_day: '',
  meeting_time: '',
  location: '',
  notes: '',
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
      ? {
          name: editing.name,
          description: editing.description ?? '',
          meeting_day: editing.meeting_day ?? '',
          meeting_time: editing.meeting_time ?? '',
          location: editing.location ?? '',
          notes: editing.notes ?? '',
        }
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
        await updateGroup.mutateAsync({
          id: editing.id,
          church_id: churchId,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          meeting_day: form.meeting_day.trim() || undefined,
          meeting_time: form.meeting_time.trim() || undefined,
          location: form.location.trim() || undefined,
          notes: form.notes.trim() || undefined,
        })
      } else {
        await createGroup.mutateAsync({
          church_id: churchId,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          meeting_day: form.meeting_day.trim() || undefined,
          meeting_time: form.meeting_time.trim() || undefined,
          location: form.location.trim() || undefined,
          notes: form.notes.trim() || undefined,
        })
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Nome da célula"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Breve descrição"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dia da reunião</label>
            <Input
              value={form.meeting_day}
              onChange={(e) => handleChange('meeting_day', e.target.value)}
              placeholder="Ex: Quinta-feira"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
            <Input
              value={form.meeting_time}
              onChange={(e) => handleChange('meeting_time', e.target.value)}
              placeholder="Ex: 19:30"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
          <Input
            value={form.location}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="Endereço ou nome do local"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <Input
            value={form.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Informações adicionais"
          />
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
// Painel de detalhes de uma célula
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
      await addMember.mutateAsync({
        church_id: churchId,
        group_id: group.id,
        person_id: newPersonId.trim(),
      })
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
      await createMeeting.mutateAsync({
        church_id: churchId,
        group_id: group.id,
        meeting_date: meetingDate,
      })
      setMeetingDate('')
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : 'Erro ao registrar reunião')
    } finally {
      setAddingMeeting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{group.name}</h2>
            {group.meeting_day && (
              <p className="text-sm text-gray-500">
                {group.meeting_day}{group.meeting_time ? ` às ${group.meeting_time}` : ''}
                {group.location ? ` — ${group.location}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Membros */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Membros</h3>
            {membersLoading ? (
              <Spinner size="sm" />
            ) : (members ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum membro cadastrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {(members ?? []).map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.people?.name ?? m.person_id}</p>
                      <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                    </div>
                    <button
                      onClick={() => void removeMember.mutateAsync({ id: m.id, group_id: group.id })}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Input
                value={newPersonId}
                onChange={(e) => setNewPersonId(e.target.value)}
                placeholder="UUID da pessoa"
                className="flex-1 text-sm"
              />
              <Button onClick={() => void handleAddMember()} disabled={addingMember || !newPersonId.trim()}>
                {addingMember ? '...' : 'Adicionar'}
              </Button>
            </div>
            {memberError && <p className="text-xs text-red-500 mt-1">{memberError}</p>}
          </div>

          {/* Reuniões */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Reuniões Recentes</h3>
            {meetingsLoading ? (
              <Spinner size="sm" />
            ) : (meetings ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma reunião registrada.</p>
            ) : (
              <ul className="space-y-2">
                {(meetings ?? []).slice(0, 5).map((m: CellMeeting) => (
                  <li key={m.id} className="py-1.5 px-3 rounded-lg bg-gray-50 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">
                        {new Date(m.meeting_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {m.visitors_count} visitante{m.visitors_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {m.theme && <p className="text-xs text-gray-500 mt-0.5">{m.theme}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button onClick={() => void handleAddMeeting()} disabled={addingMeeting || !meetingDate}>
                {addingMeeting ? '...' : 'Registrar'}
              </Button>
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{group.name}</h3>
          {group.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{group.description}</p>
          )}
        </div>
        <Badge label={statusLabel} variant={statusColor as 'green' | 'gray'} />
      </div>

      {(group.meeting_day || group.location) && (
        <div className="text-sm text-gray-600 space-y-0.5">
          {group.meeting_day && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{group.meeting_day}{group.meeting_time ? ` às ${group.meeting_time}` : ''}</span>
            </div>
          )}
          {group.location && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{group.location}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-gray-50">
        <button
          onClick={() => onView(group)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Ver detalhes
        </button>
        <button
          onClick={() => onEdit(group)}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          Editar
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────────────
export default function Celulas() {
  const { churchId } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [viewing, setViewing] = useState<Group | null>(null)

  const { data: groups, isLoading, isError, refetch } = useGroups(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(g: Group) {
    setEditing(g)
    setModalOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setModalOpen(true)
  }

  const activeGroups = (groups ?? []).filter((g) => g.status === 'active')
  const inactiveGroups = (groups ?? []).filter((g) => g.status !== 'active')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Células</h1>
          <p className="text-sm text-gray-500 mt-1">
            {groups
              ? `${activeGroups.length} ativa${activeGroups.length !== 1 ? 's' : ''}${inactiveGroups.length > 0 ? ` · ${inactiveGroups.length} inativa${inactiveGroups.length !== 1 ? 's' : ''}` : ''}`
              : 'Carregando...'}
          </p>
        </div>
        <Button onClick={handleNew}>+ Nova Célula</Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as células." onRetry={() => void refetch()} />
      ) : (groups ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma célula cadastrada"
          description="Crie a primeira célula clicando em 'Nova Célula'."
          action={<Button onClick={handleNew}>+ Nova Célula</Button>}
        />
      ) : (
        <div className="space-y-6">
          {activeGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Ativas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onEdit={handleEdit}
                    onView={setViewing}
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Inativas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {inactiveGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onEdit={handleEdit}
                    onView={setViewing}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de criação/edição */}
      {modalOpen && (
        <GroupModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
        />
      )}

      {/* Painel de detalhes */}
      {viewing && (
        <CellDetailPanel
          group={viewing}
          churchId={churchId}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
