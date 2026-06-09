// ─────────────────────────────────────────────────────────────────────────────
// PeopleFlags — /pessoas/flags
// CRUD de flags configuráveis da igreja (Tipos de Pessoa)
//
// Acesso: pastor/admin (sem module guard — é feature de tronco)
// Navegação: link "← Pessoas" no header
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTags, useDeleteTag, useTagUsageCounts } from '@/features/people/hooks/useTags'
import { FlagModal } from '@/features/people/components/FlagModal'
import { TagPill } from '@/features/people/components/TagBadgesCell'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'
import type { Tag } from '@/lib/types/joins'

export default function PeopleFlags() {
  const { churchId }    = useAuth()
  const navigate         = useNavigate()
  const { data: tags, isLoading, isError, refetch } = useTags(churchId ?? '')
  const { data: counts = {} }  = useTagUsageCounts(churchId ?? '')
  const deleteTag              = useDeleteTag()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<Tag | null>(null)

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function openCreate() { setEditingTag(null); setModalOpen(true) }
  function openEdit(tag: Tag) { setEditingTag(tag); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditingTag(null) }

  function requestDelete(tag: Tag) {
    setDeleteError(null)
    setConfirmDeleteTag(tag)
  }

  async function confirmDelete() {
    if (!confirmDeleteTag) return
    setDeletingId(confirmDeleteTag.id)
    setDeleteError(null)
    try {
      await deleteTag.mutateAsync({ id: confirmDeleteTag.id, churchId: churchId! })
      setConfirmDeleteTag(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/pessoas')}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            Pessoas
          </button>
          <h1 className="font-display text-xl md:text-2xl font-bold text-text-primary">
            Tipos de Pessoa
          </h1>
          <p className="text-xs md:text-sm text-text-secondary mt-1">
            Flags configuráveis — defina as categorias espirituais da sua igreja.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus size={15} />
          Nova flag
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !tags || tags.length === 0 ? (
        <div className="bg-bg-primary border border-dashed border-border-default rounded-2xl p-12 text-center space-y-4">
          <p className="text-sm font-medium text-text-primary">Nenhuma flag criada</p>
          <p className="text-xs text-text-secondary max-w-xs mx-auto">
            Crie flags para classificar seus membros: Visitante, Membro, Batizado, Voluntário, Líder — você decide.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            Criar primeira flag
          </button>
        </div>
      ) : (
        <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm overflow-hidden">
          <ul className="divide-y divide-border-default">
            {tags.map((tag) => {
              const usageCount = counts[tag.id] ?? 0
              const isDeleting = deletingId === tag.id

              return (
                <li key={tag.id} className="flex items-center gap-4 px-5 py-4 hover:bg-bg-hover/50 transition-colors">
                  {/* Badge preview */}
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <TagPill tag={tag} />
                    <span className="text-xs text-text-tertiary">
                      {usageCount > 0 ? `${usageCount} pessoa${usageCount !== 1 ? 's' : ''}` : 'Sem atribuições'}
                    </span>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(tag)}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
                      title="Editar"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => requestDelete(tag)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-40"
                      title="Excluir"
                    >
                      {isDeleting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Erro de delete inline */}
      {deleteError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {deleteError}
        </p>
      )}

      {/* Modal criar/editar */}
      {modalOpen && (
        <FlagModal
          churchId={churchId}
          editTag={editingTag}
          onClose={closeModal}
        />
      )}

      {/* Modal confirmar exclusão */}
      {confirmDeleteTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteTag(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Excluir flag</h3>
            <p className="text-sm text-text-secondary">
              Deseja excluir <strong>{confirmDeleteTag.name}</strong>?
              {(counts[confirmDeleteTag.id] ?? 0) > 0 && (
                <span className="text-red-600">
                  {' '}Esta flag está atribuída a {counts[confirmDeleteTag.id]} pessoa(s) e não pode ser excluída.
                </span>
              )}
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setConfirmDeleteTag(null); setDeleteError(null) }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border-default text-text-primary hover:bg-bg-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void confirmDelete() }}
                disabled={!!deletingId || (counts[confirmDeleteTag.id] ?? 0) > 0}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deletingId && <Loader2 size={13} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
