import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAgenda, useCreateEvent, useDeleteEvent } from '@/features/agenda/hooks/useAgenda'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { EventType, ChurchEvent } from '@/lib/database.types'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

function eventTypeBadgeVariant(type: EventType): BadgeVariant {
  const map: Record<EventType, BadgeVariant> = {
    culto: 'blue',
    reuniao: 'gray',
    celula: 'green',
    retiro: 'purple',
    conferencia: 'yellow',
    treinamento: 'green',
    outro: 'gray',
  }
  return map[type]
}

function eventTypeLabel(type: EventType): string {
  const map: Record<EventType, string> = {
    culto: 'Culto',
    reuniao: 'Reunião',
    celula: 'Célula',
    retiro: 'Retiro',
    conferencia: 'Conferência',
    treinamento: 'Treinamento',
    outro: 'Outro',
  }
  return map[type]
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  return (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  )
}

interface DateBadgeProps {
  dateStr: string
}

function DateBadge({ dateStr }: DateBadgeProps) {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const today = isToday(dateStr)
  const tomorrow = isTomorrow(dateStr)

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl w-12 h-14 shrink-0 ${
        today
          ? 'bg-brand-600 text-white'
          : 'bg-gray-100 text-gray-700'
      }`}
    >
      <span className={`text-lg font-bold leading-tight ${today ? 'text-white' : 'text-gray-900'}`}>{day}</span>
      <span className={`text-xs uppercase ${today ? 'text-blue-100' : 'text-gray-500'}`}>{month}</span>
      {tomorrow && !today && (
        <span className="text-xs text-orange-500 font-medium">amanhã</span>
      )}
    </div>
  )
}

interface EventItemProps {
  event: ChurchEvent
  onDelete: (event: ChurchEvent) => void
}

function EventItem({ event, onDelete }: EventItemProps) {
  const today = isToday(event.start_datetime)
  const time = new Date(event.start_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <DateBadge dateStr={event.start_datetime} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-900">{event.title}</h3>
          {today && (
            <span className="text-xs font-medium text-white bg-green-500 rounded-full px-2 py-0.5">Hoje</span>
          )}
          <Badge label={eventTypeLabel(event.event_type)} variant={eventTypeBadgeVariant(event.event_type)} />
          {!event.is_public && (
            <Badge label="Privado" variant="gray" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
          <span>{time}</span>
          {event.location && <span>· {event.location}</span>}
          {event.description && <span className="truncate max-w-xs">· {event.description}</span>}
        </div>
      </div>
      <button
        onClick={() => onDelete(event)}
        className="text-xs text-red-400 hover:text-red-600 font-medium shrink-0"
      >
        Excluir
      </button>
    </div>
  )
}

interface CreateEventModalProps {
  open: boolean
  onClose: () => void
  churchId: string
}

function CreateEventModal({ open, onClose, churchId }: CreateEventModalProps) {
  const createEvent = useCreateEvent()
  const [form, setForm] = useState({
    title: '',
    event_type: 'culto' as EventType,
    start_datetime: '',
    end_datetime: '',
    location: '',
    description: '',
    is_public: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.start_datetime) return
    setSubmitting(true)
    setError(null)
    try {
      await createEvent.mutateAsync({
        church_id: churchId,
        title: form.title.trim(),
        event_type: form.event_type,
        start_datetime: new Date(form.start_datetime).toISOString(),
        end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        is_public: form.is_public,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar evento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo Evento">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
          <Input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Ex: Culto de Domingo"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
          <select
            value={form.event_type}
            onChange={(e) => setForm((p) => ({ ...p, event_type: e.target.value as EventType }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
          >
            <option value="culto">Culto</option>
            <option value="reuniao">Reunião</option>
            <option value="celula">Célula</option>
            <option value="retiro">Retiro</option>
            <option value="conferencia">Conferência</option>
            <option value="treinamento">Treinamento</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Início *</label>
            <Input
              type="datetime-local"
              value={form.start_datetime}
              onChange={(e) => setForm((p) => ({ ...p, start_datetime: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fim (opcional)</label>
            <Input
              type="datetime-local"
              value={form.end_datetime}
              onChange={(e) => setForm((p) => ({ ...p, end_datetime: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
          <Input
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="Ex: Templo principal, Sala 3..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Informações adicionais..."
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_public"
            checked={form.is_public}
            onChange={(e) => setForm((p) => ({ ...p, is_public: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="is_public" className="text-sm text-gray-700">Evento público</label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.title.trim() || !form.start_datetime}>
            {submitting ? 'Criando...' : 'Criar Evento'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Agenda() {
  const { churchId } = useAuth()
  const [upcoming, setUpcoming] = useState(true)
  const [filterType, setFilterType] = useState<EventType | ''>('')
  const [createOpen, setCreateOpen] = useState(false)
  const deleteEvent = useDeleteEvent()

  const {
    data: events,
    isLoading,
    isError,
    refetch,
  } = useAgenda(
    churchId ?? '',
    {
      upcoming,
      type: filterType || undefined,
    }
  )

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  async function handleDelete(event: ChurchEvent) {
    if (!confirm(`Excluir "${event.title}"?`)) return
    await deleteEvent.mutateAsync({ id: event.id, churchId: churchId! })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">
            {events ? `${events.length} evento${events.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Novo Evento</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          <button
            onClick={() => setUpcoming(true)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${upcoming ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Próximos
          </button>
          <button
            onClick={() => setUpcoming(false)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${!upcoming ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Todos
          </button>
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as EventType | '')}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Todos os tipos</option>
          <option value="culto">Culto</option>
          <option value="reuniao">Reunião</option>
          <option value="celula">Célula</option>
          <option value="retiro">Retiro</option>
          <option value="conferencia">Conferência</option>
          <option value="treinamento">Treinamento</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState message="Não foi possível carregar os eventos." onRetry={() => void refetch()} />
      ) : (events ?? []).length === 0 ? (
        <EmptyState
          title={upcoming ? 'Nenhum evento próximo' : 'Nenhum evento cadastrado'}
          description={upcoming ? 'Todos os eventos foram realizados ou nenhum foi criado.' : 'Crie o primeiro evento clicando em "Novo Evento".'}
          action={<Button onClick={() => setCreateOpen(true)}>+ Novo Evento</Button>}
        />
      ) : (
        <div className="space-y-3">
          {(events ?? []).map((event) => (
            <EventItem key={event.id} event={event} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <CreateEventModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          churchId={churchId}
        />
      )}
    </div>
  )
}
