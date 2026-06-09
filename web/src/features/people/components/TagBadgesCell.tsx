// ─────────────────────────────────────────────────────────────────────────────
// TagBadgesCell — exibe flags configuráveis de uma pessoa na lista /pessoas
//
// Closed: badges coloridos (até 3) + "+N" indicator + lápis discreto
// Click  → abre TagEditModal (multi-select para atribuir/remover flags)
//
// Cores: inline style com hex (color + '20' background, color text)
// sem Tailwind arbitrário para manter compatibilidade com JIT.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Pencil, Tag as TagIcon } from 'lucide-react'
import type { PersonWithStage, Tag } from '@/lib/types/joins'
import { TagEditModal } from './TagEditModal'

interface TagBadgesCellProps {
  person: PersonWithStage
  allTags: Tag[]
}

export function TagBadgesCell({ person, allTags }: TagBadgesCellProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const personTags = (person.person_tags ?? [])
    .filter((pt) => pt.tags !== null)
    .map((pt) => pt.tags!)
    .sort((a, b) => a.sort_order - b.sort_order)

  const visible  = personTags.slice(0, 3)
  const overflow = personTags.length - visible.length

  return (
    <>
      <button
        type="button"
        aria-label="Editar tipos desta pessoa"
        onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
        className="group inline-flex items-center gap-1 min-h-[24px] hover:opacity-80 transition-opacity"
      >
        {personTags.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-text-tertiary group-hover:text-text-secondary transition-colors">
            <TagIcon size={11} strokeWidth={1.75} className="opacity-50" />
            <span>—</span>
            <Pencil size={9} strokeWidth={1.75} className="opacity-0 group-hover:opacity-40 transition-opacity" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 flex-wrap">
            {visible.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
            {overflow > 0 && (
              <span className="text-[10px] text-text-tertiary font-medium">+{overflow}</span>
            )}
            <Pencil
              size={9}
              strokeWidth={1.75}
              className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity ml-0.5"
            />
          </span>
        )}
      </button>

      {modalOpen && (
        <TagEditModal
          person={person}
          allTags={allTags}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ── Pill inline ───────────────────────────────────────────────────────────────

export function TagPill({ tag }: { tag: Pick<Tag, 'id' | 'name' | 'color'> }) {
  const hex = tag.color ?? '#6B7280'
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
      style={{
        backgroundColor: hex + '1A',
        color:            hex,
        borderColor:      hex + '40',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: hex }}
      />
      {tag.name}
    </span>
  )
}
