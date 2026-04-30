import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useGabinete,
  useAddCabinetMember,
  useUpdateCabinetMember,
  useRemoveCabinetMember,
  type CabinetMemberWithPerson,
} from '@/features/gabinete/hooks/useGabinete'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
]

function avatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0]
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

interface MemberCardProps {
  member: CabinetMemberWithPerson
  isFirst: boolean
  isLast: boolean
  onEdit: (m: CabinetMemberWithPerson) => void
  onRemove: (m: CabinetMemberWithPerson) => void
  onMoveUp: (m: CabinetMemberWithPerson) => void
  onMoveDown: (m: CabinetMemberWithPerson) => void
}

function MemberCard({ member, isFirst, isLast, onEdit, onRemove, onMoveUp, onMoveDown }: MemberCardProps) {
  const name = member.people?.name ?? null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col items-center text-center gap-3">
      {/* Avatar */}
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={name ?? 'Foto'}
          className="w-16 h-16 rounded-full object-cover border-2 border-gray-100"
        />
      ) : (
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${avatarColor(name)}`}
        >
          {getInitials(name)}
        </div>
      )}

      {/* Info */}
      <div>
        <p className="text-sm font-semibold text-gray-900">{name ?? '—'}</p>
        <div className="mt-1">
          <Badge label={member.role} variant="blue" />
        </div>
        {member.bio && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2 max-w-[180px]">{member.bio}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-50 w-full justify-center">
        <button
          onClick={() => void onMoveUp(member)}
          disabled={isFirst}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Mover para cima"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => void onMoveDown(member)}
          disabled={isLast}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          title="Mover para baixo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          onClick={() => onEdit(member)}
          className="text-xs text-primary hover:text-primary font-medium px-1"
        >
          Editar
        </button>
        <button
          onClick={() => void onRemove(member)}
          className="text-xs text-red-500 hover:text-red-600 font-medium px-1"
        >
          Remover
        </button>
      </div>
    </div>
  )
}

interface MemberModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  editing: CabinetMemberWithPerson | null
  nextOrderIndex: number
}

function MemberModal({ open, onClose, churchId, editing, nextOrderIndex }: MemberModalProps) {
  const addMember = useAddCabinetMember()
  const updateMember = useUpdateCabinetMember()
  const [form, setForm] = useState({
    personId: editing?.person_id ?? '',
    role: editing?.role ?? '',
    bio: editing?.bio ?? '',
    photo_url: editing?.photo_url ?? '',
    order_index: editing?.order_index ?? nextOrderIndex,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.personId.trim() || !form.role.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await updateMember.mutateAsync({
          id: editing.id,
          church_id: churchId,
          role: form.role.trim(),
          bio: form.bio.trim() || null,
          photo_url: form.photo_url.trim() || null,
          order_index: form.order_index,
        })
      } else {
        await addMember.mutateAsync({
          church_id: churchId,
          person_id: form.personId.trim(),
          role: form.role.trim(),
          bio: form.bio.trim() || null,
          photo_url: form.photo_url.trim() || null,
          order_index: form.order_index,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar membro')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Membro' : 'Adicionar ao Gabinete'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        {!editing && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID da Pessoa (person_id) *</label>
            <Input
              value={form.personId}
              onChange={(e) => setForm((p) => ({ ...p, personId: e.target.value }))}
              placeholder="UUID da pessoa cadastrada"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Cole o ID da pessoa da seção Pessoas</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cargo / Função *</label>
          <Input
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            placeholder="Ex: Pastor, Diácono, Presbítero..."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Biografia</label>
          <Input
            value={form.bio}
            onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
            placeholder="Breve apresentação..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL da Foto</label>
          <Input
            value={form.photo_url}
            onChange={(e) => setForm((p) => ({ ...p, photo_url: e.target.value }))}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Posição (order)</label>
          <Input
            type="number"
            value={String(form.order_index)}
            onChange={(e) => setForm((p) => ({ ...p, order_index: parseInt(e.target.value) || 0 }))}
            placeholder="0"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.personId.trim() || !form.role.trim()}>
            {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Gabinete() {
  const { churchId } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CabinetMemberWithPerson | null>(null)
  const removeMember = useRemoveCabinetMember()
  const updateMember = useUpdateCabinetMember()

  const { data: members, isLoading, isError, refetch } = useGabinete(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(m: CabinetMemberWithPerson) {
    setEditing(m)
    setModalOpen(true)
  }

  async function handleRemove(m: CabinetMemberWithPerson) {
    if (!confirm(`Remover ${m.people?.name ?? 'este membro'} do gabinete?`)) return
    await removeMember.mutateAsync({ id: m.id, churchId: churchId! })
  }

  async function handleMoveUp(m: CabinetMemberWithPerson) {
    const sorted = [...(members ?? [])].sort((a, b) => a.order_index - b.order_index)
    const idx = sorted.findIndex((x) => x.id === m.id)
    if (idx <= 0) return
    const prev = sorted[idx - 1]
    await Promise.all([
      updateMember.mutateAsync({ id: m.id, church_id: churchId!, order_index: prev.order_index }),
      updateMember.mutateAsync({ id: prev.id, church_id: churchId!, order_index: m.order_index }),
    ])
  }

  async function handleMoveDown(m: CabinetMemberWithPerson) {
    const sorted = [...(members ?? [])].sort((a, b) => a.order_index - b.order_index)
    const idx = sorted.findIndex((x) => x.id === m.id)
    if (idx < 0 || idx >= sorted.length - 1) return
    const next = sorted[idx + 1]
    await Promise.all([
      updateMember.mutateAsync({ id: m.id, church_id: churchId!, order_index: next.order_index }),
      updateMember.mutateAsync({ id: next.id, church_id: churchId!, order_index: m.order_index }),
    ])
  }

  const sortedMembers = [...(members ?? [])].sort((a, b) => a.order_index - b.order_index)
  const nextOrderIndex = sortedMembers.length > 0
    ? Math.max(...sortedMembers.map((m) => m.order_index)) + 1
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gabinete Pastoral</h1>
          <p className="text-sm text-gray-500 mt-1">
            {members ? `${members.length} membro${members.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>+ Adicionar Membro</Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar o gabinete." onRetry={() => void refetch()} />
      ) : sortedMembers.length === 0 ? (
        <EmptyState
          title="Gabinete vazio"
          description="Adicione os membros do gabinete pastoral."
          action={<Button onClick={() => { setEditing(null); setModalOpen(true) }}>+ Adicionar Membro</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedMembers.map((member, idx) => (
            <MemberCard
              key={member.id}
              member={member}
              isFirst={idx === 0}
              isLast={idx === sortedMembers.length - 1}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <MemberModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
          nextOrderIndex={nextOrderIndex}
        />
      )}
    </div>
  )
}
