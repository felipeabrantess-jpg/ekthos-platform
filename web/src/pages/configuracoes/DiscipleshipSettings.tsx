/**
 * DiscipleshipSettings.tsx — /configuracoes/discipulado
 *
 * Permite à igreja:
 *  1. Aplicar um dos 6 templates pré-definidos (substitui etapas existentes)
 *  2. Visualizar, reordenar, editar e excluir etapas individualmente
 *  3. Adicionar etapas customizadas
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GripVertical, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  order_index: number
  is_active: boolean
  sla_hours: number | null
  color: string
  icon: string
  is_entry_point: boolean
  is_terminal: boolean
  description: string | null
}

interface Template {
  slug: string
  name: string
  description: string | null
  stages: TemplateStage[]
}

interface TemplateStage {
  name: string
  order_index: number
  color: string
  icon: string
  sla_hours: number | null
  is_entry_point: boolean
  is_terminal: boolean
}

// ── Color options ──────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: '#94a3b8', label: 'Cinza'    },
  { value: '#f59e0b', label: 'Âmbar'   },
  { value: '#3b82f6', label: 'Azul'    },
  { value: '#10b981', label: 'Verde'   },
  { value: '#a78bfa', label: 'Violeta' },
  { value: 'var(--color-primary)', label: 'Brand'   },
  { value: '#fbbf24', label: 'Dourado' },
  { value: '#60a5fa', label: 'Celeste' },
  { value: '#f472b6', label: 'Rosa'    },
]

// ── TemplateCard ───────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: Template
  onApply: (slug: string) => void
  applying: boolean
}

function TemplateCard({ template, onApply, applying }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border border-cream-dark/60 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ekthos-black">{template.name}</p>
          {template.description && (
            <p className="text-xs text-ekthos-black/50 mt-0.5 leading-relaxed">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-ekthos-black/30 hover:text-ekthos-black/60 hover:bg-cream-dark/40 transition-all"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <Button
            variant="secondary"
            className="text-xs py-1 px-3"
            disabled={applying}
            onClick={() => onApply(template.slug)}
          >
            {applying ? <Loader2 size={12} className="animate-spin" /> : 'Aplicar'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-cream-dark/40 px-4 py-3 flex flex-wrap gap-2">
          {template.stages.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-ekthos-black/70">{s.name}</span>
              {i < template.stages.length - 1 && (
                <span className="text-ekthos-black/20 ml-0.5">→</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── StageRow ───────────────────────────────────────────────────────────────────

interface StageRowProps {
  stage: Stage
  index: number
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
  onEdit: (stage: Stage) => void
  onDelete: (id: string) => void
  deleting: boolean
}

function StageRow({ stage, onMoveUp, onMoveDown, isFirst, isLast, onEdit, onDelete, deleting }: StageRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white border border-cream-dark/60 rounded-xl hover:border-cream-dark transition-colors">
      {/* Drag handle (visual only) */}
      <GripVertical size={14} className="text-ekthos-black/20 shrink-0" />

      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ background: stage.color }}
      />

      {/* Name + badges */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium text-ekthos-black truncate">{stage.name}</p>
        {stage.is_entry_point && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            entrada
          </span>
        )}
        {stage.is_terminal && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
            final
          </span>
        )}
        {stage.sla_hours != null && (
          <span className="text-[10px] text-ekthos-black/40">SLA {stage.sla_hours}h</span>
        )}
      </div>

      {/* Reorder + actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded text-ekthos-black/25 hover:text-ekthos-black/60 hover:bg-cream-dark/40 disabled:opacity-20 disabled:pointer-events-none transition-all"
          title="Mover para cima"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded text-ekthos-black/25 hover:text-ekthos-black/60 hover:bg-cream-dark/40 disabled:opacity-20 disabled:pointer-events-none transition-all"
          title="Mover para baixo"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={() => onEdit(stage)}
          className="p-1.5 rounded-lg text-ekthos-black/30 hover:text-ekthos-black/70 hover:bg-cream-dark/40 transition-all ml-1"
          title="Editar"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => onDelete(stage.id)}
          disabled={deleting}
          className="p-1.5 rounded-lg text-ekthos-black/20 hover:text-red-500 hover:bg-red-50 transition-all"
          title="Remover etapa"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}

// ── StageForm (inline modal) ───────────────────────────────────────────────────

interface StageFormProps {
  initial?: Partial<Stage>
  onSave: (data: Omit<Stage, 'id' | 'church_id'>) => void
  onCancel: () => void
  saving: boolean
}

function StageForm({ initial, onSave, onCancel, saving }: StageFormProps) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [color, setColor]             = useState(initial?.color ?? '#94a3b8')
  const [slaHours, setSlaHours]       = useState(initial?.sla_hours?.toString() ?? '')
  const [isEntry, setIsEntry]         = useState(initial?.is_entry_point ?? false)
  const [isTerminal, setIsTerminal]   = useState(initial?.is_terminal ?? false)
  const [description, setDescription] = useState(initial?.description ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      color,
      icon: 'circle',
      order_index: initial?.order_index ?? 99,
      is_active: true,
      sla_hours: slaHours ? parseInt(slaHours, 10) : null,
      is_entry_point: isEntry,
      is_terminal: isTerminal,
      description: description.trim() || null,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-3"
    >
      {/* Name */}
      <div>
        <label className="text-xs font-medium text-ekthos-black/60 block mb-1">Nome da etapa *</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="ex: Frequentador"
          required
          className="w-full text-sm bg-white border border-cream-dark rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 text-ekthos-black placeholder:text-ekthos-black/30"
        />
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-medium text-ekthos-black/60 block mb-1.5">Cor</label>
        <div className="flex gap-2 flex-wrap">
          {COLOR_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => setColor(opt.value)}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${color === opt.value ? 'border-ekthos-black scale-110' : 'border-transparent hover:scale-110'}`}
              style={{ background: opt.value }}
            />
          ))}
        </div>
      </div>

      {/* SLA */}
      <div>
        <label className="text-xs font-medium text-ekthos-black/60 block mb-1">SLA (horas) — opcional</label>
        <input
          type="number"
          min="1"
          value={slaHours}
          onChange={e => setSlaHours(e.target.value)}
          placeholder="ex: 168 (1 semana)"
          className="w-full text-sm bg-white border border-cream-dark rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 text-ekthos-black placeholder:text-ekthos-black/30"
        />
      </div>

      {/* Flags */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isEntry}
            onChange={e => setIsEntry(e.target.checked)}
            className="rounded border-cream-dark accent-brand-600"
          />
          <span className="text-xs text-ekthos-black/70">Etapa de entrada</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTerminal}
            onChange={e => setIsTerminal(e.target.checked)}
            className="rounded border-cream-dark accent-brand-600"
          />
          <span className="text-xs text-ekthos-black/70">Etapa final</span>
        </label>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-ekthos-black/60 block mb-1">Descrição — opcional</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descreva o critério de entrada nesta etapa"
          className="w-full text-sm bg-white border border-cream-dark rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 text-ekthos-black placeholder:text-ekthos-black/30"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" className="text-xs py-1.5 px-4" disabled={saving || !name.trim()}>
          {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : <Check size={12} className="mr-1" />}
          Salvar
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-ekthos-black/50 hover:text-ekthos-black/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-cream-dark/40"
        >
          <X size={12} /> Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DiscipleshipSettings() {
  const { churchId } = useAuth()
  const queryClient = useQueryClient()

  const [editingStage, setEditingStage]   = useState<Stage | null>(null)
  const [showAddForm, setShowAddForm]     = useState(false)
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null)
  const [toast, setToast]                 = useState<{ ok: boolean; msg: string } | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  // ── Data loading ─────────────────────────────────────────────────────────────

  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['pipeline-stages-all', churchId],
    queryFn: async (): Promise<Stage[]> => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('church_id', churchId!)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
      if (error) throw error
      return (data ?? []) as Stage[]
    },
    enabled: Boolean(churchId),
  })

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['discipleship-templates'],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from('discipleship_templates')
        .select('slug, name, description, stages')
        .order('slug')
      if (error) throw error
      return (data ?? []) as unknown as Template[]
    },
  })

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function invalidateStages() {
    void queryClient.invalidateQueries({ queryKey: ['pipeline-stages-all', churchId] })
    void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
  }

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const applyTemplateMutation = useMutation({
    mutationFn: async (slug: string) => {
      const { error } = await supabase.rpc('apply_discipleship_template', {
        p_church_id: churchId!,
        p_template_slug: slug,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateStages()
      showToast(true, 'Template aplicado! Suas etapas foram atualizadas.')
      setConfirmTemplate(null)
    },
    onError: () => showToast(false, 'Erro ao aplicar template. Tente novamente.'),
  })

  const saveStageMutation = useMutation({
    mutationFn: async (payload: Partial<Stage> & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from('pipeline_stages')
          .update({
            name: payload.name,
            color: payload.color,
            icon: payload.icon,
            sla_hours: payload.sla_hours,
            is_entry_point: payload.is_entry_point,
            is_terminal: payload.is_terminal,
            description: payload.description,
          })
          .eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pipeline_stages')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ church_id: churchId, ...payload } as any)
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidateStages()
      showToast(true, 'Etapa salva.')
      setEditingStage(null)
      setShowAddForm(false)
    },
    onError: () => showToast(false, 'Erro ao salvar etapa.'),
  })

  const deleteStageMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pipeline_stages')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateStages()
      showToast(true, 'Etapa removida.')
      setDeletingId(null)
    },
    onError: () => {
      showToast(false, 'Erro ao remover etapa.')
      setDeletingId(null)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; order_index: number }[]) => {
      for (const u of updates) {
        await supabase
          .from('pipeline_stages')
          .update({ order_index: u.order_index })
          .eq('id', u.id)
      }
    },
    onSuccess: invalidateStages,
  })

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleMoveStage(index: number, direction: 'up' | 'down') {
    const newStages = [...stages]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]]

    void reorderMutation.mutateAsync(
      newStages.map((s, i) => ({ id: s.id, order_index: i + 1 }))
    )
  }

  function handleDeleteStage(id: string) {
    setDeletingId(id)
    void deleteStageMutation.mutateAsync(id)
  }

  function handleSaveEdit(data: Omit<Stage, 'id' | 'church_id'>) {
    if (!editingStage) return
    void saveStageMutation.mutateAsync({ ...data, id: editingStage.id })
  }

  function handleSaveNew(data: Omit<Stage, 'id' | 'church_id'>) {
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.order_index), 0)
    void saveStageMutation.mutateAsync({ ...data, order_index: maxOrder + 1 })
  }

  function handleApplyTemplate(slug: string) {
    if (stages.length > 0) {
      // Ask for confirmation if there are existing stages
      setConfirmTemplate(slug)
    } else {
      void applyTemplateMutation.mutateAsync(slug)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!churchId) return null

  const isLoading = stagesLoading || templatesLoading

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-ekthos-black">Caminho de discipulado</h2>
        <p className="text-xs text-ekthos-black/50 mt-0.5 leading-relaxed">
          Configure as etapas que definem a jornada espiritual de cada pessoa na sua igreja.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
          toast.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.ok
            ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
            : <AlertTriangle size={15} className="text-red-500 shrink-0" />
          }
          {toast.msg}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* ── Etapas atuais ──────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest">
                Etapas ({stages.length})
              </h3>
              {!showAddForm && !editingStage && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  Adicionar etapa
                </button>
              )}
            </div>

            <div className="space-y-2">
              {stages.length === 0 && !showAddForm && (
                <div className="flex flex-col items-center py-10 text-center">
                  <p className="text-sm text-ekthos-black/40">
                    Nenhuma etapa configurada ainda.
                  </p>
                  <p className="text-xs text-ekthos-black/30 mt-1">
                    Aplique um template abaixo ou adicione etapas manualmente.
                  </p>
                </div>
              )}

              {stages.map((stage, i) => (
                editingStage?.id === stage.id ? (
                  <StageForm
                    key={stage.id}
                    initial={editingStage}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingStage(null)}
                    saving={saveStageMutation.isPending}
                  />
                ) : (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    index={i}
                    isFirst={i === 0}
                    isLast={i === stages.length - 1}
                    onMoveUp={() => handleMoveStage(i, 'up')}
                    onMoveDown={() => handleMoveStage(i, 'down')}
                    onEdit={setEditingStage}
                    onDelete={handleDeleteStage}
                    deleting={deletingId === stage.id}
                  />
                )
              ))}

              {/* Add form inline */}
              {showAddForm && (
                <StageForm
                  onSave={handleSaveNew}
                  onCancel={() => setShowAddForm(false)}
                  saving={saveStageMutation.isPending}
                />
              )}
            </div>
          </section>

          {/* ── Templates ─────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">
              Templates pré-definidos
            </h3>
            <p className="text-xs text-ekthos-black/50 mb-4 leading-relaxed">
              Aplicar um template <strong>substitui</strong> todas as suas etapas atuais. Você pode
              personalizar depois.
            </p>

            <div className="space-y-2">
              {templates.map(t => (
                <TemplateCard
                  key={t.slug}
                  template={t}
                  onApply={handleApplyTemplate}
                  applying={applyTemplateMutation.isPending && confirmTemplate === t.slug}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Confirmation dialog ────────────────────────────────────────────── */}
      {confirmTemplate && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setConfirmTemplate(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-semibold text-ekthos-black">Substituir etapas atuais?</p>
                  <p className="text-xs text-ekthos-black/60 mt-1 leading-relaxed">
                    Suas {stages.length} etapas atuais serão desativadas e substituídas pelas etapas do template{' '}
                    <strong>{templates.find(t => t.slug === confirmTemplate)?.name}</strong>.
                    As pessoas no pipeline não são afetadas.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmTemplate(null)}
                  className="text-sm text-ekthos-black/50 hover:text-ekthos-black/80 px-4 py-2 rounded-xl hover:bg-cream-dark/40 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  variant="primary"
                  className="text-sm"
                  disabled={applyTemplateMutation.isPending}
                  onClick={() => void applyTemplateMutation.mutateAsync(confirmTemplate)}
                >
                  {applyTemplateMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin mr-1" />Aplicando...</>
                    : 'Sim, substituir'
                  }
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
