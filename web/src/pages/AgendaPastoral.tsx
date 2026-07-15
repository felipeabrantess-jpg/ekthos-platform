/**
 * AgendaPastoral.tsx — Calendário privado de compromissos pastorais
 *
 * Acesso: admin + secretary (RoleRoute + RLS is_pastoral=true)
 * Dados: church_events WHERE is_pastoral=true (sem event_occurrences — compromissos são pontuais)
 * Views: Mês | Semana | Lista (FullCalendar v6)
 * Click: painel lateral com detalhes (read-only até F1-C)
 * CRUD: F1-C (próxima etapa)
 * Alertas WhatsApp: Fase 2
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import { CalendarCheck, Plus, List, LayoutGrid, Rows3, Lock, X, User } from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePastoralEvents } from '@/features/agenda/hooks/usePastoralEvents'
import type { ChurchEventFull } from '@/features/agenda/hooks/useEvents'

// ── Constants ─────────────────────────────────────────────────────────────────

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'listWeek'

const CATEGORY_COLORS: Record<string, string> = {
  visita:      '#2B6CB0',
  conselheria: '#6B46C1',
  reuniao:     '#C4841D',
  viagem:      '#2D7A4F',
  outro:       '#670000',
}
const DEFAULT_COLOR = '#670000'

const CATEGORY_LABELS: Record<string, string> = {
  visita:      'Visita',
  conselheria: 'Conselheria',
  reuniao:     'Reunião',
  viagem:      'Viagem',
  outro:       'Outro',
}

const VIEW_BUTTONS: { view: CalendarView; icon: React.ReactNode; label: string }[] = [
  { view: 'dayGridMonth', icon: <LayoutGrid className="w-4 h-4" />, label: 'Mês'    },
  { view: 'timeGridWeek', icon: <Rows3      className="w-4 h-4" />, label: 'Semana' },
  { view: 'listWeek',     icon: <List       className="w-4 h-4" />, label: 'Lista'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function initialRange() {
  const now = new Date()
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to:   new Date(now.getFullYear(), now.getMonth() + 3, 0),
  }
}

function categoryColor(cat: string | null | undefined): string {
  if (!cat) return DEFAULT_COLOR
  return CATEGORY_COLORS[cat] ?? DEFAULT_COLOR
}

function formatDatetimeBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function formatTimeBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Calendar CSS (mesmo padrão de Agenda.tsx) ─────────────────────────────────

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

export default function AgendaPastoral() {
  const { churchId } = useAuth()
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null)

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
  const [selectedEvent, setSelectedEvent] = useState<ChurchEventFull | null>(null)
  const [showComingSoon, setShowComingSoon] = useState(false)

  const { data: pastoralEvents = [], isLoading } = usePastoralEvents(
    churchId ?? '',
    calendarRange.from,
    calendarRange.to,
  )

  const fcEvents = pastoralEvents.map(ev => ({
    id:              ev.id,
    title:           ev.title,
    start:           ev.start_datetime,
    end:             ev.end_datetime ?? undefined,
    allDay:          ev.all_day,
    backgroundColor: categoryColor(ev.pastoral_category),
    borderColor:     'transparent',
    textColor:       '#ffffff',
    extendedProps:   { event: ev },
  }))

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setCalendarRange({ from: arg.start, to: arg.end })
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    setSelectedEvent(arg.event.extendedProps.event as ChurchEventFull)
  }, [])

  function switchView(view: CalendarView) {
    setCurrentView(view)
    calendarRef.current?.getApi().changeView(view)
  }

  if (!churchId) return null

  const ev = selectedEvent

  return (
    <div className="space-y-4">
      <style>{calendarStyles}</style>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#F5E0E0' }}
          >
            <CalendarCheck className="w-5 h-5" style={{ color: '#670000' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="font-display text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Agenda Pastoral
              </h1>
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#F5E0E0', color: '#670000' }}
              >
                <Lock className="w-3 h-3" />
                Privado
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Compromissos pastorais — visível apenas para admins
            </p>
          </div>
        </div>

        <Button onClick={() => setShowComingSoon(true)}>
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Novo compromisso</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      {/* ── View toggle + legenda ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex rounded-xl overflow-hidden shrink-0"
          style={{ border: '1px solid var(--border-default)' }}
        >
          {VIEW_BUTTONS.map(({ view, icon, label }) => (
            <button
              key={view}
              onClick={() => switchView(view)}
              title={label}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={
                currentView === view
                  ? { background: '#670000', color: '#fff' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
              }
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Category legend (desktop only) */}
        <div className="hidden md:flex items-center gap-4 flex-wrap">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: categoryColor(key) }}
              />
              {label}
            </span>
          ))}
        </div>

        {isLoading && <Spinner size="sm" />}
      </div>

      {/* ── Calendar ── */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          events={fcEvents}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="auto"
          dayMaxEvents={3}
          moreLinkText={(n) => `+${n} mais`}
          noEventsText="Nenhum compromisso pastoral neste período"
          listDayFormat={{ weekday: 'long', day: '2-digit', month: 'long' }}
          listDaySideFormat={false}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          slotMinTime="07:00:00"
          slotMaxTime="23:00:00"
          allDayText="Dia inteiro"
          fixedWeekCount={false}
        />
      </div>

      {/* ── Overlay + Detail panel ── */}
      {ev && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setSelectedEvent(null)}
          />
          <div
            className="fixed inset-y-0 right-0 w-80 max-w-full z-50 flex flex-col shadow-2xl"
            style={{
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-default)',
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between p-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-default)' }}
            >
              <h2
                className="font-semibold text-base"
                style={{ color: 'var(--text-primary)' }}
              >
                Compromisso pastoral
              </h2>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Title */}
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Título
                </span>
                <p
                  className="mt-1 font-semibold text-base"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ev.title}
                </p>
              </div>

              {/* Date / time */}
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Data e horário
                </span>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {formatDatetimeBR(ev.start_datetime)}
                  {ev.end_datetime && (
                    <> — {formatTimeBR(ev.end_datetime)}</>
                  )}
                </p>
              </div>

              {/* Category */}
              {ev.pastoral_category && (
                <div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Categoria
                  </span>
                  <div className="mt-1">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                      style={{ background: categoryColor(ev.pastoral_category) }}
                    >
                      {CATEGORY_LABELS[ev.pastoral_category] ?? ev.pastoral_category}
                    </span>
                  </div>
                </div>
              )}

              {/* Location */}
              {ev.location && (
                <div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Local
                  </span>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {ev.location}
                  </p>
                </div>
              )}

              {/* Pastoral notes */}
              {ev.pastoral_notes && (
                <div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Notas pastorais
                  </span>
                  <p
                    className="mt-1 text-sm whitespace-pre-wrap"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {ev.pastoral_notes}
                  </p>
                </div>
              )}

              {/* Linked members */}
              {ev.person_ids.length > 0 && (
                <div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Membros vinculados
                  </span>
                  <div
                    className="mt-1 flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-sm">
                      {ev.person_ids.length}{' '}
                      {ev.person_ids.length === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div
              className="p-4 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border-default)' }}
            >
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setShowComingSoon(true)}
              >
                Editar compromisso
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── "Coming soon" toast ── */}
      {showComingSoon && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Criação de compromissos disponível na próxima etapa (F1-C)
          </span>
          <button
            onClick={() => setShowComingSoon(false)}
            className="p-0.5 rounded flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
