import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useMinisterios,
  useCreateMinistry,
  useUpdateMinistry,
  useDeactivateMinistry,
} from '@/features/ministerios/hooks/useMinisterios'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { MinistryWithLeader } from '@/lib/types/joins'

interface MinistryFormData {
  name: string
  description: string
  leaderPersonId: string
}

const emptyForm: MinistryFormData = {
  name: '',
  description: '',
  leaderPersonId: '',
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface MinistryCardProps {
  ministry: MinistryWithLeader
  onEdit: (m: MinistryWithLeader) => void
  onDeactivate: (m: MinistryWithLeader) => void
}

function MinistryCard({ ministry, onEdit, onDeactivate }: MinistryCardProps) {
  const leaderName = ministry.leaders?.people?.name ?? null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{ministry.name}</h3>
          {ministry.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{ministry.description}</p>
          )}
        </div>
        <Badge label="Ativo" variant="green" />
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Líder:</span>
          <span className="font-medium">{leaderName ?? 'Sem líder'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Voluntários:</span>
          <span className="font-medium">{ministry.volunteer_count ?? 0}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t border-gray-50">
        <button
          onClick={() => onEdit(ministry)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Editar
        </button>
        <button
          onClick={() => onDeactivate(ministry)}
          className="text-xs text-red-500 hover:text-red-600 font-medium"
        >
          Desativar
        </button>
      </div>
    </div>
  )
}

interface MinistryModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  editing: MinistryWithLeader | null
}

function MinistryModal({ open, onClose, churchId, editing }: MinistryModalProps) {
  const createMinistry = useCreateMinistry()
  const updateMinistry = useUpdateMinistry()
  const [form, setForm] = useState<MinistryFormData>(
    editing
      ? {
          name: editing.name,
          description: editing.description ?? '',
          leaderPersonId: editing.leaders?.people?.id ?? '',
        }
      : emptyForm
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: keyof MinistryFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await updateMinistry.mutateAsync({
          id: editing.id,
          church_id: churchId,
          name: form.name.trim(),
          slug: slugify(form.name),
          description: form.description.trim() || undefined,
          leaderPersonId: form.leaderPersonId || null,
        })
      } else {
        await createMinistry.mutateAsync({
          church_id: churchId,
          name: form.name.trim(),
          slug: slugify(form.name),
          description: form.description.trim() || undefined,
          leaderPersonId: form.leaderPersonId || undefined,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar ministério')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Ministério' : 'Novo Ministério'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ex: Louvor, Infantil..."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Breve descrição do ministério"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID do Líder (person_id)</label>
          <Input
            value={form.leaderPersonId}
            onChange={(e) => handleChange('leaderPersonId', e.target.value)}
            placeholder="UUID da pessoa líder (opcional)"
          />
          <p className="text-xs text-gray-400 mt-1">Cole o ID da pessoa cadastrada em Pessoas</p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Ministerios() {
  const { churchId } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MinistryWithLeader | null>(null)
  const deactivate = useDeactivateMinistry()

  const { data: ministries, isLoading, isError, refetch } = useMinisterios(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(m: MinistryWithLeader) {
    setEditing(m)
    setModalOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setModalOpen(true)
  }

  async function handleDeactivate(m: MinistryWithLeader) {
    if (!confirm(`Desativar "${m.name}"? O ministério será removido da listagem.`)) return
    await deactivate.mutateAsync({ id: m.id, churchId: churchId! })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ministérios</h1>
          <p className="text-sm text-gray-500 mt-1">
            {ministries ? `${ministries.length} ministério${ministries.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={handleNew}>+ Novo Ministério</Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar os ministérios." onRetry={() => void refetch()} />
      ) : (ministries ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum ministério cadastrado"
          description="Crie o primeiro ministério clicando em 'Novo Ministério'."
          action={<Button onClick={handleNew}>+ Novo Ministério</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(ministries ?? []).map((ministry) => (
            <MinistryCard
              key={ministry.id}
              ministry={ministry}
              onEdit={handleEdit}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <MinistryModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
        />
      )}
    </div>
  )
}
