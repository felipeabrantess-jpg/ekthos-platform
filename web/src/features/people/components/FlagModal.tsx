// ─────────────────────────────────────────────────────────────────────────────
// FlagModal — criar ou editar uma flag (tipo de pessoa)
//
// Campos: nome (texto) + cor (palette de 8 cores pré-definidas)
// Chama useCreateTag ou useUpdateTag conforme mode.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useCreateTag, useUpdateTag } from '../hooks/useTags'
import type { Tag } from '@/lib/types/joins'
import ModalPortal from '@/components/ui/ModalPortal'

// Paleta de 8 cores canônicas (design-system flags)
const COLOR_PALETTE: { hex: string; label: string }[] = [
  { hex: '#6B7280', label: 'Cinza'      },
  { hex: '#60A5FA', label: 'Azul'       },
  { hex: '#22C55E', label: 'Verde'      },
  { hex: '#86EFAC', label: 'Verde claro' },
  { hex: '#FACC15', label: 'Amarelo'    },
  { hex: '#A78BFA', label: 'Roxo'       },
  { hex: '#FB923C', label: 'Laranja'    },
  { hex: '#F87171', label: 'Vermelho'   },
]

interface FlagModalProps {
  churchId: string
  editTag?: Tag | null   // se fornecido → modo edição
  onClose: () => void
}

export function FlagModal({ churchId, editTag, onClose }: FlagModalProps) {
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()

  const [name, setName]   = useState(editTag?.name ?? '')
  const [color, setColor] = useState(editTag?.color ?? COLOR_PALETTE[0].hex)
  const [error, setError] = useState<string | null>(null)

  const isPending = createTag.isPending || updateTag.isPending

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Nome obrigatório.')
      return
    }

    try {
      if (editTag) {
        await updateTag.mutateAsync({ id: editTag.id, churchId, name, color })
      } else {
        await createTag.mutateAsync({ churchId, name, color })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {editTag ? 'Editar flag' : 'Nova flag'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:bg-bg-hover transition-colors"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e) }} className="px-5 py-4 space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Visitante, Membro, Batizado..."
              maxLength={40}
              autoFocus
              className="w-full border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            />
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary">Cor</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setColor(c.hex)}
                  className="h-7 w-7 rounded-full border-2 transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: color === c.hex ? '#000' : 'transparent',
                    boxShadow: color === c.hex ? `0 0 0 2px white, 0 0 0 4px ${c.hex}` : undefined,
                  }}
                />
              ))}
            </div>

            {/* Preview */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-text-tertiary">Prévia:</span>
              <span
                className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full border"
                style={{
                  fontSize: '11px',
                  backgroundColor: color + '1A',
                  color,
                  borderColor: color + '40',
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {name.trim() || 'Prévia'}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-border-default text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              {editTag ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}
