/**
 * TagBadge.tsx — Badge de flag de pessoa
 *
 * Renderiza um pill colorido usando a cor semântica configurada no banco.
 * Reutilizável em: PersonDetailPanel, card da lista, filtros.
 *
 * Props:
 *  - tag: Tag object com name + color
 *  - onRemove?: callback → mostra X removível
 *  - size: 'sm' (padrão) | 'xs'
 */

import type { Tag } from '@/features/tags/hooks/useTags'
import { X } from 'lucide-react'

interface TagBadgeProps {
  tag:      Tag
  onRemove?: () => void
  size?:    'xs' | 'sm'
}

/** Converte hex color para versão clara (10% opacidade) como bg */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function TagBadge({ tag, onRemove, size = 'sm' }: TagBadgeProps) {
  const bg   = hexToRgba(tag.color, 0.12)
  const border = hexToRgba(tag.color, 0.3)

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-all ${sizeClasses}`}
      style={{
        background:  bg,
        border:      `1px solid ${border}`,
        color:       tag.color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: tag.color }}
      />
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 rounded-full hover:bg-black/10 transition-colors"
          aria-label={`Remover flag ${tag.name}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  )
}
