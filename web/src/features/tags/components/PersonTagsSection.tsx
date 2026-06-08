/**
 * PersonTagsSection.tsx — Seção de flags no PersonDetailPanel
 *
 * Renderizado dentro do slide-over de detalhe da pessoa.
 * Permite ver e atribuir/remover flags sem sair do painel.
 *
 * Usado em: PersonDetailPanel (seção após Voluntariado)
 */

import { useState } from 'react'
import { Tag as TagIcon, Plus, X } from 'lucide-react'
import { usePersonTags, useTags, useAssignTag, useUnassignTag } from '@/features/tags/hooks/useTags'
import TagBadge from '@/features/tags/components/TagBadge'
import type { Tag } from '@/features/tags/hooks/useTags'

interface PersonTagsSectionProps {
  personId: string
  churchId: string
}

export default function PersonTagsSection({ personId, churchId: _churchId }: PersonTagsSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: personTags = [], isLoading: loadingPersonTags } = usePersonTags(personId)
  const { data: allTags   = [], isLoading: loadingAllTags    } = useTags()
  const assignTag   = useAssignTag()
  const unassignTag = useUnassignTag()

  // Tags ainda não atribuídas a esta pessoa
  const assignedIds = new Set(personTags.map(pt => pt.tag_id))
  const availableTags: Tag[] = allTags.filter(t => !assignedIds.has(t.id))

  const isLoading = loadingPersonTags || loadingAllTags

  async function handleAssign(tagId: string) {
    await assignTag.mutateAsync({ personId, tagId })
    setPickerOpen(false)
  }

  async function handleUnassign(tagId: string) {
    await unassignTag.mutateAsync({ personId, tagId })
  }

  return (
    <div className="bg-white rounded-2xl border border-cream-dark/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-cream-dark/40 bg-cream-dark/20 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ekthos-black flex items-center gap-1.5">
          <TagIcon size={13} className="text-ekthos-black/40" />
          Flags
        </h3>
        {allTags.length > 0 && (
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 transition-colors"
            aria-expanded={pickerOpen}
          >
            <Plus size={12} />
            Atribuir
          </button>
        )}
      </div>

      {/* Picker (dropdown de tags disponíveis) */}
      {pickerOpen && availableTags.length > 0 && (
        <div className="px-5 py-3 border-b border-cream-dark/30 bg-cream-dark/10">
          <p className="text-[10px] text-ekthos-black/40 mb-2 uppercase tracking-wide font-medium">
            Selecionar flag
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => { void handleAssign(tag.id) }}
                disabled={assignTag.isPending}
                className="transition-opacity disabled:opacity-50"
              >
                <TagBadge tag={tag} size="sm" />
              </button>
            ))}
          </div>
          <button
            onClick={() => setPickerOpen(false)}
            className="mt-2 flex items-center gap-1 text-[10px] text-ekthos-black/30 hover:text-ekthos-black/60"
          >
            <X size={10} /> Fechar
          </button>
        </div>
      )}

      {/* Lista de flags atribuídas */}
      <div className="px-5 py-3">
        {isLoading ? (
          <p className="text-xs text-ekthos-black/30 italic">Carregando...</p>
        ) : personTags.length === 0 ? (
          <p className="text-xs text-ekthos-black/30 italic">Nenhuma flag atribuída</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {personTags.map(pt => (
              <TagBadge
                key={pt.id}
                tag={pt.tag}
                onRemove={() => { void handleUnassign(pt.tag_id) }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
