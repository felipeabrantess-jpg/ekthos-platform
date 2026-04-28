/**
 * EventForm.tsx — Modal drawer para criar / editar eventos
 *
 * Suporta todos os campos novos: recorrência, escopo, ministério,
 * online, all_day, cor.
 */

import { useState, useEffect } from 'react'
import { X, Repeat, Globe } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  useCreateEvent,
  useUpdateEvent,
  type ChurchEventFull,
  type RecurrenceType,
  type RecurrenceEndType,
  type EventScope,
  type CreateEventInput,
} from '@/features/agenda/hooks/useEvents'
import type { EventType } from '@/lib/types/joins'

interface EventFormProps {
  open: boolean
  onClose: () => void
  editEvent?: ChurchEventFull | null
}

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'culto',       label: 'Culto'         },
  { value: 'celula',      label: 'Célula'        },
  { value: 'reuniao',     label: 'Reunião'       },
  { value: 'retiro',      label: 'Retiro'        },
  { value: 'conferencia', label: 'Conferência'   },
  { value: 'batismo',     label: 'Batismo'       },
  { value: 'casamento',   label: 'Casamento'     },
  { value: 'treinamento', label: 'Treinamento'   },
  { value: 'social',      label: 'Social'        },
  { value: 'outro',       label: 'Outro'         },
]

const SCOPES: { value: EventScope; label: string }[] = [
  { value: 'geral',      label: 'Toda a Igreja'  },
  { value: 'ministerio', label: 'Ministério'      },
  { value: 'celula',     label: 'Célula'          },
  { value: 'lideranca',  label: 'Liderança'       },
]

const RECURRENCE_TYPES: { value: RecurrenceType; label: string }[] = [
  { value: 'none',      label: 'Não se repete'   },
  { value: 'daily',     label: 'Diariamente'      },
  { value: 'weekly',    label: 'Semanalmente'     },
  { value: 'biweekly',  label: 'Quinzenalmente'  },
  { value: 'monthly',   label: 'Mensalmente'      },
  { value: 'yearly',    label: 'Anualmente'       },
]

const COLOR_OPTIONS = [
  '#7C3AED', // brand purple
  '#2563EB', // blue
  '#059669', // green
  '#DC2626', // red
  '#D97706', // amber
  '#DB2777', // pink
  '#0891B2', // cyan
  '#65A30D', // lime
]

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toLocalDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

interface FormState {
  title: string
  event_type: EventType
  scope: EventScope
  ministry_id: string
  start_datetime: string
  end_datetime: string
  all_day: boolean
  location: string
  is_online: boolean
  online_link: string
  description: string
  is_public: boolean
  color: string
  recurrence_type: RecurrenceType
  recurrence_interval: number
  recurrence_end_type: RecurrenceEndType
  recurrence_until: string
  recurrence_count: number
}

function buildInitialForm(ev?: ChurchEventFull | null): FormState {
  if (ev) {
    return {
      title:               ev.title,
      event_type:          ev.event_type,
      scope:               ev.scope ?? 'geral',
      ministry_id:         ev.ministry_id ?? '',
      start_datetime:      toLocalDatetime(ev.start_datetime),
      end_datetime:        toLocalDatetime(ev.end_datetime),
      all_day:             ev.all_day ?? false,
      location:            ev.location ?? '',
      is_online:           ev.is_online ?? false,
      online_link:         ev.online_link ?? '',
      description:         ev.description ?? '',
      is_public:           ev.is_public ?? true,
      color:               ev.color ?? '#7C3AED',
      recurrence_type:     ev.recurrence_type ?? 'none',
      recurrence_interval: ev.recurrence_interval ?? 1,
      recurrence_end_type: ev.recurrence_end_type ?? 'never',
      recurrence_until:    toLocalDate(ev.recurrence_until),
      recurrence_count:    ev.recurrence_count ?? 1,
    }
  }
  const now = new Date()
  now.setMinutes(0, 0, 0)
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return {
    title:               '',
    event_type:          'culto',
    scope:               'geral',
    ministry_id:         '',
    start_datetime:      toLocalDatetime(now.toISOString()),
    end_datetime:        toLocalDatetime(later.toISOString()),
    all_day:             false,
    location:            '',
    is_online:           false,
    online_link:         '',
    description:         '',
    is_public:           true,
    color:               '#7C3AED',
    recurrence_type:     'none',
    recurrence_interval: 1,
    recurrence_end_type: 'never',
    recurrence_until:    '',
    recurrence_count:    1,
  }
}

export default function EventForm({ open, onClose, editEvent }: EventFormProps) {
  const { churchId } = useAuth()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const [form, setForm] = useState<FormState>(() => buildInitialForm(editEvent))
  const [error, setError] = useState<string | null>(null)

  // Reset form when editEvent changes or modal opens
  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(editEvent))
      setError(null)
    }
  }, [open, editEvent])

  // Fetch ministries for scope=ministerio dropdown
  const { data: ministries = [] } = useQuery({
    queryKey: ['ministries_list', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ministries')
        .select('id, name')
        .eq('church_id', churchId!)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    enabled: Boolean(churchId) && open,
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!churchId) return
    setError(null)

    const payload: CreateEventInput = {
      church_id:      churchId,
      title:          form.title.trim(),
      event_type:     form.event_type,
      scope:          form.scope,
      ministry_id:    form.scope === 'ministerio' && form.ministry_id ? form.ministry_id : null,
      start_datetime: new Date(form.start_datetime).toISOString(),
      end_datetime:   form.end_datetime ? new Date(form.end_datetime).toISOString() : null,
      all_day:        form.all_day,
      location:       form.location.trim() || null,
      is_online:      form.is_online,
      online_link:    form.is_online && form.online_link ? form.online_link.trim() : null,
      description:    form.description.trim() || null,
      is_public:      form.is_public,
      color:          form.color,
      recurrence_type: form.recurrence_type,
      recurrence_interval: form.recurrence_type !== 'none' ? form.recurrence_interval : null,
      recurrence_end_type: form.recurrence_type !== 'none' ? form.recurrence_end_type : null,
      recurrence_until:
        form.recurrence_type !== 'none' && form.recurrence_end_type === 'until' && form.recurrence_until
          ? form.recurrence_until
          : null,
      recurrence_count:
        form.recurrence_type !== 'none' && form.recurrence_end_type === 'count'
          ? form.recurrence_count
          : null,
    }

    try {
      if (editEvent) {
        await updateEvent.mutateAsync({ id: editEvent.id, ...payload })
      } else {
        await createEvent.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar evento')
    }
  }

  const isPending = createEvent.isPending || updateEvent.isPending
  const hasRecurrence = form.recurrence_type !== 'none'

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-ekthos-black">
            {editEvent ? 'Editar Evento' : 'Novo Evento'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={e => { void handleSubmit(e) }} className="p-4 space-y-5">
          {/* Title */}
          <Input
            label="Título *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Ex: Culto de Domingo"
            required
          />

          {/* Type + Scope */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ekthos-black mb-1.5">Tipo *</label>
              <select
                value={form.event_type}
                onChange={e => set('event_type', e.target.value as EventType)}
                className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                required
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ekthos-black mb-1.5">Público-alvo</label>
              <select
                value={form.scope}
                onChange={e => set('scope', e.target.value as EventScope)}
                className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {SCOPES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ministry (only if scope = ministerio) */}
          {form.scope === 'ministerio' && (
            <div>
              <label className="block text-sm font-medium text-ekthos-black mb-1.5">Ministério</label>
              <select
                value={form.ministry_id}
                onChange={e => set('ministry_id', e.target.value)}
                className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="">Selecionar ministério...</option>
                {ministries.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* All Day toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="all_day"
              checked={form.all_day}
              onChange={e => set('all_day', e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="all_day" className="text-sm font-medium text-ekthos-black">Dia inteiro</label>
          </div>

          {/* Date / Time */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={form.all_day ? 'Data de início *' : 'Início *'}
              type={form.all_day ? 'date' : 'datetime-local'}
              value={form.all_day ? form.start_datetime.slice(0, 10) : form.start_datetime}
              onChange={e => set('start_datetime', e.target.value)}
              required
            />
            <Input
              label={form.all_day ? 'Data de fim' : 'Fim'}
              type={form.all_day ? 'date' : 'datetime-local'}
              value={form.all_day ? form.end_datetime.slice(0, 10) : form.end_datetime}
              onChange={e => set('end_datetime', e.target.value)}
            />
          </div>

          {/* Location */}
          <div className="relative">
            <Input
              label="Local"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Ex: Templo Principal, Sala 3..."
            />
          </div>

          {/* Online */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_online"
                checked={form.is_online}
                onChange={e => set('is_online', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_online" className="text-sm font-medium text-ekthos-black flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Evento online
              </label>
            </div>
            {form.is_online && (
              <Input
                label="Link do evento online"
                value={form.online_link}
                onChange={e => set('online_link', e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ekthos-black mb-1.5">
              Descrição
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Informações adicionais sobre o evento..."
              className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm placeholder-gray-400 bg-white shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
            />
          </div>

          {/* Public + Color */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_public"
                checked={form.is_public}
                onChange={e => set('is_public', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_public" className="text-sm font-medium text-ekthos-black">Público</label>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-ekthos-black">Cor</label>
              <div className="flex gap-1.5">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c ? 'border-ekthos-black scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div className="border border-black/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-brand-600" />
              <label className="text-sm font-semibold text-ekthos-black">Recorrência</label>
            </div>

            <div>
              <select
                value={form.recurrence_type}
                onChange={e => set('recurrence_type', e.target.value as RecurrenceType)}
                className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {RECURRENCE_TYPES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {hasRecurrence && (
              <>
                {/* Interval */}
                {form.recurrence_type !== 'biweekly' && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600 shrink-0">A cada</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={form.recurrence_interval}
                      onChange={e => set('recurrence_interval', Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 rounded-xl border border-black/10 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    <span className="text-sm text-gray-600">
                      {form.recurrence_type === 'daily'   ? (form.recurrence_interval === 1 ? 'dia' : 'dias') :
                       form.recurrence_type === 'weekly'  ? (form.recurrence_interval === 1 ? 'semana' : 'semanas') :
                       form.recurrence_type === 'monthly' ? (form.recurrence_interval === 1 ? 'mês' : 'meses') :
                       (form.recurrence_interval === 1 ? 'ano' : 'anos')}
                    </span>
                  </div>
                )}

                {/* End type */}
                <div>
                  <label className="block text-sm font-medium text-ekthos-black mb-2">Termina</label>
                  <div className="space-y-2">
                    {(['never', 'until', 'count'] as RecurrenceEndType[]).map(et => (
                      <label key={et} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="recurrence_end_type"
                          value={et}
                          checked={form.recurrence_end_type === et}
                          onChange={() => set('recurrence_end_type', et)}
                          className="text-brand-600"
                        />
                        <span className="text-sm text-gray-700">
                          {et === 'never' ? 'Nunca' : et === 'until' ? 'Em uma data' : 'Após N ocorrências'}
                        </span>
                        {et === 'until' && form.recurrence_end_type === 'until' && (
                          <input
                            type="date"
                            value={form.recurrence_until}
                            onChange={e => set('recurrence_until', e.target.value)}
                            className="rounded-xl border border-black/10 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                          />
                        )}
                        {et === 'count' && form.recurrence_end_type === 'count' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={365}
                              value={form.recurrence_count}
                              onChange={e => set('recurrence_count', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20 rounded-xl border border-black/10 px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-600"
                            />
                            <span className="text-sm text-gray-600">vezes</span>
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isPending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={isPending || !form.title.trim() || !form.start_datetime}
              className="flex-1"
            >
              {editEvent ? 'Salvar Alterações' : 'Criar Evento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
