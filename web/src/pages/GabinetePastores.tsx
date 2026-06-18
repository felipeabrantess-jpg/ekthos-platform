/**
 * GabinetePastores — /gabinete/pastores  (CRM interno)
 * Gestão de pastores do gabinete: criar, ativar/desativar, gerenciar slots.
 * Cria pessoa em people + insere em pastoral_cabinet num único formulário
 * (resolve: Vanessa não precisava ir em /pessoas antes).
 */

import { useState }                              from 'react'
import { Link }                                  from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Trash2, Clock, UserCheck,
} from 'lucide-react'
import { useAuth }    from '@/hooks/useAuth'
import { supabase }   from '@/lib/supabase'
import Spinner        from '@/components/ui/Spinner'
import Modal          from '@/components/ui/Modal'
import Button         from '@/components/ui/Button'
import Input          from '@/components/ui/Input'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Pastor {
  id:          string
  role:        string
  is_active:   boolean
  order_index: number
  bio:         string | null
  photo_url:   string | null
  person_id:   string
  people:      { id: string; name: string | null } | null
}

interface Slot {
  id:               string
  slot_datetime:    string
  duration_minutes: number
  appointment_id:   string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatSlot(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Modal: Novo Pastor ────────────────────────────────────────────────────────

interface NewPastorModalProps {
  open:     boolean
  onClose:  () => void
  churchId: string
}

function NewPastorModal({ open, onClose, churchId }: NewPastorModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name:      '',
    role:      '',
    bio:       '',
    photo_url: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      // 1. Cria pessoa em people
      const { data: person, error: personErr } = await (supabase as any)
        .from('people')
        .insert({
          church_id: churchId,
          name:      form.name.trim(),
          source:    'manual',
        })
        .select('id')
        .single()

      if (personErr || !person) throw new Error(personErr?.message ?? 'Erro ao criar pessoa')

      // 2. Insere no gabinete
      const { error: cabErr } = await (supabase as any)
        .from('pastoral_cabinet')
        .insert({
          church_id:   churchId,
          person_id:   person.id,
          role:        form.role.trim(),
          bio:         form.bio.trim() || null,
          photo_url:   form.photo_url.trim() || null,
          is_active:   true,
          order_index: 0,
        })

      if (cabErr) throw new Error(cabErr?.message ?? 'Erro ao adicionar ao gabinete')

      await qc.invalidateQueries({ queryKey: ['gabinete_pastores', churchId] })
      setForm({ name: '', role: '', bio: '', photo_url: '' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo Pastor">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nome completo do pastor"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cargo / Função *</label>
          <Input
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            placeholder="Ex: Pastor, Pastora, Diácono..."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Biografia</label>
          <Input
            value={form.bio}
            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
            placeholder="Breve apresentação (opcional)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL da Foto</label>
          <Input
            value={form.photo_url}
            onChange={e => setForm(p => ({ ...p, photo_url: e.target.value }))}
            placeholder="https://... (opcional)"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            disabled={submitting || !form.name.trim() || !form.role.trim()}
            loading={submitting}
          >
            {submitting ? 'Criando...' : 'Criar Pastor'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Seção de slots de um pastor ───────────────────────────────────────────────

interface SlotsSectionProps {
  pastor:   Pastor
  churchId: string
}

function SlotsSection({ pastor, churchId }: SlotsSectionProps) {
  const qc = useQueryClient()
  const [addForm, setAddForm] = useState({ slot_datetime: '', duration_minutes: '60' })
  const [adding, setAdding]   = useState(false)
  const [addErr, setAddErr]   = useState<string | null>(null)

  const { data: slots = [], isLoading } = useQuery<Slot[]>({
    queryKey: ['cabinet_slots', pastor.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('cabinet_slots')
        .select('id, slot_datetime, duration_minutes, appointment_id')
        .eq('cabinet_pastor_id', pastor.id)
        .eq('church_id', churchId)
        .gt('slot_datetime', new Date().toISOString())
        .order('slot_datetime')

      if (error) throw error
      return (data ?? []) as Slot[]
    },
  })

  const deleteSlot = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await (supabase as any)
        .from('cabinet_slots')
        .delete()
        .eq('id', slotId)
        .is('appointment_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cabinet_slots', pastor.id] })
    },
  })

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.slot_datetime) return
    setAdding(true)
    setAddErr(null)
    try {
      const { error } = await (supabase as any)
        .from('cabinet_slots')
        .insert({
          church_id:         churchId,
          cabinet_pastor_id: pastor.id,
          slot_datetime:     new Date(addForm.slot_datetime).toISOString(),
          duration_minutes:  parseInt(addForm.duration_minutes) || 60,
        })
      if (error) throw error
      setAddForm({ slot_datetime: '', duration_minutes: '60' })
      await qc.invalidateQueries({ queryKey: ['cabinet_slots', pastor.id] })
    } catch (err) {
      setAddErr(err instanceof Error ? err.message : 'Erro ao adicionar horário')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mt-3 border-t border-black/[0.04] pt-3 space-y-3">
      <p className="text-[0.75rem] font-semibold text-gray-400 uppercase tracking-wide">
        Horários disponíveis (futuras)
      </p>

      {/* Formulário para adicionar slot */}
      <form onSubmit={(e) => { void handleAddSlot(e) }} className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] text-gray-500 font-medium">Data e Hora</label>
          <input
            type="datetime-local"
            value={addForm.slot_datetime}
            onChange={e => setAddForm(p => ({ ...p, slot_datetime: e.target.value }))}
            required
            className="rounded-lg border border-black/[0.08] px-3 py-2 text-[0.82rem] text-gray-900 focus:outline-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] text-gray-500 font-medium">Duração (min)</label>
          <input
            type="number"
            min="15"
            max="240"
            step="15"
            value={addForm.duration_minutes}
            onChange={e => setAddForm(p => ({ ...p, duration_minutes: e.target.value }))}
            className="w-24 rounded-lg border border-black/[0.08] px-3 py-2 text-[0.82rem] text-gray-900 focus:outline-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[0.8rem] font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {adding
            ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <Plus size={13} strokeWidth={2.5} />}
          Adicionar
        </button>
      </form>

      {addErr && <p className="text-[0.78rem] text-red-500">{addErr}</p>}

      {/* Lista de slots */}
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : slots.length === 0 ? (
        <p className="text-[0.8rem] text-gray-400">Nenhum horário futuro cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slots.map(slot => (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-black/[0.04]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Clock size={13} strokeWidth={1.75} className="text-gray-400 shrink-0" />
                <span className="text-[0.8rem] text-gray-700 truncate">{formatSlot(slot.slot_datetime)}</span>
                <span className="text-[0.72rem] text-gray-400">· {slot.duration_minutes} min</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {slot.appointment_id ? (
                  <span className="text-[0.7rem] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    Reservado
                  </span>
                ) : (
                  <>
                    <span className="text-[0.7rem] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Disponível
                    </span>
                    <button
                      onClick={() => deleteSlot.mutate(slot.id)}
                      disabled={deleteSlot.isPending}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remover horário"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Card de pastor ────────────────────────────────────────────────────────────

interface PastorCardProps {
  pastor:   Pastor
  churchId: string
}

function PastorCard({ pastor, churchId }: PastorCardProps) {
  const qc            = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const name          = pastor.people?.name ?? '—'

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('pastoral_cabinet')
        .update({ is_active: !pastor.is_active })
        .eq('id', pastor.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gabinete_pastores', churchId] })
    },
  })

  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {pastor.photo_url ? (
          <img
            src={pastor.photo_url}
            alt={name}
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-black/[0.06]"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
            {getInitials(name)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-[0.9rem] truncate">{name}</p>
              <p className="text-[0.76rem] text-gray-400">{pastor.role}</p>
            </div>
            {/* Toggle ativo/inativo */}
            <button
              onClick={() => toggleActive.mutate()}
              disabled={toggleActive.isPending}
              className="flex items-center gap-1.5 text-[0.75rem] font-semibold shrink-0 transition-colors"
              style={{ color: pastor.is_active ? '#059669' : '#9CA3AF' }}
              title={pastor.is_active ? 'Desativar do PWA' : 'Ativar no PWA'}
            >
              {pastor.is_active
                ? <ToggleRight size={20} strokeWidth={1.75} />
                : <ToggleLeft  size={20} strokeWidth={1.75} />}
              {pastor.is_active ? 'Ativo' : 'Inativo'}
            </button>
          </div>

          {pastor.bio && (
            <p className="text-[0.76rem] text-gray-500 mt-1 line-clamp-2">{pastor.bio}</p>
          )}
        </div>
      </div>

      {/* Botão expandir horários */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="mt-3 flex items-center gap-1.5 text-[0.78rem] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
      >
        {expanded
          ? <ChevronDown size={14} strokeWidth={2} />
          : <ChevronRight size={14} strokeWidth={2} />}
        Gerenciar horários
      </button>

      {expanded && <SlotsSection pastor={pastor} churchId={churchId} />}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function GabinetePastores() {
  const { churchId }            = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  const { data: pastors = [], isLoading, error } = useQuery<Pastor[]>({
    queryKey: ['gabinete_pastores', churchId],
    enabled:  !!churchId,
    queryFn: async () => {
      const { data, error: qErr } = await (supabase as any)
        .from('pastoral_cabinet')
        .select('id, role, is_active, order_index, bio, photo_url, person_id, people(id, name)')
        .eq('church_id', churchId)
        .order('order_index')

      if (qErr) throw qErr
      return (data ?? []) as Pastor[]
    },
  })

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <UserCheck size={18} strokeWidth={1.75} className="text-amber-700" />
          </div>
          <div>
            <h1 className="text-[1.05rem] font-bold text-gray-900">Pastores do Gabinete</h1>
            <p className="text-[0.76rem] text-gray-400 mt-0.5">
              Gerencie pastores e horários disponíveis
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[0.82rem] font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors shrink-0"
        >
          <Plus size={15} strokeWidth={2.5} />
          Novo Pastor
        </button>
      </div>

      {/* Link pedidos */}
      <div className="mb-5">
        <Link
          to="/gabinete/pedidos"
          className="inline-flex items-center gap-1.5 text-[0.8rem] text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Building2 size={13} strokeWidth={1.75} />
          Ver pedidos de agendamento
        </Link>
      </div>

      {/* Legenda status */}
      <div className="flex items-center gap-4 mb-4 text-[0.74rem] text-gray-400">
        <span className="flex items-center gap-1">
          <ToggleRight size={14} className="text-emerald-500" /> Ativo = aparece no app da IGV
        </span>
        <span className="flex items-center gap-1">
          <ToggleLeft size={14} className="text-gray-400" /> Inativo = oculto no app
        </span>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="md" /></div>
      ) : error ? (
        <div className="text-center py-12 text-red-500 text-[0.85rem]">
          Erro ao carregar pastores. Recarregue a página.
        </div>
      ) : pastors.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
            <UserCheck size={22} strokeWidth={1.5} className="text-amber-400" />
          </div>
          <p className="text-gray-400 text-[0.85rem]">
            Nenhum pastor cadastrado ainda.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="text-[0.82rem] font-semibold text-amber-700 hover:underline"
          >
            + Adicionar o primeiro pastor
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pastors.map(pastor => (
            <PastorCard key={pastor.id} pastor={pastor} churchId={churchId!} />
          ))}
        </div>
      )}

      {/* Modal novo pastor */}
      {churchId && (
        <NewPastorModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          churchId={churchId}
        />
      )}
    </div>
  )
}
