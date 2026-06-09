// ─────────────────────────────────────────────────────────────────────────────
// TagEditModal — modal multi-select para atribuir/remover flags de uma pessoa
//
// Abre a partir do TagBadgesCell.
// Mostra todas as flags da igreja com toggle ON/OFF.
// Ao salvar: useUpdatePersonTags (DELETE + INSERT atômico).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { X, Loader2, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUpdatePersonTags } from '../hooks/useUpdatePersonTags'
import type { PersonWithStage, Tag } from '@/lib/types/joins'
import { TagPill } from './TagBadgesCell'

interface TagEditModalProps {
  person: PersonWithStage
  allTags: Tag[]
  onClose: () => void
}

export function TagEditModal({ person, allTags, onClose }: TagEditModalProps) {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const mutation = useUpdatePersonTags()

  // IDs das tags atualmente atribuídas
  const currentTagIds = (person.person_tags ?? []).map((pt) => pt.tag_id)
  const [selected, setSelected] = useState<Set<string>>(new Set(currentTagIds))

  // Fecha com Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function toggle(tagId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  async function handleSave() {
    if (!churchId) return
    await mutation.mutateAsync({
      personId: person.id,
      churchId,
      tagIds: Array.from(selected),
    })
    onClose()
  }

  const hasChanges = (() => {
    const cur = new Set(currentTagIds)
    if (cur.size !== selected.size) return true
    for (const id of cur) if (!selected.has(id)) return true
    return false
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Tipos de pessoa</h2>
            <p className="text-xs text-text-secondary mt-0.5 truncate" style={{ maxWidth: '220px' }}>
              {person.name ?? 'Sem nome'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:bg-bg-hover transition-colors"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {allTags.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-text-secondary">
                Nenhuma flag criada ainda.
              </p>
              <button
                onClick={() => { onClose(); navigate('/pessoas/flags') }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
              >
                <Settings size={13} />
                Criar primeira flag
              </button>
            </div>
          ) : (
            <ul className="space-y-1">
              {allTags.map((tag) => {
                const active = selected.has(tag.id)
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => toggle(tag.id)}
                      className={[
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                        active ? 'bg-bg-hover' : 'hover:bg-bg-hover',
                      ].join(' ')}
                    >
                      {/* Checkbox visual */}
                      <span
                        className={[
                          'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                          active ? 'border-transparent' : 'border-border-default',
                        ].join(' ')}
                        style={active ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                      >
                        {active && (
                          <svg viewBox="0 0 10 8" width="10" height="8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {/* Badge preview */}
                      <TagPill tag={tag} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-default flex items-center justify-between gap-3">
          <button
            onClick={() => { onClose(); navigate('/pessoas/flags') }}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Settings size={11} />
            Gerenciar flags
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-border-default text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => { void handleSave() }}
              disabled={mutation.isPending || !hasChanges}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </div>

        {/* Error */}
        {mutation.isError && (
          <div className="px-5 pb-4">
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {mutation.error instanceof Error ? mutation.error.message : 'Erro ao salvar.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
