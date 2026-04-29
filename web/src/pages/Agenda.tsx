/**
 * Agenda.tsx — Calendário principal com FullCalendar v6
 *
 * Views: Mês (dayGridMonth) | Semana (timeGridWeek) | Lista (listWeek)
 * Mobile padrão: listMonth
 * Filtro: ministério
 * Click: abre EventDetailModal
 * Novo evento / Gerenciar Eventos: botões no header
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import { Calendar, Plus, List, LayoutGrid, Rows3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EventDetailModal from '@/components/agenda/EventDetailModal'
import EventForm from '@/pages/events/EventForm'
import {
  useEventOccurrences,
  type EventOccurrence,
  type ChurchEventFull,
} from '@/features/agenda/hooks/useEvents'

// ── View types ────────────────────────────────────────────────────────────────

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'listWeek'

const VIEW_BUTTONS: { view: CalendarView; icon: React.ReactNode; label: string }[] = [
  { view: 'dayGridMonth', icon: <LayoutGrid className="w-4 h-4" />, label: 'Mês'   },
  { view: 'timeGridWeek', icon: <Rows3      className="w-4 h-4" />, label: 'Semana' },
  { view: 'listWeek',     icon: <List       className="w-4 h-4" />, label: 'Lista'  },
]

// ── Helper: initial range (current month ±1) ─────────────────────────────────
function initialRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to   = new Date(now.getFullYear(), now.getMonth() + 3, 0)
  return { from, to }
}

// ── Calendar CSS overrides (inlined) ─────────────────────────────────────────
const calendarStyles = `
  .fc { font-family: 'DM Sans', sans-serif; }
  .fc .fc-button {
    background: transparent !important;
    border: none !important;
    color: var(--text-primary) !important;
    box-shadow: none !important;
    font-size: 0.875rem !important;
  }
  .fc .fc-button:hover { background: var(--bg-hover) !important; border-radius: 0.5rem; }
  .fc .fc-button-primary:not(.fc-button-active) { padding: 0.375rem 0.625rem !important; }
  .fc .fc-toolbar-title { font-size: 1.1rem !important; font-weight: 700 !important; color: var(--text-primary); }
  .fc .fc-daygrid-day.fc-day-today { background: var(--bg-hover) !important; }
  .fc .fc-daygrid-day-number { color: var(--text-primary); font-size: 0.8rem; }
  .fc .fc-col-header-cell-cushion { color: var(--text-secondary); font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .fc .fc-event { border-radius: 6px !important; border: none !important; padding: 1px 4px !important; font-size: 0.75rem !important; cursor: pointer; }
  .fc .fc-event:hover { opacity: 0.85; }
  .fc .fc-list-event:hover td { background: var(--bg-hover) !important; cursor: pointer; }
  .fc .fc-list-day-cushion { background: var(--bg-surface) !important; }
  .fc .fc-timegrid-event { border-radius: 6px !important; border: none !important; }
  .fc .fc-scrollgrid { border-radius: 1rem; overflow: hidden; }
  .fc .fc-scrollgrid td, .fc .fc-scrollgrid th { border-color: var(--border-default) !important; }
`

// ── Main component ────────────────────────────────────────────────────────────

export default function Agenda() {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const [currentView, setCurrentView] = useState<CalendarView>(
    isMobile ? 'listWeek' : 'dayGridMonth'
  )
  const [calendarRange, setCalendarRange] = useState(initialRange)
  const [ministryFilter, setMinistryFilter] = useState<string>('')
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventOccurrence | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ChurchEventFull | null>(null)

  // Ministries for filter dropdown
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
    enabled: Boolean(churchId),
  })

  // Occurrences for the visible calendar range
  const {
    data: occurrences = [],
    isLoading,
  } = useEventOccurrences(
    churchId ?? '',
    calendarRange.from,
    calendarRange.to,
    ministryFilter || null,
  )

  // Map occurrences → FullCalendar EventInput
  const fcEvents = occurrences.map(occ => ({
    id: occ.id,
    title: occ.override_title ?? occ.church_events?.title ?? 'Evento',
    start: occ.start_datetime,
    end: occ.end_datetime ?? undefined,
    allDay: occ.church_events?.all_day ?? false,
    backgroundColor: occ.church_events?.color ?? 'var(--color-primary)',
    borderColor: 'transparent',
    textColor: '#ffffff',
    extendedProps: { occurrence: occ },
  }))

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setCalendarRange({ from: arg.start, to: arg.end })
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const occ = arg.event.extendedProps.occurrence as EventOccurrence
    setSelectedOccurrence(occ)
  }, [])

  function switchView(view: CalendarView) {
    setCurrentView(view)
    calendarRef.current?.getApi().changeView(view)
  }

  function handleEdit(ev: ChurchEventFull) {
    setSelectedOccurrence(null)
    setEditingEvent(ev)
    setFormOpen(true)
  }

  function handleCreate() {
    setEditingEvent(null)
    setFormOpen(true)
  }

  if (!churchId) return null

  return (
    <div className="space-y-4">
      <style>{calendarStyles}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
            <Calendar className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Eventos</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Calendário da igreja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/eventos')}
            className="text-xs"
          >
            Gerenciar
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Novo Evento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      {/* Controls: view toggle + ministry filter */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View switcher */}
        <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid var(--border-default)' }}>
          {VIEW_BUTTONS.map(({ view, icon, label }) => (
            <button
              key={view}
              onClick={() => switchView(view)}
              title={label}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={currentView === view
                ? { background: 'var(--color-primary)', color: '#fff' }
                : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
              }
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Ministry filter */}
        {ministries.length > 0 && (
          <select
            value={ministryFilter}
            onChange={e => setMinistryFilter(e.target.value)}
            className="rounded-xl px-3 py-2 text-xs focus:outline-none"
          style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
          >
            <option value="">Todos os ministérios</option>
            {ministries.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        {isLoading && <Spinner size="sm" />}
      </div>

      {/* Calendar */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  '',
          }}
          events={fcEvents}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="auto"
          dayMaxEvents={3}
          moreLinkText={(n) => `+${n} mais`}
          noEventsText="Nenhum evento neste período"
          listDayFormat={{ weekday: 'long', day: '2-digit', month: 'long' }}
          listDaySideFormat={false}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          slotMinTime="07:00:00"
          slotMaxTime="23:00:00"
          allDayText="Dia inteiro"
          fixedWeekCount={false}
        />
      </div>

      {/* Event detail modal */}
      <EventDetailModal
        occurrence={selectedOccurrence}
        onClose={() => setSelectedOccurrence(null)}
        onEdit={handleEdit}
      />

      {/* Create / Edit form */}
      <EventForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingEvent(null) }}
        editEvent={editingEvent}
      />
    </div>
  )
}
