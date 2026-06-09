// ─────────────────────────────────────────────────────────────────────────────
// PipelineStagesModal — CRUD de etapas do discipulado
//
// Abre pelo botão "Editar etapas" em /discipulado (Pipeline.tsx).
// Permite: criar etapa (nome + cor), editar nome/cor, excluir (só se vazia).
//
// Anti-purge: todas as cores via style={{ }} inline.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { X, Plus, Pencil, Trash2, GripVertical, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePipelineStages } from '@/features/pipeline/hooks/usePipeline'
import {
  useCreatePipelineStage,
  useUpdatePipelineStage,
  useDeletePipelineStage,
} from '@/features/pipeline/hooks/usePipelineStagesCrud'
import type { PipelineStage } from '@/lib/types/joins'

// ── Paleta canônica de cores para etapas ──────────────────────────────────────

const STAGE_COLORS: { hex: string; label: string }[] = [
  { hex: '#e13500', label: 'Vermelho' },
  { hex: '#f97316', label: 'Laranja' },
  { hex: '#eab308', label: 'Amarelo' },
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#0ea5e9', label: 'Azul' },
  { hex: '#8b5cf6', label: 'Roxo' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#6b7280', label: 'Cinza' },
]

// ── ColorPicker ────────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {STAGE_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className="h-5 w-5 rounded-full transition-transform hover:scale-110 shrink-0"
          style={{
            backgroundColor: c.hex,
            border:     value === c.hex ? `2px solid #000` : '2px solid transparent',
            boxShadow:  value === c.hex ? `0 0 0 1px white, 0 0 0 3px ${c.hex}` : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface PipelineStagesModalProps {
  onClose: () => void
}

export function PipelineStagesModal({ onClose }: PipelineStagesModalProps) {
  const { churchId } = useAuth()
  const { data: stages = [], isLoading } = usePipelineStages(churchId ?? '')
  const createStage = useCreatePipelineStage()
  const updateStage = useUpdatePipelineStage()
  const deleteStage = useDeletePipelineStage()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editColor, setEditColor] = useState(STAGE_COLORS[0].hex)

  const [addingNew, setAddingNew] = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newColor,  setNewColor]  = useState(STAGE_COLORS[0].hex)

  const [error, setError] = useState<string | null>(null)

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  type StageWithColor = PipelineStage & { color?: string | null }

  function startEdit(stage: StageWithColor) {
    setEditingId(stage.id)
    setEditName(stage.name)
    setEditColor(stage.color ?? STAGE_COLORS[0].hex)
    setError(null)
  }

  async function handleSaveEdit() {
    if (!editingId || !churchId) return
    setError(null)
    try {
      await updateStage.mutateAsync({ id: editingId, churchId, name: editName.trim(), color: editColor })
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  async function handleDelete(stage: PipelineStage) {
    if (!churchId) return
    setError(null)
    try {
      await deleteStage.mutateAsync({ id: stage.id, churchId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  async function handleCreate() {
    if (!churchId || !newName.trim()) return
    setError(null)
    try {
      await createStage.mutateAsync({
        churchId,
        name:       newName.trim(),
        color:      newColor,
        orderIndex: stages.length,
      })
      setAddingNew(false)
      setNewName('')
      setNewColor(STAGE_COLORS[0].hex)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Etapas do discipulado</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : (
            <ul className="space-y-1">
              {(stages as StageWithColor[]).map((stage) => {
                const hex      = stage.color ?? '#6b7280'
                const isEditing = editingId === stage.id

                return (
                  <li key={stage.id}>
                    {isEditing ? (
                      /* ── Modo edição inline ───────────────────────────── */
                      <div className="space-y-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  { void handleSaveEdit() }
                            if (e.key === 'Escape') { setEditingId(null) }
                          }}
                        />
                        <ColorPicker value={editColor} onChange={setEditColor} />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleSaveEdit() }}
                            disabled={updateStage.isPending || !editName.trim()}
                            className="flex-1 px-2 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {updateStage.isPending && <Loader2 size={10} className="animate-spin" />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Modo visualização ─────────────────────────────── */
                      <div className="flex items-center gap-2 py-1">
                        <GripVertical size={14} className="text-gray-300 shrink-0" />
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-1 min-w-0"
                          style={{
                            backgroundColor: hex + '20',
                            color:           hex,
                            border:          `1px solid ${hex}40`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: hex }}
                          />
                          <span className="truncate">{stage.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(stage)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
                          aria-label={`Editar etapa ${stage.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleDelete(stage) }}
                          disabled={deleteStage.isPending}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                          aria-label={`Excluir etapa ${stage.name}`}
                        >
                          {deleteStage.isPending
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* ── Adicionar nova etapa ─────────────────────────────────────── */}
          {addingNew ? (
            <div className="mt-3 space-y-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da etapa..."
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { void handleCreate() }
                  if (e.key === 'Escape') { setAddingNew(false) }
                }}
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAddingNew(false); setNewName('') }}
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { void handleCreate() }}
                  disabled={createStage.isPending || !newName.trim()}
                  className="flex-1 px-2 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {createStage.isPending && <Loader2 size={10} className="animate-spin" />}
                  Criar etapa
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAddingNew(true); setError(null) }}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors"
              style={{ color: '#2563eb' }}
            >
              <Plus size={13} />
              Nova etapa
            </button>
          )}

          {/* Erro global */}
          {error && (
            <p className="mt-3 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
