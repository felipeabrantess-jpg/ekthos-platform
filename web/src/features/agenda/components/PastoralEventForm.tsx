import { useState, useEffect } from 'react'
import { X, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ModalPortal from '@/components/ui/ModalPortal'
import PersonSelect from '@/components/ui/PersonSelect'
import type { ChurchEventFull } from '@/features/agenda/hooks/useEvents'
import {
  useCreatePastoralEvent,
  useUpdatePastoralEvent,
  useCancelPastoralEvent,
  type CreatePastoralEventInput,
  type UpdatePastoralEventInput,
} from '@/features/agenda/hooks/usePastoralEventMutations'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'visita',      label: 'Visita',      color: '#2B6CB0' },
  { value: 'conselheria', label: 'Conselheria', color: '#6B46C1' },
  { value: 'reuniao',     label: 'Reunião',     color: '#C4841D' },
  { value: 'viagem',      label: 'Viagem',      color: '#2D7A4F' },
  { value: 'outro',       label: 'Outro',       color: '#670000' },
]

// ── Date/time helpers ─────────────────────────────────────────────────────────

function toLocalDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function toLocalTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

function todayDate(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── F1-D: Conflict detection types & helpers ──────────────────────────────────

interface ConflictEvent {
  id: string
  title: string
  start_datetime: string
  end_datetime: string | null
  all_day: boolean
}

interface ConflictInfo {
  title: string
  timeLabel: string
}

type PendingPayload =
  | { mode: 'create'; data: CreatePastoralEventInput }
  | { mode: 'update'; data: UpdatePastoralEventInput }

function effectiveRange(ev: ConflictEvent): { start: Date; end: Date } {
  if (ev.all_day) {
    const d = toLocalDate(ev.start_datetime)
    return {
      start: new Date(`${d}T00:00:00`),
      end:   new Date(`${d}T23:59:59`),
    }
  }
  const start = new Date(ev.start_datetime)
  const end   = ev.end_datetime
    ? new Date(ev.end_datetime)
    : new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

function conflictTimeLabel(ev: ConflictEvent): string {
  if (ev.all_day) return 'o dia todo'
  const s = new Date(ev.start_datetime)
  const p = (n: number) => String(n).padStart(2, '0')
  const startStr = `${p(s.getHours())}:${p(s.getMinutes())}`
  if (ev.end_datetime) {
    const e = new Date(ev.end_datetime)
    return `${startStr}–${p(e.getHours())}:${p(e.getMinutes())}`
  }
  return startStr
}

async function fetchConflicts(
  churchId: string,
  assignedPastorId: string | null,
  myEffStart: Date,
  myEffEnd: Date,
  excludeId?: string,
): Promise<ConflictInfo[]> {
  if (!assignedPastorId) return []

  const windowStart = new Date(myEffStart.getTime() - 24 * 3600 * 1000).toISOString()
  const windowEnd   = new Date(myEffEnd.getTime()   + 24 * 3600 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('church_events') as any)
    .select('id, title, start_datetime, end_datetime, all_day')
    .eq('church_id', churchId)
    .eq('is_pastoral', true)
    .eq('active', true)
    .eq('assigned_pastor_id', assignedPastorId)
    .gte('start_datetime', windowStart)
    .lte('start_datetime', windowEnd)

  if (error || !data) return []

  const myRange = { start: myEffStart, end: myEffEnd }

  return (data as ConflictEvent[])
    .filter(ev => ev.id !== excludeId)
    .filter(ev => {
      const r = effectiveRange(ev)
      return myRange.start < r.end && myRange.end > r.start
    })
    .map(ev => ({ title: ev.title, timeLabel: conflictTimeLabel(ev) }))
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string
  date: string
  startTime: string
  endTime: string
  allDay: boolean
  category: string
  location: string
  personIds: string[]
  notes: string
}

function buildInitial(ev?: ChurchEventFull | null): FormState {
  if (ev) {
    return {
      title:     ev.title,
      date:      toLocalDate(ev.start_datetime),
      startTime: ev.all_day ? '09:00' : toLocalTime(ev.start_datetime),
      endTime:   ev.end_datetime && !ev.all_day ? toLocalTime(ev.end_datetime) : '',
      allDay:    ev.all_day,
      category:  ev.pastoral_category ?? '',
      location:  ev.location ?? '',
      personIds: ev.person_ids ?? [],
      notes:     ev.pastoral_notes ?? '',
    }
  }
  return {
    title: '', date: todayDate(), startTime: '09:00', endTime: '',
    allDay: false, category: '', location: '', personIds: [], notes: '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  editEvent?: ChurchEventFull | null
  churchId: string
}

const inputStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
}

const labelStyle = { color: 'var(--text-secondary)' } as const

export default function PastoralEventForm({ open, onClose, editEvent, churchId }: Props) {
  const { user } = useAuth()

  // Form state
  const [form, setForm] = useState<FormState>(() => buildInitial(editEvent))
  const [error, setError] = useState<string | null>(null)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // F1-D: conflict state
  const [conflictWarning, setConflictWarning] = useState<ConflictInfo | null>(null)
  const [pendingPayload,  setPendingPayload]  = useState<PendingPayload | null>(null)

  const createMut = useCreatePastoralEvent()
  const updateMut = useUpdatePastoralEvent()
  const cancelMut = useCancelPastoralEvent()

  useEffect(() => {
    if (open) {
      setForm(buildInitial(editEvent))
      setError(null)
      setShowCancelSection(false)
      setCancelReason('')
      setConflictWarning(null)
      setPendingPayload(null)
    }
  }, [open, editEvent])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updatePersonId(i: number, id: string | null) {
    setForm(prev => {
      const arr = [...prev.personIds]
      arr[i] = id ?? ''
      return { ...prev, personIds: arr }
    })
  }

  function removePersonId(i: number) {
    setForm(prev => ({ ...prev, personIds: prev.personIds.filter((_, idx) => idx !== i) }))
  }

  function addPersonId() {
    setForm(prev => ({ ...prev, personIds: [...prev.personIds, ''] }))
  }

  // ── F1-D: save helpers ──────────────────────────────────────────────────────

  async function doSave(payload: PendingPayload) {
    if (payload.mode === 'create') {
      await createMut.mutateAsync(payload.data)
    } else {
      await updateMut.mutateAsync(payload.data)
    }
  }

  async function handleConfirmSave() {
    if (!pendingPayload) return
    setError(null)
    try {
      await doSave(pendingPayload)
      onClose()
    } catch (err) {
      setConflictWarning(null)
      setPendingPayload(null)
      setError(err instanceof Error ? err.message : 'Erro ao salvar compromisso.')
    }
  }

  // ── Submit (with conflict check) ────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) return setError('Título é obrigatório.')
    if (!form.date)         return setError('Data é obrigatória.')
    if (!form.allDay && !form.startTime) return setError('Horário de início é obrigatório.')

    const startISO = form.allDay ? toISO(form.date, '00:00') : toISO(form.date, form.startTime)
    const endISO   = !form.allDay && form.endTime ? toISO(form.date, form.endTime) : null
    const cleanIds = form.personIds.filter(id => id.trim() !== '')

    // Effective range for overlap check (not persisted — only used for comparison)
    let myEffStart: Date
    let myEffEnd: Date
    if (form.allDay) {
      myEffStart = new Date(`${form.date}T00:00:00`)
      myEffEnd   = new Date(`${form.date}T23:59:59`)
    } else {
      myEffStart = new Date(startISO)
      myEffEnd   = endISO
        ? new Date(endISO)
        : new Date(myEffStart.getTime() + 60 * 60 * 1000)
    }

    const assignedPastorId = editEvent
      ? (editEvent.assigned_pastor_id ?? user?.id ?? null)
      : (user?.id ?? null)

    const payload: PendingPayload = editEvent
      ? {
          mode: 'update',
          data: {
            id:                editEvent.id,
            church_id:         churchId,
            title:             form.title.trim(),
            start_datetime:    startISO,
            end_datetime:      endISO,
            all_day:           form.allDay,
            location:          form.location.trim() || null,
            pastoral_category: form.category || null,
            person_ids:        cleanIds,
            pastoral_notes:    form.notes.trim() || null,
          },
        }
      : {
          mode: 'create',
          data: {
            church_id:          churchId,
            assigned_pastor_id: user?.id ?? null,
            title:              form.title.trim(),
            start_datetime:     startISO,
            end_datetime:       endISO,
            all_day:            form.allDay,
            location:           form.location.trim() || null,
            pastoral_category:  form.category || null,
            person_ids:         cleanIds,
            pastoral_notes:     form.notes.trim() || null,
          },
        }

    try {
      const conflicts = await fetchConflicts(
        churchId,
        assignedPastorId,
        myEffStart,
        myEffEnd,
        editEvent?.id,
      )

      if (conflicts.length > 0) {
        setConflictWarning(conflicts[0])
        setPendingPayload(payload)
        return
      }

      await doSave(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar compromisso.')
    }
  }

  // ── Cancel pastoral event ───────────────────────────────────────────────────

  async function handleCancel() {
    if (!editEvent) return
    setError(null)
    try {
      await cancelMut.mutateAsync({
        id:               editEvent.id,
        church_id:        churchId,
        cancelled_reason: cancelReason.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar compromisso.')
    }
  }

  const isPending    = createMut.isPending || updateMut.isPending
  const isCancelling = cancelMut.isPending

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />

        {/* Modal container */}
        <form
          onSubmit={handleSubmit}
          className="relative w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col"
          style={{ background: 'var(--bg-surface)' }}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-default)' }}
          >
            <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {editEvent ? 'Editar compromisso' : 'Novo compromisso pastoral'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Título */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Título *
              </label>
              <Input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="Ex: Visita ao irmão João"
                disabled={isPending}
              />
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Data *
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                disabled={isPending}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>

            {/* Dia inteiro */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={e => set('allDay', e.target.checked)}
                disabled={isPending}
                className="rounded"
              />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Dia inteiro</span>
            </label>

            {/* Horários */}
            {!form.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                    Início *
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => set('startTime', e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                    Término
                  </label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => set('endTime', e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Categoria
              </label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                disabled={isPending}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Sem categoria</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Local */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Local
              </label>
              <Input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Ex: Casa da família, Sede"
                disabled={isPending}
              />
            </div>

            {/* Pessoas vinculadas */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={labelStyle}>
                Pessoas vinculadas
              </label>
              <div className="space-y-2">
                {form.personIds.map((id, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <PersonSelect
                        value={id || null}
                        onChange={(newId) => updatePersonId(i, newId)}
                        placeholder="Buscar membro..."
                        disabled={isPending}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePersonId(i)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:opacity-70"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPersonId}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
                  style={{ color: '#670000' }}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar pessoa
                </button>
              </div>
            </div>

            {/* Notas pastorais */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={labelStyle}>
                Notas pastorais
              </label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Observações, contexto pastoral..."
                rows={3}
                disabled={isPending}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                style={inputStyle}
              />
            </div>

            {/* Seção de cancelamento — só no modo edição */}
            {editEvent && (
              <div
                className="rounded-xl p-3 space-y-3"
                style={{ background: '#FDF2F2', border: '1px solid #FECACA' }}
              >
                {!showCancelSection ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelSection(true)}
                    disabled={isPending || isCancelling}
                    className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ color: '#670000' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Cancelar este compromisso
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#670000' }} />
                      <span className="text-sm font-semibold" style={{ color: '#670000' }}>
                        Confirmar cancelamento?
                      </span>
                    </div>
                    <textarea
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      placeholder="Motivo (opcional)"
                      rows={2}
                      disabled={isCancelling}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={{ background: '#fff', border: '1px solid #FECACA', color: 'var(--text-primary)' }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isCancelling}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
                        style={{ background: '#670000' }}
                      >
                        {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelSection(false)}
                        disabled={isCancelling}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* F1-D: Aviso de conflito de horário */}
            {conflictWarning && (
              <div
                className="rounded-xl p-4"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
                      Conflito de horário detectado
                    </p>
                    <p className="text-sm mt-1" style={{ color: '#78350F' }}>
                      Já existe{' '}
                      <span className="font-semibold">"{conflictWarning.title}"</span>{' '}
                      nesse período ({conflictWarning.timeLabel}).
                      Deseja salvar mesmo assim?
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Erro geral */}
            {error && (
              <p className="text-sm font-medium" style={{ color: '#e13500' }}>
                {error}
              </p>
            )}
          </div>

          {/* ── Footer — normal ou confirmação de conflito ── */}
          <div
            className="p-4 flex-shrink-0 flex items-center justify-end gap-2"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            {conflictWarning ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setConflictWarning(null); setPendingPayload(null) }}
                  disabled={isPending}
                >
                  Voltar ao formulário
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isPending}
                >
                  {isPending ? 'Salvando...' : 'Salvar mesmo assim'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? 'Salvando...'
                    : editEvent
                      ? 'Salvar alterações'
                      : 'Criar compromisso'}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}
