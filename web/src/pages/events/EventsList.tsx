/**
 * EventsList.tsx — Lista CRUD de eventos pai (/eventos)
 *
 * Permite criar, editar e excluir church_events (eventos recorrentes).
 * Acesso a partir do botão "Gerenciar Eventos" na Agenda ou via sidebar.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, Plus, Pencil, Trash2, Repeat, ChevronLeft, MapPin, Globe
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import {
  useEvents,
  useDeleteEvent,
  type ChurchEventFull,
} from '@/features/agenda/hooks/useEvents'
import EventForm from '@/pages/events/EventForm'

const EVENT_TYPE_LABELS: Record<string, string> = {
  culto: 'Culto', celula: 'Célula', reuniao: 'Reunião', retiro: 'Retiro',
  conferencia: 'Conferência', batismo: 'Batismo', casamento: 'Casamento',
  treinamento: 'Treinamento', social: 'Social', outro: 'Outro',
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: '', daily: 'Diário', weekly: 'Semanal',
  biweekly: 'Quinzenal', monthly: 'Mensal', yearly: 'Anual',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface EventRowProps {
  event: ChurchEventFull
  onEdit: (ev: ChurchEventFull) => void
  onDelete: (ev: ChurchEventFull) => void
}

function EventRow({ event, onEdit, onDelete }: EventRowProps) {
  const hasRecurrence = event.recurrence_type && event.recurrence_type !== 'none'
  return (
    <div className="bg-white rounded-2xl border border-black/10 p-4 flex gap-3">
      {/* Color strip */}
      <div
        className="w-1 rounded-full shrink-0 self-stretch"
        style={{ backgroundColor: event.color ?? '#7C3AED' }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ekthos-black text-sm truncate">{event.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded-lg font-medium">
                {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
              </span>
              {hasRecurrence && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  {RECURRENCE_LABELS[event.recurrence_type!]}
                </span>
              )}
              {event.is_online && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Online
                </span>
              )}
              {!event.is_public && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">Privado</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(event)}
              className="p-2 rounded-lg hover:bg-cream transition-colors text-gray-400 hover:text-brand-600"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(event)}
              className="p-2 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(event.start_datetime)}
            {!event.all_day && event.start_datetime && (
              <> · {formatTime(event.start_datetime)}</>
            )}
          </span>
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {event.location}
            </span>
          )}
        </div>

        {event.description && (
          <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">{event.description}</p>
        )}
      </div>
    </div>
  )
}

export default function EventsList() {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ChurchEventFull | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<ChurchEventFull | null>(null)

  const { data: events = [], isLoading } = useEvents(churchId ?? '')
  const deleteEvent = useDeleteEvent()

  function handleEdit(ev: ChurchEventFull) {
    setEditingEvent(ev)
    setFormOpen(true)
  }

  function handleCreate() {
    setEditingEvent(null)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!deletingEvent || !churchId) return
    await deleteEvent.mutateAsync({ id: deletingEvent.id, churchId })
    setDeletingEvent(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/agenda')}
            className="p-2 rounded-xl hover:bg-cream transition-colors text-gray-400 hover:text-ekthos-black"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
            <Calendar className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ekthos-black">Eventos</h1>
            <p className="text-sm text-gray-500">Gerencie todos os eventos da igreja</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Novo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-black/10 p-4 text-center">
          <p className="text-2xl font-bold text-ekthos-black">{events.length}</p>
          <p className="text-xs text-gray-400 mt-1">Total de eventos</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/10 p-4 text-center">
          <p className="text-2xl font-bold text-ekthos-black">
            {events.filter(e => e.recurrence_type && e.recurrence_type !== 'none').length}
          </p>
          <p className="text-xs text-gray-400 mt-1">Recorrentes</p>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-4">Nenhum evento cadastrado ainda.</p>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-1" /> Criar primeiro evento
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => (
            <EventRow key={ev.id} event={ev} onEdit={handleEdit} onDelete={setDeletingEvent} />
          ))}
        </div>
      )}

      {/* EventForm modal */}
      <EventForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingEvent(null) }}
        editEvent={editingEvent}
      />

      {/* Delete confirmation modal */}
      {deletingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeletingEvent(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-ekthos-black">Excluir evento</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir <strong>"{deletingEvent.title}"</strong>?
              Todas as ocorrências futuras também serão removidas.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeletingEvent(null)}
                className="flex-1"
                disabled={deleteEvent.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => { void confirmDelete() }}
                loading={deleteEvent.isPending}
                disabled={deleteEvent.isPending}
                className="flex-1 !bg-red-600 hover:!bg-red-700"
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
