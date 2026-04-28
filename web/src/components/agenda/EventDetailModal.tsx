/**
 * EventDetailModal.tsx — Modal exibido ao clicar num evento do calendário
 * Mostra detalhes da ocorrência + evento pai. Permite editar ou cancelar ocorrência.
 */

import { useState } from 'react'
import { X, MapPin, Clock, Globe, Repeat, Tag, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useCancelOccurrence, type EventOccurrence } from '@/features/agenda/hooks/useEvents'
import type { ChurchEventFull } from '@/features/agenda/hooks/useEvents'

interface EventDetailModalProps {
  occurrence: EventOccurrence | null
  onClose: () => void
  onEdit: (event: ChurchEventFull) => void
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  culto: 'Culto', celula: 'Célula', reuniao: 'Reunião', retiro: 'Retiro',
  conferencia: 'Conferência', batismo: 'Batismo', casamento: 'Casamento',
  treinamento: 'Treinamento', social: 'Social', outro: 'Outro',
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Não se repete', daily: 'Diariamente', weekly: 'Semanalmente',
  biweekly: 'Quinzenalmente', monthly: 'Mensalmente', yearly: 'Anualmente',
}

function formatDatetime(iso: string | null | undefined, allDay = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (allDay) return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function EventDetailModal({ occurrence, onClose, onEdit }: EventDetailModalProps) {
  const { churchId } = useAuth()
  const cancelOccurrence = useCancelOccurrence()
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  if (!occurrence) return null
  const ev = occurrence.church_events as ChurchEventFull | undefined

  const title    = occurrence.override_title ?? ev?.title ?? 'Evento'
  const location = occurrence.override_location ?? ev?.location
  const color    = ev?.color ?? '#7C3AED'

  async function handleCancel() {
    if (!churchId) return
    await cancelOccurrence.mutateAsync({
      occurrenceId: occurrence!.id,
      churchId,
      reason: cancelReason.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl">
        {/* Color bar */}
        <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: color }} />

        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {ev?.event_type && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-brand-50 text-brand-700">
                  {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                </span>
              )}
              {!ev?.is_public && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
                  Privado
                </span>
              )}
            </div>
            <h2 className="font-semibold text-ekthos-black text-lg leading-tight">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* Date/Time */}
          <div className="flex items-start gap-2.5 text-sm text-gray-600">
            <Clock className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
            <div>
              <p>{formatDatetime(occurrence.start_datetime, ev?.all_day)}</p>
              {occurrence.end_datetime && !ev?.all_day && (
                <p className="text-gray-400">até {formatTime(occurrence.end_datetime)}</p>
              )}
            </div>
          </div>

          {/* Location */}
          {location && (
            <div className="flex items-start gap-2.5 text-sm text-gray-600">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span>{location}</span>
            </div>
          )}

          {/* Online */}
          {ev?.is_online && (
            <div className="flex items-start gap-2.5 text-sm text-gray-600">
              <Globe className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              {ev.online_link ? (
                <a
                  href={ev.online_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline break-all"
                >
                  {ev.online_link}
                </a>
              ) : (
                <span>Evento online</span>
              )}
            </div>
          )}

          {/* Recurrence */}
          {ev?.recurrence_type && ev.recurrence_type !== 'none' && (
            <div className="flex items-center gap-2.5 text-sm text-gray-600">
              <Repeat className="w-4 h-4 shrink-0 text-gray-400" />
              <span>{RECURRENCE_LABELS[ev.recurrence_type] ?? ev.recurrence_type}</span>
            </div>
          )}

          {/* Description */}
          {ev?.description && (
            <div className="flex items-start gap-2.5 text-sm text-gray-600">
              <Tag className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <p className="whitespace-pre-wrap">{ev.description}</p>
            </div>
          )}

          {/* Cancel confirmation */}
          {cancelConfirm ? (
            <div className="border border-red-200 rounded-xl p-3 space-y-3 bg-red-50">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                Cancelar esta ocorrência?
              </div>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Motivo (opcional)..."
                rows={2}
                className="block w-full rounded-xl border border-red-200 px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setCancelConfirm(false)}
                  className="flex-1 text-xs"
                  disabled={cancelOccurrence.isPending}
                >
                  Voltar
                </Button>
                <Button
                  onClick={() => { void handleCancel() }}
                  loading={cancelOccurrence.isPending}
                  disabled={cancelOccurrence.isPending}
                  className="flex-1 text-xs !bg-red-600 hover:!bg-red-700"
                >
                  Confirmar cancelamento
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-2">
              {ev && (
                <Button
                  variant="secondary"
                  onClick={() => onEdit(ev)}
                  className="flex-1 text-xs"
                >
                  Editar evento
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setCancelConfirm(true)}
                className="flex-1 text-xs !border-red-200 !text-red-600 hover:!bg-red-50"
              >
                Cancelar ocorrência
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
