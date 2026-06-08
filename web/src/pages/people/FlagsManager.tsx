/**
 * FlagsManager.tsx — Página CRUD de flags configuráveis por igreja
 *
 * Rota: /pessoas/flags
 * Acesso: role 'pessoas' (pastor/admin)
 *
 * Funcionalidades:
 *  - Listar flags da igreja ordenadas por sort_order
 *  - Criar nova flag (nome + cor + ícone opcional)
 *  - Editar flag existente
 *  - Excluir flag (com confirmação — cascata remove person_tags)
 */

import { useState } from 'react'
import { Tag as TagIcon, Plus, Pencil, Trash2, X, GripVertical } from 'lucide-react'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/features/tags/hooks/useTags'
import TagBadge from '@/features/tags/components/TagBadge'
import type { Tag } from '@/features/tags/hooks/useTags'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'

// ── Paleta semântica canônica (design-system PR 1/4) ─────────────────────────

const COLOR_PALETTE = [
  { hex: '#6B7280', label: 'Cinza — Neutro'          },
  { hex: '#86EFAC', label: 'Verde claro — Convertido' },
  { hex: '#22C55E', label: 'Verde — Membro'           },
  { hex: '#FACC15', label: 'Amarelo — Transição'      },
  { hex: '#60A5FA', label: 'Azul — Batizado'          },
  { hex: '#A78BFA', label: 'Roxo — Voluntário'        },
  { hex: '#FB923C', label: 'Laranja — Líder'          },
  { hex: '#F87171', label: 'Vermelho — Pastor'        },
  { hex: '#F9A8D4', label: 'Rosa — Outro'             },
]

// ── TagForm ───────────────────────────────────────────────────────────────────

interface TagFormProps {
  initial?: Partial<Tag>
  onSave:   (data: { name: string; color: string; icon: string | null; sort_order: number }) => Promise<void>
  onCancel: () => void
  maxOrder: number
}

function TagForm({ initial, onSave, onCancel, maxOrder }: TagFormProps) {
  const [name,  setName ] = useState(initial?.name  ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6B7280')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview: Tag = {
    id: 'preview', church_id: '', created_at: '',
    icon: null,
    name:       name  || 'Flag de exemplo',
    color,
    sort_order: initial?.sort_order ?? maxOrder + 1,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome obrigatório'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        name:       name.trim(),
        color,
        icon:       null,
        sort_order: initial?.sort_order ?? maxOrder + 1,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
      {/* Preview */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ekthos-black/40">Prévia:</span>
        <TagBadge tag={preview} />
      </div>

      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-ekthos-black mb-1.5">Nome *</label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Batizado, Liderança..."
          required
          maxLength={40}
        />
      </div>

      {/* Cor */}
      <div>
        <label className="block text-sm font-medium text-ekthos-black mb-1.5">Cor</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map(c => (
            <button
              key={c.hex}
              type="button"
              title={c.label}
              onClick={() => setColor(c.hex)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                color === c.hex
                  ? 'border-ekthos-black scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ background: c.hex }}
            />
          ))}
        </div>
        <p className="text-[10px] text-ekthos-black/30 mt-1">
          Ou insira hex: <input
            type="text"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="ml-1 w-20 border border-black/10 rounded px-1 py-0.5 text-[10px] font-mono"
            placeholder="#6B7280"
            maxLength={7}
          />
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={!name.trim() || saving} className="flex-1">
          {initial?.id ? 'Salvar' : 'Criar Flag'}
        </Button>
      </div>
    </form>
  )
}

// ── DeleteConfirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ tag, onConfirm, onCancel, loading }: {
  tag:      Tag
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ekthos-black">
        Excluir a flag <span className="font-semibold">{tag.name}</span>?
      </p>
      <p className="text-xs text-red-500">
        Esta ação remove a flag de todas as pessoas que a têm atribuída.
        Irreversível.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button
          onClick={onConfirm}
          loading={loading}
          className="flex-1 !bg-red-500 hover:!bg-red-600"
        >
          Excluir
        </Button>
      </div>
    </div>
  )
}

// ── TagRow ────────────────────────────────────────────────────────────────────

interface TagRowProps {
  tag:      Tag
  onEdit:   (tag: Tag) => void
  onDelete: (tag: Tag) => void
}

function TagRow({ tag, onEdit, onDelete }: TagRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-black/8 hover:border-black/15 transition-all group">
      <GripVertical className="w-3.5 h-3.5 text-ekthos-black/15 shrink-0 cursor-grab" />
      <div className="flex-1">
        <TagBadge tag={tag} />
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(tag)}
          className="p-1.5 rounded-lg hover:bg-cream transition-colors text-ekthos-black/40 hover:text-ekthos-black/70"
          title="Editar flag"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(tag)}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-ekthos-black/30 hover:text-red-500"
          title="Excluir flag"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── InlinePanel ───────────────────────────────────────────────────────────────

type Mode = 'idle' | 'create' | 'edit' | 'delete'

interface InlinePanelProps {
  mode:     Mode
  target:   Tag | null
  maxOrder: number
  create:   ReturnType<typeof useCreateTag>
  update:   ReturnType<typeof useUpdateTag>
  remove:   ReturnType<typeof useDeleteTag>
  onClose:  () => void
}

function InlinePanel({ mode, target, maxOrder, create, update, remove, onClose }: InlinePanelProps) {
  if (mode === 'idle') return null

  return (
    <div className="bg-cream-dark/20 rounded-2xl border border-black/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm font-semibold text-ekthos-black">
          {mode === 'create' ? 'Nova Flag' : mode === 'edit' ? 'Editar Flag' : 'Confirmar Exclusão'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-cream transition-colors text-ekthos-black/40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {(mode === 'create' || mode === 'edit') && (
        <TagForm
          initial={mode === 'edit' ? target ?? undefined : undefined}
          maxOrder={maxOrder}
          onCancel={onClose}
          onSave={async (data) => {
            if (mode === 'create') {
              await create.mutateAsync(data)
            } else if (mode === 'edit' && target) {
              await update.mutateAsync({ id: target.id, ...data })
            }
            onClose()
          }}
        />
      )}

      {mode === 'delete' && target && (
        <DeleteConfirm
          tag={target}
          loading={remove.isPending}
          onCancel={onClose}
          onConfirm={() => {
            remove.mutate(target.id, { onSuccess: onClose })
          }}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FlagsManager() {
  const { churchId } = useAuth()
  const { data: tags = [], isLoading } = useTags()
  const create = useCreateTag()
  const update = useUpdateTag()
  const remove = useDeleteTag()

  const [mode,   setMode  ] = useState<Mode>('idle')
  const [target, setTarget] = useState<Tag | null>(null)

  if (!churchId) return null

  function openCreate() { setTarget(null); setMode('create') }
  function openEdit(tag: Tag) { setTarget(tag); setMode('edit') }
  function openDelete(tag: Tag) { setTarget(tag); setMode('delete') }
  function close() { setMode('idle'); setTarget(null) }

  const maxOrder = tags.length > 0 ? Math.max(...tags.map(t => t.sort_order)) : -1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
            <TagIcon className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ekthos-black">Flags de Pessoas</h1>
            <p className="text-sm text-gray-500">Marcadores configuráveis para classificar membros</p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={mode !== 'idle'}>
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Nova Flag</span>
        </Button>
      </div>

      {/* Inline panel (create / edit / delete) */}
      <InlinePanel
        mode={mode}
        target={target}
        maxOrder={maxOrder}
        create={create}
        update={update}
        remove={remove}
        onClose={close}
      />

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <TagIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhuma flag cadastrada ainda.</p>
          <p className="text-xs mt-1 opacity-70">
            Crie flags para classificar visitantes, membros e líderes.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 text-xs text-brand-600 font-semibold hover:underline"
          >
            + Criar primeira flag
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ekthos-black/40 px-1">
            {tags.length} flag{tags.length !== 1 ? 's' : ''} configurada{tags.length !== 1 ? 's' : ''}
          </p>
          {tags.map(tag => (
            <TagRow
              key={tag.id}
              tag={tag}
              onEdit={openEdit}
              onDelete={openDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
